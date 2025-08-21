// packages/adapters/database/postgresql/ReportingRepository.js
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
    const items = await trx('active_transaction_items')
      .leftJoin('items', 'active_transaction_items.item_id', 'items.id')
      .select(
        'active_transaction_items.*',
        'items.display_names',
        'items.item_price_value'
      )
      .where('active_transaction_items.active_transaction_id', transactionId)
      .orderBy('active_transaction_items.updated_at', 'asc');
    
    // Preserve original order but group modifications right after their parent items
    const originalItems = items.filter(item => item.parent_transaction_item_id === null);
    const modifications = items.filter(item => item.parent_transaction_item_id !== null);
    
    const result = [];
    
    for (const originalItem of originalItems) {
      // Add the original item
      result.push(originalItem);
      
      // Add any modifications for this item, sorted by their creation time
      const itemModifications = modifications
        .filter(mod => mod.parent_transaction_item_id === originalItem.id)
        .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
      
      result.push(...itemModifications);
    }
    
    // Add any orphaned modifications (items with parent_transaction_item_id that don't match any original item)
    const orphanedModifications = modifications.filter(mod => 
      !originalItems.some(orig => orig.id === mod.parent_transaction_item_id)
    );
    result.push(...orphanedModifications);
    
    return result;
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