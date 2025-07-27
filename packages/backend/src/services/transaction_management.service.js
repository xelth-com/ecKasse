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
   * @param {object} criteria - Criteria to find the transaction (e.g., { metadata: { table: 5 } }).
   * @param {number} userId - The ID of the user creating the transaction.
   * @returns {Promise<object>} The active transaction object.
   */
  async findOrCreateActiveTransaction(criteria, userId) {
    logger.info({ service: 'TransactionManagementService', function: 'findOrCreateActiveTransaction', criteria, userId });

    // For now, criteria are simple. This can be expanded for table numbers etc.
    // Example: trx('active_transactions').where('metadata->>table', criteria.metadata.table)
    const existingTransaction = await db('active_transactions')
      .where({ status: 'active' })
      // This is a simplified find logic. A real implementation would use criteria more effectively.
      .first();

    if (existingTransaction) {
      logger.info({ msg: 'Found existing active transaction', id: existingTransaction.id });
      return existingTransaction;
    }

    // No active transaction found, create a new one.
    logger.info('No active transaction found, creating a new one.');
    const newTransactionUUID = crypto.randomUUID();

    // Create the transaction record first
    const [newTransaction] = await db('active_transactions').insert({
      uuid: newTransactionUUID,
      status: 'active',
      user_id: userId,
      business_date: new Date().toISOString().split('T')[0],
      metadata: JSON.stringify(criteria.metadata || {})
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
            tax_amount: newTaxAmount
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
   * @returns {Promise<object>} The result of the final fiscal logging.
   */
  async finishTransaction(transactionId, paymentData, userId) {
    logger.info({ service: 'TransactionManagementService', function: 'finishTransaction', transactionId, paymentData });

    let transaction, processData;

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
      await trx('active_transactions').where({ id: transactionId }).update({ status: 'finished' });

      return { totalAmount };
    });

    // Second phase: Create fiscal log outside of main transaction to avoid connection pool conflicts
    const fiscalLogResult = await loggingService.logFiscalEvent('finishTransaction', userId, {
      transaction_uuid: transaction.uuid,
      processType: 'Kassenbeleg-V1',
      processData: processData,
      payment_type: paymentData.type,
      final_amount: updateResult.totalAmount
    });

    if (!fiscalLogResult.success) {
      // If fiscal logging fails after transaction is finished, log error but don't revert transaction
      logger.error({ msg: 'Failed to create fiscal log for finished transaction (transaction already committed)', error: fiscalLogResult.error, transactionId });
      return { success: true, warning: 'Transaction finished but fiscal logging failed', fiscal_log_error: fiscalLogResult.error };
    }

    logger.info({ msg: 'Transaction finished successfully', transactionId });
    return { success: true, fiscal_log: fiscalLogResult.log };
  }
}

// Export a singleton instance of the service
module.exports = new TransactionManagementService();