const logger = require('../config/logger');
const crypto = require('crypto');
const { parseJsonIfNeeded } = require('../utils/db-helper');

class TransactionManagementService {
  constructor(transactionRepository, productRepository, loggingService, printerService) {
    this.transactionRepository = transactionRepository;
    this.productRepository = productRepository;
    this.loggingService = loggingService;
    this.printerService = printerService;
  }

  async findOrCreateActiveTransaction(criteria, userId) {
    logger.info({ service: 'TransactionManagementService', function: 'findOrCreateActiveTransaction', criteria, userId });
    let existingTransaction = null;
    if (criteria.transactionId) {
      existingTransaction = await this.transactionRepository.findActiveById(criteria.transactionId);
      if (existingTransaction) {
        logger.info({ msg: 'Found existing active transaction by ID', id: existingTransaction.id });
        return existingTransaction;
      }
    }
    const newTransactionUUID = crypto.randomUUID();
    const nowUTC = new Date().toISOString();
    const newTransactionData = {
      uuid: newTransactionUUID,
      status: 'active',
      user_id: userId,
      business_date: nowUTC.split('T')[0],
      metadata: JSON.stringify(criteria.metadata || {}),
      created_at: nowUTC,
      updated_at: nowUTC
    };
    const newTransaction = await this.transactionRepository.create(newTransactionData);
    
    const fiscalPayload = {
      transaction_uuid: newTransactionUUID,
      metadata: criteria.metadata || {}
    };
    // Diagnostic Log: Log payload before sending
    logger.info({ fiscalPayload, operation: 'startTransaction' }, 'Preparing to send payload to logFiscalEvent');
    const fiscalLogResult = await this.loggingService.logFiscalEvent('startTransaction', userId, fiscalPayload);
    if (!fiscalLogResult.success) {
      await this.transactionRepository.delete(newTransaction.id);
      const errorMessage = typeof fiscalLogResult.error === 'string' ? fiscalLogResult.error : JSON.stringify(fiscalLogResult.error);
      throw new Error(`Failed to create fiscal log for new transaction: ${errorMessage}`);
    }
    logger.info({ msg: 'New active transaction created successfully', id: newTransaction.id, uuid: newTransaction.uuid });
    return newTransaction;
  }

  async addItemToTransaction(transactionId, itemId, quantity, userId, options = {}) {
    logger.info({ service: 'TransactionManagementService', function: 'addItemToTransaction', transactionId, itemId, quantity });
    let updatedTransaction, item;
    const result = await this.transactionRepository.db.transaction(async (trx) => {
      const transaction = await this.transactionRepository.findActiveById(transactionId, trx);
      if (!transaction) throw new Error(`Active transaction with ID ${transactionId} not found.`);
      item = await this.productRepository.findById(itemId, trx);
      if (!item) throw new Error(`Item with ID ${itemId} not found.`);
      const category = await this.productRepository.findCategoryById(item.associated_category_unique_identifier, trx);
      const taxRate = category.category_type === 'drink' ? 19.00 : 7.00;
      const unit_price = parseFloat(item.item_price_value);
      const total_price = unit_price * quantity;
      const tax_amount = total_price - (total_price / (1 + taxRate / 100));
      const itemData = {
        active_transaction_id: transactionId,
        item_id: itemId,
        quantity: quantity,
        unit_price: unit_price,
        total_price: total_price,
        tax_rate: taxRate,
        tax_amount: tax_amount,
        notes: options.notes || null
      };
      const newItem = await this.transactionRepository.addItem(itemData, trx);
      const newTotalAmount = parseFloat(transaction.total_amount) + total_price;
      const newTaxAmount = parseFloat(transaction.tax_amount) + tax_amount;
      const updateData = {
        total_amount: newTotalAmount,
        tax_amount: newTaxAmount,
        updated_at: new Date().toISOString()
      };
      updatedTransaction = await this.transactionRepository.update(transactionId, updateData, trx);
      const updatedItems = await this.transactionRepository.getItemsWithDetailsByTransactionId(transactionId, trx);
      return { transaction: updatedTransaction, newItem, items: updatedItems, total_price };
    });
    
    const fiscalPayload = {
        transaction_uuid: updatedTransaction.uuid,
        item_added: {
            item_id: itemId,
            name: item.display_names.menu.de,
            quantity,
            total_price: result.total_price
        },
        new_total: updatedTransaction.total_amount
    };
    // Diagnostic Log: Log payload before sending
    logger.info({ fiscalPayload, operation: 'updateTransaction' }, 'Preparing to send payload to logFiscalEvent');
    const fiscalLogResult = await this.loggingService.logFiscalEvent('updateTransaction', userId, fiscalPayload);
    if (!fiscalLogResult.success) {
      logger.error({ msg: 'Failed to create fiscal log for item update (transaction already committed)', error: fiscalLogResult.error });
    }
    logger.info({ msg: 'Item added to transaction successfully', transactionId, itemId, newItemId: result.newItem.id });
    return { ...result.transaction, items: result.items };
  }

