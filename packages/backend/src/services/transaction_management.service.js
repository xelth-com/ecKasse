const db = require('../db/knex');
const logger = require('../config/logger');
const loggingService = require('./logging.service');
const crypto = require('crypto');

/**
 * Manages the lifecycle of active transactions (orders/receipts).
 * This service handles creating orders, adding items, and finalizing them for fiscal logging.
 */
class TransactionManagementService {

  /**
   * Finds an existing active transaction based on metadata (e.g., table number) or creates a new one.
   * @param {object} criteria - Criteria to find the transaction (e.g., { transactionId: 123 } or { metadata: { table: 5 } }).
   * @param {number} userId - The ID of the user creating the transaction.
   * @returns {Promise<object>} The active transaction object.
   */
  async findOrCreateActiveTransaction(criteria, userId) {
    logger.info({ service: 'TransactionManagementService', function: 'findOrCreateActiveTransaction', criteria, userId });

    let existingTransaction = null;

    // Only attempt to find an existing transaction if a specific transactionId is provided
    if (criteria.transactionId) {
      existingTransaction = await db('active_transactions')
        .where({ id: criteria.transactionId, status: 'active' })
        .first();

      if (existingTransaction) {
        logger.info({ msg: 'Found existing active transaction by ID', id: existingTransaction.id });
        return existingTransaction;
      } else {
        logger.warn({ msg: 'Specified transaction not found or not active', transactionId: criteria.transactionId });
      }
    }

    // No specific transaction ID provided or specified transaction not found - create a new one
    logger.info('Creating a new transaction (no specific transactionId provided or specified transaction not found).');
    const newTransactionUUID = crypto.randomUUID();

    // Create the transaction record first
    const nowUTC = new Date().toISOString();
    const [newTransaction] = await db('active_transactions').insert({
      uuid: newTransactionUUID,
      status: 'active',
      user_id: userId,
      business_date: nowUTC.split('T')[0],
      metadata: JSON.stringify(criteria.metadata || {}),
      created_at: nowUTC,
      updated_at: nowUTC
    }).returning('*');

    // *** FISCAL LOG INTEGRATION ***
    // Every new transaction MUST be logged with a 'startTransaction' event.
    const fiscalLogResult = await loggingService.logFiscalEvent('startTransaction', userId, {
      transaction_uuid: newTransactionUUID,
      metadata: criteria.metadata || {}
    });

    if (!fiscalLogResult.success) {
      // If fiscal logging fails, clean up the transaction record and throw error
      await db('active_transactions').where('id', newTransaction.id).del();
      throw new Error(`Failed to create fiscal log for new transaction: ${fiscalLogResult.error}`);
    }

    logger.info({ msg: 'New active transaction created successfully', id: newTransaction.id, uuid: newTransaction.uuid });
    return newTransaction;
  }

