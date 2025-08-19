// packages/adapters/database/sqlite/TransactionRepository.js
const logger = require('../../../core/config/logger');

class TransactionRepository {
  constructor(db) {
    this.db = db;
  }

  async findActiveById(id, trx = this.db) {
    return trx('active_transactions').where({ id, status: 'active' }).first();
  }

  async findById(id, trx = this.db) {
    return trx('active_transactions').where({ id }).first();
  }

  async findParkedById(id, trx = this.db) {
    return trx('active_transactions').where({ id, status: 'parked' }).first();
  }

  async create(data, trx = this.db) {
    const [result] = await trx('active_transactions').insert(data).returning('*');
    return result;
  }

  async addItem(itemData, trx = this.db) {
    const [newItem] = await trx('active_transaction_items').insert(itemData).returning('*');
    return newItem;
  }

  async update(id, data, trx = this.db) {
    const [updated] = await trx('active_transactions').where({ id }).update(data).returning('*');
    return updated;
  }

  async getItemsWithDetailsByTransactionId(id, trx = this.db) {
    return trx('active_transaction_items')
      .leftJoin('items', 'active_transaction_items.item_id', 'items.id')
      .select(
        'active_transaction_items.*',
        'items.display_names',
        'items.item_price_value'
      )
      .where('active_transaction_items.active_transaction_id', id);
  }

  async getTaxBreakdown(transactionId, trx = this.db) {
    return trx('active_transaction_items')
      .where({ active_transaction_id: transactionId })
      .groupBy('tax_rate')
      .select('tax_rate')
      .sum('total_price as total');
  }

  async getPendingRecoveryTransactions(trx = this.db) {
    return trx('active_transactions')
      .where('resolution_status', 'pending')
      .select('*')
      .orderBy('created_at', 'asc');
  }

  async getParkedTransactions(trx = this.db) {
    return trx('active_transactions')
      .where('status', 'parked')
      .select('*')
      .orderBy('updated_at', 'asc');
  }

  async isTableInUse(tableNumber, excludeTransactionId = null, trx = this.db) {
    let query = trx('active_transactions')
      .where('status', 'parked')
      .whereRaw("json_extract(metadata, '$.table') = ?", [tableNumber]);

    if (excludeTransactionId) {
      query = query.whereNot('id', excludeTransactionId);
    }

    const existing = await query.first();
    return !!existing;
  }

  async delete(id, trx = this.db) {
    return trx('active_transactions').where({ id }).del();
  }
}

module.exports = { TransactionRepository };