  async finishTransaction(transactionId, paymentData, userId) {
    let transaction, processData, finishedTransaction;
    const updateResult = await this.transactionRepository.db.transaction(async (trx) => {
      transaction = await this.transactionRepository.findActiveById(transactionId, trx);
      if (!transaction) throw new Error(`Active transaction with ID ${transactionId} not found.`);
      
      // Get the initial items before fiscal compliance to preserve display order
      const initialItems = await this.transactionRepository.getItemsWithDetailsByTransactionId(transactionId, trx);
      const displayOrderMap = new Map(initialItems.map((item, index) => [item.id, index]));
      
      // Create fiscal compliance records based on operational logs FIRST - this reconstructs the transaction
      await this.createFiscalComplianceRecords(transactionId, transaction.uuid, trx, initialItems);
      
      const paymentAmount = parseFloat(paymentData.amount);
      const taxBreakdown = await this.transactionRepository.getTaxBreakdown(transactionId, trx);
      const taxRatesOrder = [19.00, 7.00, 10.70, 5.50, 0.00];
      const bruttoSteuerumsaetze = taxRatesOrder.map(rate => {
        const found = taxBreakdown.find(b => parseFloat(b.tax_rate) === rate);
        return found ? parseFloat(found.total).toFixed(2) : '0.00';
      }).join('_');
      // Note: zahlungen will be recalculated after fiscal compliance records
      let zahlungen = `${paymentAmount.toFixed(2)}:${paymentData.type}`;
      processData = `Beleg^${bruttoSteuerumsaetze}^${zahlungen}`;
      
      // Recalculate total amounts after fiscal compliance records are created
      const allItems = await this.transactionRepository.getItemsWithDetailsByTransactionId(transactionId, trx);
      const recalculatedTotal = allItems.reduce((sum, item) => sum + parseFloat(item.total_price), 0);
      const recalculatedTax = allItems.reduce((sum, item) => sum + parseFloat(item.tax_amount), 0);
      
      // Update payment amount to match recalculated total (fiscal compliance may change the total)
      const finalPaymentAmount = recalculatedTotal;
      
      // Recalculate processData with correct amounts
      const finalTaxBreakdown = await this.transactionRepository.getTaxBreakdown(transactionId, trx);
      const finalBruttoSteuerumsaetze = taxRatesOrder.map(rate => {
        const found = finalTaxBreakdown.find(b => parseFloat(b.tax_rate) === rate);
        return found ? parseFloat(found.total).toFixed(2) : '0.00';
      }).join('_');
      zahlungen = `${finalPaymentAmount.toFixed(2)}:${paymentData.type}`;
      processData = `Beleg^${finalBruttoSteuerumsaetze}^${zahlungen}`;
      
      const updateData = { 
        status: 'finished', 
        payment_type: paymentData.type, 
        payment_amount: finalPaymentAmount,
        total_amount: recalculatedTotal,
        tax_amount: recalculatedTax
      };
      const updatedTransaction = await this.transactionRepository.update(transactionId, updateData, trx);
      
      // Sort items using sophisticated criteria to preserve display order with compliance records grouped
      const sortedItems = [...allItems].sort((a, b) => {
        // Get sort keys - original items use their id, compliance items use parent_transaction_item_id
        const aSortKey = a.parent_transaction_item_id || a.id;
        const bSortKey = b.parent_transaction_item_id || b.id;
        
        // Get original indices from display order map
        const aIndex = displayOrderMap.get(aSortKey) ?? 999999;
        const bIndex = displayOrderMap.get(bSortKey) ?? 999999;
        
        // Primary sort: original display order index
        if (aIndex !== bIndex) {
          return aIndex - bIndex;
        }
        
        // Secondary sort: item ID (ensures original items come before compliance items)
        return a.id - b.id;
      });
      
      finishedTransaction = { ...updatedTransaction, items: sortedItems };
      return { totalAmount: recalculatedTotal };
    });
    
    const fiscalPayload = {
      transaction_uuid: transaction.uuid,
      processType: 'Kassenbeleg-V1',
      processData: processData,
      payment_type: paymentData.type,
      final_amount: updateResult.totalAmount,
      metadata: parseJsonIfNeeded(transaction.metadata) || {}
    };
    // Diagnostic Log: Log payload before sending
    logger.info({ fiscalPayload, operation: 'finishTransaction' }, 'Preparing to send payload to logFiscalEvent');
    const fiscalLogResult = await this.loggingService.logFiscalEvent('finishTransaction', userId, fiscalPayload);
    if (!fiscalLogResult.success) {
      logger.error({ msg: 'Failed to create fiscal log for finished transaction', error: fiscalLogResult.error, transactionId });
      return { success: true, warning: 'Transaction finished but fiscal logging failed', fiscal_log_error: fiscalLogResult.error, transaction: finishedTransaction };
    }
    try {
      const receiptData = await this.printerService._prepareReceiptData(finishedTransaction, fiscalLogResult.log);
      const printResult = await this.printerService.printReceipt(receiptData);
      if (printResult.status === 'success') {
        return { success: true, fiscal_log: fiscalLogResult.log, transaction: finishedTransaction, print_result: printResult, printStatus: { status: 'success' } };
      } else {
        await this.loggingService.logOperationalEvent('print_failed', userId, { transaction_uuid: transaction.uuid, print_error: printResult.message, printer: printResult.printer || 'unknown' });
        return { success: true, fiscal_log: fiscalLogResult.log, transaction: finishedTransaction, print_warning: printResult.message, printStatus: { status: 'failed', error: printResult.message } };
      }
    } catch (printError) {
      await this.loggingService.logOperationalEvent('print_error', userId, { transaction_uuid: transaction.uuid, error_message: printError.message });
      return { success: true, fiscal_log: fiscalLogResult.log, transaction: finishedTransaction, print_error: printError.message, printStatus: { status: 'failed', error: printError.message } };
    }
  }