  /**
   * Adds an item to an active transaction.
   * @param {number} transactionId - The ID of the active transaction.
   * @param {number} itemId - The ID of the item to add.
   * @param {number} quantity - The quantity of the item.
   * @param {object} options - Optional parameters like notes or modifiers.
   * @returns {Promise<object>} The updated active transaction object.
   */
  async addItemToTransaction(transactionId, itemId, quantity, userId, options = {}) {
    logger.info({ service: 'TransactionManagementService', function: 'addItemToTransaction', transactionId, itemId, quantity });

    let updatedTransaction, item;

    // Execute database transaction first
    const result = await db.transaction(async (trx) => {
        // 1. Fetch the active transaction and lock it for update.
        const transaction = await trx('active_transactions').where({ id: transactionId, status: 'active' }).forUpdate().first();
        if (!transaction) {
            throw new Error(`Active transaction with ID ${transactionId} not found.`);
        }

        // 2. Fetch the product details.
        item = await trx('items').where({ id: itemId }).first();
        if (!item) {
            throw new Error(`Item with ID ${itemId} not found.`);
        }
        
        // Simplified tax calculation logic. A real implementation would be more robust.
        const category = await trx('categories').where({ id: item.associated_category_unique_identifier }).first();
        // Assuming 19% for 'drink' and 7% for everything else as a placeholder.
        const taxRate = category.category_type === 'drink' ? 19.00 : 7.00;

        // 3. Calculate amounts for the new item.
        const unit_price = parseFloat(item.item_price_value);
        const total_price = unit_price * quantity;
        const tax_amount = total_price - (total_price / (1 + taxRate / 100));

        // 4. Insert the new item into the transaction.
        const [newItem] = await trx('active_transaction_items').insert({
            active_transaction_id: transactionId,
            item_id: itemId,
            quantity: quantity,
            unit_price: unit_price,
            total_price: total_price,
            tax_rate: taxRate,
            tax_amount: tax_amount,
            notes: options.notes || null
        }).returning('*');

        // 5. Update the main transaction totals.
        const newTotalAmount = parseFloat(transaction.total_amount) + total_price;
        const newTaxAmount = parseFloat(transaction.tax_amount) + tax_amount;

        updatedTransaction = (await trx('active_transactions').where({ id: transactionId }).update({
            total_amount: newTotalAmount,
            tax_amount: newTaxAmount,
            updated_at: new Date().toISOString()
        }).returning('*'))[0];

        const updatedItems = await trx('active_transaction_items').where({ active_transaction_id: transactionId });
        return { 
            transaction: updatedTransaction, 
            newItem, 
            items: updatedItems,
            total_price 
        };
    });

    // 6. *** FISCAL LOG INTEGRATION *** (outside database transaction to avoid connection pool issues)
    const fiscalLogResult = await loggingService.logFiscalEvent('updateTransaction', userId, {
        transaction_uuid: updatedTransaction.uuid,
        item_added: {
            item_id: itemId,
            name: JSON.parse(item.display_names).menu.de,
            quantity,
            total_price: result.total_price
        },
        new_total: updatedTransaction.total_amount
    });

    if (!fiscalLogResult.success) {
        // Log the error but don't fail the transaction since it's already committed
        logger.error({ msg: 'Failed to create fiscal log for item update (transaction already committed)', error: fiscalLogResult.error });
    }

    logger.info({ msg: 'Item added to transaction successfully', transactionId, itemId, newItemId: result.newItem.id });

    return { ...result.transaction, items: result.items };
  }

