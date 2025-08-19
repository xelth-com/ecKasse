// SQLite Adapter Implementation
// This adapter provides database access for the desktop application
// Uses SQLite database with Knex.js for query building

const { ProductRepository } = require('./ProductRepository');
const { TransactionRepository } = require('./TransactionRepository');
const { AuthRepository } = require('./AuthRepository');
const { ReportingRepository } = require('./ReportingRepository');

class SQLiteAdapter {
  constructor(db) {
    this.db = db;
    this.productRepository = new ProductRepository(db);
    this.transactionRepository = new TransactionRepository(db);
    this.authRepository = new AuthRepository(db);
    this.reportingRepository = new ReportingRepository(db);
  }

  getProductRepository() {
    return this.productRepository;
  }

  getTransactionRepository() {
    return this.transactionRepository;
  }

  getAuthRepository() {
    return this.authRepository;
  }

  getReportingRepository() {
    return this.reportingRepository;
  }

  async disconnect() {
    if (this.db) {
      await this.db.destroy();
    }
  }
}

module.exports = { SQLiteAdapter };