  async getPendingTransactions() {
    const pendingTransactions = await this.transactionRepository.getPendingRecoveryTransactions();
    if (pendingTransactions.length === 0) return [];
    return Promise.all(pendingTransactions.map(async (transaction) => {
      const items = await this.transactionRepository.getItemsWithDetailsByTransactionId(transaction.id);
      return { ...transaction, items: items };
    }));
  }
  
  async resolvePendingTransaction(transactionId, resolution, userId) {
    const transaction = await this.transactionRepository.findById(transactionId);
    if (!transaction || transaction.resolution_status !== 'pending') throw new Error(`Transaction with ID ${transactionId} not found or not in pending status`);
    // ... (rest of the function)
  }

  async parkTransaction(transactionId, tableIdentifier, userId, updateTimestamp = true) {
    const transaction = await this.transactionRepository.findActiveById(transactionId);
    if (!transaction) throw new Error(`Active transaction with ID ${transactionId} not found`);
    const metadata = parseJsonIfNeeded(transaction.metadata) || {};
    metadata.table = tableIdentifier;
    const updateData = { status: 'parked', metadata: JSON.stringify(metadata) };
    if (updateTimestamp) updateData.updated_at = new Date().toISOString();
    return this.transactionRepository.update(transactionId, updateData);
  }