  /**
   * Finishes an active transaction, processing payment and triggering final fiscalization.
   * @param {number} transactionId - The ID of the active transaction to finish.
   * @param {object} paymentData - Information about the payment (e.g., { type: 'CASH', amount: 55.00 }).
   * @returns {Promise<object>} The result including the complete finished transaction with items.
   */
  async finishTransaction(transactionId, paymentData, userId) {
    logger.info({ service: 'TransactionManagementService', function: 'finishTransaction', transactionId, paymentData });

    let transaction, processData, finishedTransaction;

    // First phase: Update transaction status and prepare fiscal data in database transaction
    const updateResult = await db.transaction(async (trx) => {
      // 1. Fetch the active transaction and lock it.
      transaction = await trx('active_transactions').where({ id: transactionId, status: 'active' }).forUpdate().first();
      if (!transaction) {
        throw new Error(`Active transaction with ID ${transactionId} not found.`);
      }

      // 2. Verify payment amount.
      const totalAmount = parseFloat(transaction.total_amount);
      const paymentAmount = parseFloat(paymentData.amount);
      if (Math.abs(totalAmount - paymentAmount) > 0.001) { // Use a tolerance for float comparison
        throw new Error(`Payment amount (${paymentAmount}) does not match transaction total (${totalAmount}).`);
      }

      // 3. Fetch tax breakdown for this transaction.
      const taxBreakdown = await trx('active_transaction_items')
        .where({ active_transaction_id: transactionId })
        .groupBy('tax_rate')
        .select('tax_rate')
        .sum('total_price as total');

      // 4. Format 'processData' for DSFinV-K compliance.
      // This is a simplified version. A full implementation would map tax rates to the official DSFinV-K indices.
      const taxRatesOrder = [19.00, 7.00, 10.70, 5.50, 0.00]; // Simplified DSFinV-K order
      const bruttoSteuerumsaetze = taxRatesOrder.map(rate => {
        const found = taxBreakdown.find(b => parseFloat(b.tax_rate) === rate);
        return found ? parseFloat(found.total).toFixed(2) : '0.00';
      }).join('_');

      const zahlungen = `${paymentAmount.toFixed(2)}:${paymentData.type}`;
      processData = `Beleg^${bruttoSteuerumsaetze}^${zahlungen}`;

      // 5. Update transaction status to 'finished'.
      const [updatedTransaction] = await trx('active_transactions').where({ id: transactionId }).update({ 
        status: 'finished',
        payment_type: paymentData.type,
        payment_amount: paymentAmount
      }).returning('*');

      // 6. Fetch the complete transaction with items for the response
      const items = await trx('active_transaction_items')
        .leftJoin('items', 'active_transaction_items.item_id', 'items.id')
        .select(
          'active_transaction_items.*',
          'items.display_names',
          'items.item_price_value'
        )
        .where('active_transaction_items.active_transaction_id', transactionId);

      finishedTransaction = {
        ...updatedTransaction,
        items: items.map(item => ({
          ...item,
          display_names: item.display_names ? JSON.parse(item.display_names) : null
        }))
      };

      return { totalAmount };
    });

    // Second phase: Create fiscal log outside of main transaction to avoid connection pool conflicts
    const fiscalLogResult = await loggingService.logFiscalEvent('finishTransaction', userId, {
      transaction_uuid: transaction.uuid,
      processType: 'Kassenbeleg-V1',
      processData: processData,
      payment_type: paymentData.type,
      final_amount: updateResult.totalAmount,
      metadata: transaction.metadata ? JSON.parse(transaction.metadata) : {}
    });

    if (!fiscalLogResult.success) {
      // If fiscal logging fails after transaction is finished, log error but don't revert transaction
      logger.error({ msg: 'Failed to create fiscal log for finished transaction (transaction already committed)', error: fiscalLogResult.error, transactionId });
      return { 
        success: true, 
        warning: 'Transaction finished but fiscal logging failed', 
        fiscal_log_error: fiscalLogResult.error,
        transaction: finishedTransaction
      };
    }

    logger.info({ msg: 'Transaction finished successfully', transactionId });
    return { 
      success: true, 
      fiscal_log: fiscalLogResult.log,
      transaction: finishedTransaction
    };
  }

  /**
   * Retrieves all transactions that require manual recovery (resolution_status = 'pending').
   * Includes associated transaction items with display names for frontend display.
   * @returns {Promise<Array>} Array of pending recovery transactions with their items.
   */
  async getPendingTransactions() {
    logger.info({ service: 'TransactionManagementService', function: 'getPendingTransactions' });

    try {
      // Find all transactions with resolution_status = 'pending'
      const pendingTransactions = await db('active_transactions')
        .where('resolution_status', 'pending')
        .select('*')
        .orderBy('created_at', 'asc');

      if (pendingTransactions.length === 0) {
        logger.info('No pending recovery transactions found');
        return [];
      }

      // For each pending transaction, fetch its associated items
      const transactionsWithItems = await Promise.all(
        pendingTransactions.map(async (transaction) => {
          const items = await db('active_transaction_items')
            .leftJoin('items', 'active_transaction_items.item_id', 'items.id')
            .select(
              'active_transaction_items.*',
              'items.display_names',
              'items.item_price_value'
            )
            .where('active_transaction_items.active_transaction_id', transaction.id);

          return {
            ...transaction,
            items: items.map(item => ({
              ...item,
              display_names: item.display_names ? JSON.parse(item.display_names) : null
            }))
          };
        })
      );

      logger.info({ 
        count: transactionsWithItems.length,
        msg: 'Retrieved pending recovery transactions with items'
      });

      return transactionsWithItems;
    } catch (error) {
      logger.error({ 
        msg: 'Failed to retrieve pending recovery transactions', 
        error: error.message 
      });
      throw error;
    }
  }

