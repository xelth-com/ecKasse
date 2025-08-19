// packages/adapters/database/sqlite/ReportingRepository.js
class ReportingRepository {
  constructor(db) {
    this.db = db;
  }

  async getRecentFinishedTransactions(limit, trx = this.db) {
    return trx('active_transactions')
      .where('status', 'finished')
      .orderBy('updated_at', 'desc')
      .limit(limit)
      .select('*');
  }

  async getTransactionItems(transactionId, trx = this.db) {
    return trx('active_transaction_items')
      .leftJoin('items', 'active_transaction_items.item_id', 'items.id')
      .select(
        'active_transaction_items.*',
        'items.display_names',
        'items.item_price_value'
      )
      .where('active_transaction_items.active_transaction_id', transactionId);
  }

  // Placeholder for more complex sales report queries
  async getSalesReport(startDate, trx = this.db) {
    // In a real system, this would query a dedicated 'transactions' or 'orders' table.
    // Using 'items' as a proxy for now as in the original service.
    return trx('items')
      .where('created_at', '>=', startDate.toISOString())
      .sum('item_price_value as totalRevenue')
      .count('id as transactionCount')
      .first();
  }
}

module.exports = { ReportingRepository };