  async activateTransaction(transactionId, userId, updateTimestamp = false) {
    const transaction = await this.transactionRepository.findParkedById(transactionId);
    if (!transaction) throw new Error(`Parked transaction with ID ${transactionId} not found`);
    const updateData = { status: 'active' };
    if (updateTimestamp) updateData.updated_at = new Date().toISOString();
    const activatedTransaction = await this.transactionRepository.update(transactionId, updateData);
    const items = await this.transactionRepository.getItemsWithDetailsByTransactionId(transactionId);
    return { ...activatedTransaction, items: items };
  }

  async getParkedTransactions() {
    const parkedTransactions = await this.transactionRepository.getParkedTransactions();
    return parkedTransactions.map(transaction => ({ ...transaction, metadata: transaction.metadata, created_at: new Date(transaction.created_at).toISOString(), updated_at: new Date(transaction.updated_at).toISOString() }));
  }

  async updateTransactionMetadata(transactionId, metadata, userId, updateTimestamp = false) {
    const existingTransaction = await this.transactionRepository.findActiveById(transactionId);
    if (!existingTransaction) throw new Error(`Active transaction with ID ${transactionId} not found`);
    
    // Parse existing metadata and merge with new metadata to prevent data loss
    const existingMetadata = parseJsonIfNeeded(existingTransaction.metadata) || {};
    const mergedMetadata = { ...existingMetadata, ...metadata };
    
    const updateData = { metadata: JSON.stringify(mergedMetadata) };
    if (updateTimestamp) updateData.updated_at = new Date().toISOString();
    const updatedTransaction = await this.transactionRepository.update(transactionId, updateData);
    return { ...updatedTransaction, metadata: updatedTransaction.metadata };
  }

  async checkTableNumberInUse(tableNumber, excludeTransactionId = null) {
    return this.transactionRepository.isTableInUse(tableNumber, excludeTransactionId);
  }

  async checkTableAvailability(tableNumber, excludeTransactionId = null) {
    logger.info({ service: 'TransactionManagementService', function: 'checkTableAvailability', tableNumber, excludeTransactionId });
    return this.transactionRepository.isTableInUse(tableNumber, excludeTransactionId);
  }