  /**
   * Resolves a pending transaction with the specified resolution type.
   * @param {number} transactionId - The ID of the transaction to resolve.
   * @param {string} resolution - The resolution type: 'postpone', 'cancel', or 'fiscalize'.
   * @param {number} userId - The ID of the user performing the resolution.
   * @returns {Promise<object>} The result of the resolution operation.
   */
  async resolvePendingTransaction(transactionId, resolution, userId) {
    logger.info({ 
      service: 'TransactionManagementService', 
      function: 'resolvePendingTransaction', 
      transactionId, 
      resolution, 
      userId 
    });

    try {
      // First, verify the transaction exists and is in pending status
      const transaction = await db('active_transactions')
        .where({ id: transactionId, resolution_status: 'pending' })
        .first();

      if (!transaction) {
        throw new Error(`Transaction with ID ${transactionId} not found or not in pending status`);
      }

      let result;

      switch (resolution) {
        case 'postpone':
          // Update the transaction's resolution_status to 'postponed'
          await db('active_transactions')
            .where({ id: transactionId })
            .update({ 
              resolution_status: 'postponed',
              updated_at: new Date().toISOString()
            });

          // Log the fiscal event for postponement
          const fiscalLogResult = await loggingService.logFiscalEvent('postponeTransaction', userId, {
            transaction_uuid: transaction.uuid,
            original_status: 'pending',
            new_status: 'postponed'
          });

          if (!fiscalLogResult.success) {
            logger.error({ 
              msg: 'Failed to create fiscal log for transaction postponement', 
              error: fiscalLogResult.error,
              transactionId 
            });
          }

          result = { 
            success: true, 
            action: 'postponed',
            transactionId,
            fiscal_log: fiscalLogResult.success ? fiscalLogResult.log : null
          };
          break;

        case 'cancel':
          // TODO: Implement transaction cancellation logic
          // This should update status to 'cancelled' and create appropriate fiscal logs
          throw new Error('Transaction cancellation not yet implemented');

        case 'fiscalize':
          // TODO: Implement transaction fiscalization logic
          // This should complete the fiscal process and update status accordingly
          throw new Error('Transaction fiscalization not yet implemented');

        default:
          throw new Error(`Unknown resolution type: ${resolution}`);
      }

      logger.info({ 
        msg: `Transaction ${resolution} completed successfully`, 
        transactionId, 
        resolution 
      });

      return result;
    } catch (error) {
      logger.error({ 
        msg: 'Failed to resolve pending transaction', 
        error: error.message,
        transactionId,
        resolution
      });
      throw error;
    }
  }

  /**
   * Parks an active transaction with a table identifier.
   * @param {number} transactionId - The ID of the transaction to park.
   * @param {string} tableIdentifier - The table identifier (e.g., "5", "Table A").
   * @param {number} userId - The ID of the user performing the operation.
   * @returns {Promise<object>} The parked transaction object.
   */
  async parkTransaction(transactionId, tableIdentifier, userId, updateTimestamp = true) {
    logger.info({ 
      service: 'TransactionManagementService', 
      function: 'parkTransaction', 
      transactionId, 
      tableIdentifier, 
      userId,
      updateTimestamp
    });

    try {
      // First, verify the transaction exists and is active
      const transaction = await db('active_transactions')
        .where({ id: transactionId, status: 'active' })
        .first();

      if (!transaction) {
        throw new Error(`Active transaction with ID ${transactionId} not found`);
      }

      // Parse existing metadata
      const metadata = transaction.metadata ? JSON.parse(transaction.metadata) : {};
      metadata.table = tableIdentifier;

      // Update transaction status to 'parked' and add table info
      const updateData = { 
        status: 'parked',
        metadata: JSON.stringify(metadata)
      };
      if (updateTimestamp) {
        updateData.updated_at = new Date().toISOString();
      }
      
      const [parkedTransaction] = await db('active_transactions')
        .where({ id: transactionId })
        .update(updateData)
        .returning('*');

      // Log the fiscal event for parking
      const fiscalLogResult = await loggingService.logFiscalEvent('parkTransaction', userId, {
        transaction_uuid: transaction.uuid,
        table_identifier: tableIdentifier,
        original_status: 'active',
        new_status: 'parked'
      });

      if (!fiscalLogResult.success) {
        logger.error({ 
          msg: 'Failed to create fiscal log for transaction parking', 
          error: fiscalLogResult.error,
          transactionId 
        });
      }

      logger.info({ 
        msg: 'Transaction parked successfully', 
        transactionId, 
        tableIdentifier 
      });

      return parkedTransaction;
    } catch (error) {
      logger.error({ 
        msg: 'Failed to park transaction', 
        error: error.message,
        transactionId,
        tableIdentifier
      });
      throw error;
    }
  }

