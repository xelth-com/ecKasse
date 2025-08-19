// SQLite Adapter Implementation
// This adapter provides database access for the desktop application
// Uses SQLite database with Knex.js for query building

const { ProductRepository } = require('./ProductRepository');

class SQLiteAdapter {
  constructor(db) {
    this.db = db;
    this.productRepository = new ProductRepository(db);
  }

  getProductRepository() {
    return this.productRepository;
  }

  async disconnect() {
    if (this.db) {
      await this.db.destroy();
    }
  }
}

module.exports = { SQLiteAdapter };