  async updateItemQuantityInTransaction(transactionId, transactionItemId, newQuantity, userId) {
    // TODO: Implement permission check for userId
    logger.info({ service: 'TransactionManagementService', function: 'updateItemQuantityInTransaction', transactionId, transactionItemId, newQuantity });
    
    let updatedTransaction, item, transactionItem;
    const result = await this.transactionRepository.db.transaction(async (trx) => {
      const transaction = await this.transactionRepository.findActiveById(transactionId, trx);
      if (!transaction) throw new Error(`Active transaction with ID ${transactionId} not found.`);
      
      // Get the transaction item to update
      transactionItem = await this.transactionRepository.getTransactionItemById(transactionItemId, trx);
      if (!transactionItem || transactionItem.active_transaction_id !== transactionId) {
        throw new Error(`Transaction item with ID ${transactionItemId} not found in transaction ${transactionId}.`);
      }
      
      // Get item details for recalculation
      item = await this.productRepository.findById(transactionItem.item_id, trx);
      if (!item) throw new Error(`Item with ID ${transactionItem.item_id} not found.`);
      
      const oldTotalPrice = parseFloat(transactionItem.total_price);
      const oldTaxAmount = parseFloat(transactionItem.tax_amount);
      
      let priceDifference, taxDifference;
      
      if (newQuantity < transactionItem.quantity) {
        // STORNO operation - UPDATE the item to show current state for UI, and log for fiscal compliance
        await this.loggingService.logOperationalEvent('partial_storno', userId, {
          transaction_uuid: transaction.uuid,
          transaction_item_id: transactionItemId,
          original_quantity: transactionItem.quantity,
          new_quantity: newQuantity,
          item_id: transactionItem.item_id
        });
        
        // Calculate the price difference for transaction total update
        const unitPrice = parseFloat(transactionItem.unit_price);
        const newTotalPrice = unitPrice * newQuantity;
        const taxRate = parseFloat(transactionItem.tax_rate);
        const newTaxAmount = newTotalPrice - (newTotalPrice / (1 + taxRate / 100));
        
        priceDifference = newTotalPrice - oldTotalPrice;
        taxDifference = newTaxAmount - oldTaxAmount;
        
        // Update the transaction item to show current state for UI
        const itemUpdateData = {
          quantity: newQuantity,
          total_price: newTotalPrice,
          tax_amount: newTaxAmount,
          updated_at: new Date().toISOString()
        };
        await this.transactionRepository.updateTransactionItem(transactionItemId, itemUpdateData, trx);
      } else {
        // Normal quantity increase - update the transaction item
        const unitPrice = parseFloat(transactionItem.unit_price);
        const newTotalPrice = unitPrice * newQuantity;
        const taxRate = parseFloat(transactionItem.tax_rate);
        const newTaxAmount = newTotalPrice - (newTotalPrice / (1 + taxRate / 100));
        
        priceDifference = newTotalPrice - oldTotalPrice;
        taxDifference = newTaxAmount - oldTaxAmount;
        
        // Update the transaction item
        const itemUpdateData = {
          quantity: newQuantity,
          total_price: newTotalPrice,
          tax_amount: newTaxAmount,
          updated_at: new Date().toISOString()
        };
        await this.transactionRepository.updateTransactionItem(transactionItemId, itemUpdateData, trx);
      }
      
      // Update transaction totals
      const newTransactionTotal = parseFloat(transaction.total_amount) + priceDifference;
      const newTransactionTax = parseFloat(transaction.tax_amount) + taxDifference;
      
      const transactionUpdateData = {
        total_amount: newTransactionTotal,
        tax_amount: newTransactionTax,
        updated_at: new Date().toISOString()
      };
      updatedTransaction = await this.transactionRepository.update(transactionId, transactionUpdateData, trx);
      
      const updatedItems = await this.transactionRepository.getItemsWithDetailsByTransactionId(transactionId, trx);
      return { transaction: updatedTransaction, items: updatedItems, priceDifference };
    });
    
    // Log fiscal event
    const fiscalPayload = {
      transaction_uuid: updatedTransaction.uuid,
      item_quantity_updated: {
        transaction_item_id: transactionItemId,
        item_id: transactionItem.item_id,
        name: item.display_names.menu.de,
        old_quantity: transactionItem.quantity,
        new_quantity: newQuantity,
        price_difference: result.priceDifference
      },
      new_total: updatedTransaction.total_amount
    };
    
    const fiscalLogResult = await this.loggingService.logFiscalEvent('updateTransaction', userId, fiscalPayload);
    if (!fiscalLogResult.success) {
      logger.error({ msg: 'Failed to create fiscal log for quantity update', error: fiscalLogResult.error });
    }
    
    logger.info({ msg: 'Item quantity updated successfully', transactionId, transactionItemId, newQuantity });
    return { ...result.transaction, items: result.items };
  }