  /**
   * Activates a parked transaction.
   * @param {number} transactionId - The ID of the transaction to activate.
   * @param {number} userId - The ID of the user performing the operation.
   * @param {boolean} updateTimestamp - Whether to update the updated_at timestamp (default: false).
   * @returns {Promise<object>} The activated transaction object with items.
   */
  async activateTransaction(transactionId, userId, updateTimestamp = false) {
    logger.info({ 
      service: 'TransactionManagementService', 
      function: 'activateTransaction', 
      transactionId, 
      userId,
      updateTimestamp
    });

    try {
      // First, verify the transaction exists and is parked
      const transaction = await db('active_transactions')
        .where({ id: transactionId, status: 'parked' })
        .first();

      if (!transaction) {
        throw new Error(`Parked transaction with ID ${transactionId} not found`);
      }

      // Prepare update data
      const updateData = { status: 'active' };
      if (updateTimestamp) {
        updateData.updated_at = new Date().toISOString();
      }

      // Update transaction status to 'active'
      const [activatedTransaction] = await db('active_transactions')
        .where({ id: transactionId })
        .update(updateData)
        .returning('*');

      // Fetch the complete transaction with items
      const items = await db('active_transaction_items')
        .leftJoin('items', 'active_transaction_items.item_id', 'items.id')
        .select(
          'active_transaction_items.*',
          'items.display_names',
          'items.item_price_value'
        )
        .where('active_transaction_items.active_transaction_id', transactionId);

      const completeTransaction = {
        ...activatedTransaction,
        items: items.map(item => ({
          ...item,
          display_names: item.display_names ? JSON.parse(item.display_names) : null
        }))
      };

      // Log the fiscal event for activation
      const fiscalLogResult = await loggingService.logFiscalEvent('activateTransaction', userId, {
        transaction_uuid: transaction.uuid,
        original_status: 'parked',
        new_status: 'active'
      });

      if (!fiscalLogResult.success) {
        logger.error({ 
          msg: 'Failed to create fiscal log for transaction activation', 
          error: fiscalLogResult.error,
          transactionId 
        });
      }

      logger.info({ 
        msg: 'Transaction activated successfully', 
        transactionId 
      });

      return completeTransaction;
    } catch (error) {
      logger.error({ 
        msg: 'Failed to activate transaction', 
        error: error.message,
        transactionId
      });
      throw error;
    }
  }

  /**
   * Retrieves all parked transactions.
   * @returns {Promise<Array>} Array of parked transactions with their metadata.
   */
  async getParkedTransactions() {
    logger.info({ service: 'TransactionManagementService', function: 'getParkedTransactions' });

    try {
      const parkedTransactions = await db('active_transactions')
        .where('status', 'parked')
        .select('*')
        .orderBy('updated_at', 'asc');

      // Parse metadata for each transaction and normalize timestamps
      const transactionsWithParsedMetadata = parkedTransactions.map(transaction => ({
        ...transaction,
        metadata: transaction.metadata ? JSON.parse(transaction.metadata) : {},
        // Normalize timestamps to ISO format for consistent parsing on frontend
        created_at: new Date(transaction.created_at).toISOString(),
        updated_at: new Date(transaction.updated_at).toISOString()
      }));

      logger.info({ 
        count: transactionsWithParsedMetadata.length,
        msg: 'Retrieved parked transactions'
      });

      return transactionsWithParsedMetadata;
    } catch (error) {
      logger.error({ 
        msg: 'Failed to retrieve parked transactions', 
        error: error.message 
      });
      throw error;
    }
  }

