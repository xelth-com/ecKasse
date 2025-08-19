const logger = require('../config/logger');
const crypto = require('crypto');

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
      const totalAmount = parseFloat(transaction.total_amount);
      const paymentAmount = parseFloat(paymentData.amount);
      if (Math.abs(totalAmount - paymentAmount) > 0.001) {
        throw new Error(`Payment amount (${paymentAmount}) does not match transaction total (${totalAmount}).`);
      }
      const taxBreakdown = await this.transactionRepository.getTaxBreakdown(transactionId, trx);
      const taxRatesOrder = [19.00, 7.00, 10.70, 5.50, 0.00];
      const bruttoSteuerumsaetze = taxRatesOrder.map(rate => {
        const found = taxBreakdown.find(b => parseFloat(b.tax_rate) === rate);
        return found ? parseFloat(found.total).toFixed(2) : '0.00';
      }).join('_');
      const zahlungen = `${paymentAmount.toFixed(2)}:${paymentData.type}`;
      processData = `Beleg^${bruttoSteuerumsaetze}^${zahlungen}`;
      const updateData = { status: 'finished', payment_type: paymentData.type, payment_amount: paymentAmount };
      const updatedTransaction = await this.transactionRepository.update(transactionId, updateData, trx);
      const items = await this.transactionRepository.getItemsWithDetailsByTransactionId(transactionId, trx);
      finishedTransaction = { ...updatedTransaction, items: items };
      return { totalAmount };
    });
    
    const fiscalPayload = {
      transaction_uuid: transaction.uuid,
      processType: 'Kassenbeleg-V1',
      processData: processData,
      payment_type: paymentData.type,
      final_amount: updateResult.totalAmount,
      metadata: transaction.metadata || {}
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
        await this.loggingService.logOperationalEvent(userId, 'print_failed', { transaction_uuid: transaction.uuid, print_error: printResult.message, printer: printResult.printer || 'unknown' });
        return { success: true, fiscal_log: fiscalLogResult.log, transaction: finishedTransaction, print_warning: printResult.message, printStatus: { status: 'failed', error: printResult.message } };
      }
    } catch (printError) {
      await this.loggingService.logOperationalEvent(userId, 'print_error', { transaction_uuid: transaction.uuid, error_message: printError.message });
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
    const metadata = transaction.metadata || {};
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
    const updateData = { metadata: JSON.stringify(metadata) };
    if (updateTimestamp) updateData.updated_at = new Date().toISOString();
    const updatedTransaction = await this.transactionRepository.update(transactionId, updateData);
    return { ...updatedTransaction, metadata: updatedTransaction.metadata };
  }

  async checkTableNumberInUse(tableNumber, excludeTransactionId = null) {
    return this.transactionRepository.isTableInUse(tableNumber, excludeTransactionId);
  }
}

module.exports = TransactionManagementService;