  async addCustomPriceItemToTransaction(transactionId, itemId, customPrice, quantity, userId, options = {}) {
    logger.info({ service: 'TransactionManagementService', function: 'addCustomPriceItemToTransaction', transactionId, itemId, customPrice, quantity });
    
    let updatedTransaction, item;
    const result = await this.transactionRepository.db.transaction(async (trx) => {
      const transaction = await this.transactionRepository.findActiveById(transactionId, trx);
      if (!transaction) throw new Error(`Active transaction with ID ${transactionId} not found.`);
      
      item = await this.productRepository.findById(itemId, trx);
      if (!item) throw new Error(`Item with ID ${itemId} not found.`);
      
      const category = await this.productRepository.findCategoryById(item.associated_category_unique_identifier, trx);
      const taxRate = category.category_type === 'drink' ? 19.00 : 7.00;
      
      const unit_price = parseFloat(customPrice);
      const total_price = unit_price * quantity;
      const tax_amount = total_price - (total_price / (1 + taxRate / 100));
      
      const itemData = {
        active_transaction_id: transactionId,
        item_id: itemId,
        quantity: quantity,
        unit_price: unit_price,
        total_price: total_price,
        tax_rate: taxRate,
        tax_amount: tax_amount,
        notes: options.notes || `Custom price: ${customPrice}€`
      };
      
      const newItem = await this.transactionRepository.addItem(itemData, trx);
      
      const newTotalAmount = parseFloat(transaction.total_amount) + total_price;
      const newTaxAmount = parseFloat(transaction.tax_amount) + tax_amount;
      
      const updateData = {
        total_amount: newTotalAmount,
        tax_amount: newTaxAmount,
        updated_at: new Date().toISOString()
      };
      
      updatedTransaction = await this.transactionRepository.update(transactionId, updateData, trx);
      const updatedItems = await this.transactionRepository.getItemsWithDetailsByTransactionId(transactionId, trx);
      
      return { transaction: updatedTransaction, newItem, items: updatedItems, total_price };
    });
    
    const fiscalPayload = {
      transaction_uuid: updatedTransaction.uuid,
      custom_price_item_added: {
        item_id: itemId,
        name: item.display_names.menu.de,
        quantity,
        custom_price: customPrice,
        original_price: item.item_price_value,
        total_price: result.total_price
      },
      new_total: updatedTransaction.total_amount
    };
    
    const fiscalLogResult = await this.loggingService.logFiscalEvent('updateTransaction', userId, fiscalPayload);
    if (!fiscalLogResult.success) {
      logger.error({ msg: 'Failed to create fiscal log for custom price item', error: fiscalLogResult.error });
    }
    
    logger.info({ msg: 'Custom price item added successfully', transactionId, itemId, customPrice, newItemId: result.newItem.id });
    return { ...result.transaction, items: result.items };
  }