  /**
   * Updates the metadata of an active transaction.
   * @param {number} transactionId - The ID of the transaction to update.
   * @param {object} metadata - The new metadata object.
   * @param {number} userId - The ID of the user performing the update.
   * @param {boolean} updateTimestamp - Whether to update the updated_at timestamp (default: false).
   * @returns {Promise<object>} The updated transaction object.
   */
  async updateTransactionMetadata(transactionId, metadata, userId, updateTimestamp = false) {
    logger.info({ 
      service: 'TransactionManagementService', 
      function: 'updateTransactionMetadata', 
      transactionId, 
      metadata, 
      userId,
      updateTimestamp
    });

    try {
      // Find the existing transaction
      const existingTransaction = await db('active_transactions')
        .where({ id: transactionId, status: 'active' })
        .first();

      if (!existingTransaction) {
        throw new Error(`Active transaction with ID ${transactionId} not found`);
      }

      // Update the transaction metadata
      // Note: Table availability is already checked in assignTableNumber before calling this function
      const updateData = { metadata: JSON.stringify(metadata) };
      if (updateTimestamp) {
        updateData.updated_at = new Date().toISOString();
      }
      
      const [updatedTransaction] = await db('active_transactions')
        .where({ id: transactionId })
        .update(updateData)
        .returning('*');

      // Log the fiscal event for metadata update
      const fiscalLogResult = await loggingService.logFiscalEvent('updateTransactionMetadata', userId, {
        transaction_uuid: existingTransaction.uuid,
        old_metadata: existingTransaction.metadata,
        new_metadata: JSON.stringify(metadata)
      });

      if (!fiscalLogResult.success) {
        logger.error({ 
          msg: 'Failed to create fiscal log for metadata update', 
          error: fiscalLogResult.error,
          transactionId 
        });
      }

      logger.info({ 
        msg: 'Transaction metadata updated successfully', 
        transactionId 
      });

      return {
        ...updatedTransaction,
        metadata: JSON.parse(updatedTransaction.metadata)
      };
    } catch (error) {
      logger.error({ 
        msg: 'Failed to update transaction metadata', 
        error: error.message,
        transactionId
      });
      throw error;
    }
  }

  /**
   * Checks if a table number is already in use by a parked transaction.
   * @param {string} tableNumber - The table number to check.
   * @param {number} excludeTransactionId - Optional transaction ID to exclude from check.
   * @returns {Promise<boolean>} True if table number is already in use.
   */
  async checkTableNumberInUse(tableNumber, excludeTransactionId = null) {
    logger.info({ 
      service: 'TransactionManagementService', 
      function: 'checkTableNumberInUse', 
      tableNumber,
      excludeTransactionId
    });

    try {
      let query = db('active_transactions')
        .where('status', 'parked')
        .whereRaw("JSON_EXTRACT(metadata, '$.table') = ?", [tableNumber]);
      
      if (excludeTransactionId) {
        query = query.whereNot('id', excludeTransactionId);
      }
      
      const existingTransaction = await query.first();
      const isInUse = !!existingTransaction;
      
      logger.info({ 
        msg: 'Table number availability checked', 
        tableNumber,
        isInUse,
        existingTransactionId: existingTransaction ? existingTransaction.id : null
      });

      return isInUse;
    } catch (error) {
      logger.error({ 
        msg: 'Failed to check table number availability', 
        error: error.message,
        tableNumber
      });
      throw error;
    }
  }

}

// Export a singleton instance of the service
module.exports = new TransactionManagementService();