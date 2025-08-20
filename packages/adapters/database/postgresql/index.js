// PostgreSQL Adapter Implementation
// This adapter provides database access for the web application

const { ProductRepository } = require('./ProductRepository');
const { TransactionRepository } = require('./TransactionRepository');
const { AuthRepository } = require('./AuthRepository');
const { ReportingRepository } = require('./ReportingRepository');

class PostgreSQLAdapter {
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

module.exports = { PostgreSQLAdapter };