  async updateItemPriceInTransaction(transactionId, transactionItemId, newPrice, userId, isTotalPrice = false) {
    // TODO: Implement permission check for userId
    logger.info({ service: 'TransactionManagementService', function: 'updateItemPriceInTransaction', transactionId, transactionItemId, newPrice, isTotalPrice });
    
    let updatedTransaction, item, transactionItem;
    const result = await this.transactionRepository.db.transaction(async (trx) => {
      const transaction = await this.transactionRepository.findActiveById(transactionId, trx);
      if (!transaction) throw new Error(`Active transaction with ID ${transactionId} not found.`);
      
      // Get the transaction item to update
      transactionItem = await this.transactionRepository.getTransactionItemById(transactionItemId, trx);
      if (!transactionItem || transactionItem.active_transaction_id !== transactionId) {
        throw new Error(`Transaction item with ID ${transactionItemId} not found in transaction ${transactionId}.`);
      }
      
      // Get item details for fiscal logging
      item = await this.productRepository.findById(transactionItem.item_id, trx);
      if (!item) throw new Error(`Item with ID ${transactionItem.item_id} not found.`);
      
      const oldTotalPrice = parseFloat(transactionItem.total_price);
      const oldTaxAmount = parseFloat(transactionItem.tax_amount);
      const oldUnitPrice = parseFloat(transactionItem.unit_price);
      
      // Calculate new amounts
      const quantity = parseFloat(transactionItem.quantity);
      let newUnitPrice, newTotalPrice;
      
      if (isTotalPrice) {
        // newPrice is the total price for all items
        newTotalPrice = newPrice;
        newUnitPrice = newPrice / quantity;
      } else {
        // newPrice is the unit price
        newUnitPrice = newPrice;
        newTotalPrice = newPrice * quantity;
      }
      const taxRate = parseFloat(transactionItem.tax_rate);
      const newTaxAmount = newTotalPrice - (newTotalPrice / (1 + taxRate / 100));
      
      // Calculate price difference for fiscal logging
      const priceDifference = newTotalPrice - oldTotalPrice;
      const effectiveDiscountOrSurcharge = newUnitPrice - oldUnitPrice;
      
      // Log price override as operational event
      await this.loggingService.logOperationalEvent('price_override', userId, {
        transaction_uuid: transaction.uuid,
        transaction_item_id: transactionItemId,
        original_unit_price: oldUnitPrice,
        new_unit_price: newUnitPrice,
        effective_discount_surcharge: effectiveDiscountOrSurcharge,
        quantity: quantity,
        price_difference: priceDifference,
        item_id: transactionItem.item_id
      });
      
      // Update the transaction item
      const itemUpdateData = {
        unit_price: newUnitPrice,
        total_price: newTotalPrice,
        tax_amount: newTaxAmount,
        updated_at: new Date().toISOString()
      };
      await this.transactionRepository.updateTransactionItem(transactionItemId, itemUpdateData, trx);
      
      // Update transaction totals
      const taxDifference = newTaxAmount - oldTaxAmount;
      const newTransactionTotal = parseFloat(transaction.total_amount) + priceDifference;
      const newTransactionTax = parseFloat(transaction.tax_amount) + taxDifference;
      
      const transactionUpdateData = {
        total_amount: newTransactionTotal,
        tax_amount: newTransactionTax,
        updated_at: new Date().toISOString()
      };
      updatedTransaction = await this.transactionRepository.update(transactionId, transactionUpdateData, trx);
      
      const updatedItems = await this.transactionRepository.getItemsWithDetailsByTransactionId(transactionId, trx);
      return { transaction: updatedTransaction, items: updatedItems, priceDifference, effectiveDiscountOrSurcharge };
    });
    
    // Log fiscal event
    const fiscalPayload = {
      transaction_uuid: updatedTransaction.uuid,
      item_price_updated: {
        transaction_item_id: transactionItemId,
        item_id: transactionItem.item_id,
        name: item.display_names.menu.de,
        old_unit_price: transactionItem.unit_price,
        new_unit_price: newPrice,
        effective_discount_surcharge: result.effectiveDiscountOrSurcharge,
        quantity: transactionItem.quantity,
        price_difference: result.priceDifference
      },
      new_total: updatedTransaction.total_amount
    };
    
    const fiscalLogResult = await this.loggingService.logFiscalEvent('updateTransaction', userId, fiscalPayload);
    if (!fiscalLogResult.success) {
      logger.error({ msg: 'Failed to create fiscal log for price update', error: fiscalLogResult.error });
    }
    
    logger.info({ msg: 'Item price updated successfully', transactionId, transactionItemId, newPrice });
    return { ...result.transaction, items: result.items };
  }

  async createFiscalComplianceRecords(transactionId, transactionUuid, trx, initialItems = []) {
    // Get operational logs for this transaction to reconstruct fiscal compliance records
    // Use database-agnostic JSON search
    const dbClient = trx.client.config.client;
    let operationalLogs;
    
    if (dbClient === 'pg') {
      // PostgreSQL with JSONB - use JSON containment operator
      operationalLogs = await trx('operational_log')
        .whereRaw('details::text LIKE ?', [`%${transactionUuid}%`])
        .andWhere('event_type', 'in', ['partial_storno', 'price_override'])
        .orderBy('timestamp_utc', 'asc');
    } else {
      // SQLite with TEXT - use regular LIKE
      operationalLogs = await trx('operational_log')
        .where('details', 'like', `%${transactionUuid}%`)
        .andWhere('event_type', 'in', ['partial_storno', 'price_override'])
        .orderBy('timestamp_utc', 'asc');
    }

    // Process logs to reconstruct transaction history
    for (const log of operationalLogs) {
      const payload = parseJsonIfNeeded(log.details);
      
      if (log.event_type === 'partial_storno') {
        // STEP 1: Find the current transaction item and revert it to original quantity
        const transactionItemId = payload.transaction_item_id;
        const originalQuantity = parseFloat(payload.original_quantity);
        const newQuantity = parseFloat(payload.new_quantity);
        const stornoQuantity = originalQuantity - newQuantity;
        
        if (stornoQuantity > 0) {
          // Get the original item from catalog to get original price
          const catalogItem = await this.productRepository.findById(payload.item_id, trx);
          if (catalogItem) {
            const originalUnitPrice = parseFloat(catalogItem.item_price_value);
            
            // Get category for tax rate calculation
            const category = await this.productRepository.findCategoryById(catalogItem.associated_category_unique_identifier, trx);
            const taxRate = category.category_type === 'drink' ? 19.00 : 7.00;
            
            // STEP 2: UPDATE the original transaction item back to original quantity and original price
            const originalTotalPrice = originalUnitPrice * originalQuantity;
            const originalTaxAmount = originalTotalPrice - (originalTotalPrice / (1 + taxRate / 100));
            
            await this.transactionRepository.updateTransactionItem(transactionItemId, {
              quantity: originalQuantity,
              unit_price: originalUnitPrice,
              total_price: originalTotalPrice,
              tax_amount: originalTaxAmount
            }, trx);
            
            // STEP 3: INSERT a new STORNO line item for the reduction
            const stornoTotalPrice = originalUnitPrice * stornoQuantity;
            const stornoTaxAmount = stornoTotalPrice - (stornoTotalPrice / (1 + taxRate / 100));
            
            const stornoItemData = {
              active_transaction_id: transactionId,
              item_id: payload.item_id,
              quantity: -stornoQuantity, // Negative quantity for storno
              unit_price: originalUnitPrice,
              total_price: -stornoTotalPrice, // Negative total price
              tax_rate: taxRate,
              tax_amount: -stornoTaxAmount, // Negative tax amount
              notes: 'STORNO',
              parent_transaction_item_id: transactionItemId // Add parent reference
            };
            
            await this.transactionRepository.addItem(stornoItemData, trx);
          }
        }
      } else if (log.event_type === 'price_override') {
        // STEP 1: Find the current transaction item and revert it to original price
        const transactionItemId = payload.transaction_item_id;
        const originalUnitPrice = parseFloat(payload.original_unit_price);
        const newUnitPrice = parseFloat(payload.new_unit_price);
        const quantity = parseFloat(payload.quantity);
        
        // Calculate actual discount/surcharge from original price
        const unitPriceDifference = newUnitPrice - originalUnitPrice;
        const actualPriceDifference = unitPriceDifference * quantity;
        
        if (Math.abs(actualPriceDifference) > 0.001) { // Only create if significant difference
          // Get the original item from catalog
          const catalogItem = await this.productRepository.findById(payload.item_id, trx);
          if (catalogItem) {
            // Get category for tax rate calculation
            const category = await this.productRepository.findCategoryById(catalogItem.associated_category_unique_identifier, trx);
            const taxRate = category.category_type === 'drink' ? 19.00 : 7.00;
            
            // STEP 2: UPDATE the original transaction item back to original catalog price
            const originalTotalPrice = parseFloat(catalogItem.item_price_value) * quantity;
            const originalTaxAmount = originalTotalPrice - (originalTotalPrice / (1 + taxRate / 100));
            
            await this.transactionRepository.updateTransactionItem(transactionItemId, {
              unit_price: parseFloat(catalogItem.item_price_value),
              total_price: originalTotalPrice,
              tax_amount: originalTaxAmount
            }, trx);
            
            // STEP 3: INSERT a new DISCOUNT/SURCHARGE line item for the price difference
            const isDiscount = actualPriceDifference < 0;
            const label = isDiscount ? 'DISCOUNT' : 'SURCHARGE';
            const taxAmount = actualPriceDifference - (actualPriceDifference / (1 + taxRate / 100));
            
            const compensatingItemData = {
              active_transaction_id: transactionId,
              item_id: payload.item_id,
              quantity: 1, // Always 1 for price adjustments
              unit_price: actualPriceDifference, // The actual difference from original price
              total_price: actualPriceDifference,
              tax_rate: taxRate,
              tax_amount: taxAmount,
              notes: label,
              parent_transaction_item_id: transactionItemId // Add parent reference
            };
            
            await this.transactionRepository.addItem(compensatingItemData, trx);
          }
        }
      }
    }
  }
}

module.exports = TransactionManagementService;