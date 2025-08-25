// Main export file for @eckasse/core package
// Provides access to all core business logic and utilities

// Application services
const { AuthService } = require('./application/auth.service');
const layoutService = require('./application/layout.service');
const loggingService = require('./application/logging.service');
const { ProductService } = require('./application/product.service');
const transactionService = require('./application/transaction.service');
const TransactionManagementService = require('./application/transaction_management.service');
const sessionService = require('./application/session.service');
const websocketService = require('./application/websocket.service');
const { ReportingService } = require('./application/reporting.service');
const managerService = require('./application/manager.service');
const printerService = require('./application/printer_service');
const searchService = require('./application/search.service');
const embeddingService = require('./application/embedding.service');
const enrichmentService = require('./application/enrichment.service');
const importService = require('./application/import.service');
const exportService = require('./application/export.service');
const archivalService = require('./application/archival.service');
const hieroService = require('./application/hiero.service');
const systemService = require('./application/system.service');
const categoryService = require('./application/category.service');
const dsfinvkService = require('./application/dsfinvk.service');

// LLM services
const llmProvider = require('./application/llm.provider');
const llmService = require('./application/llm.service');

// Database utilities
const db = require('./db/knex');
const dbInit = require('./db/db_init');

module.exports = {
  // Services - refactored services (AuthService, ProductService, etc.) will be instantiated with DI in start.js
  services: {
    layout: layoutService,
    logging: loggingService,
    transaction: transactionService,
    session: sessionService,
    websocket: websocketService,
    manager: managerService,
    printer: printerService,
    search: searchService,
    embedding: embeddingService,
    enrichment: enrichmentService,
    import: importService,
    export: exportService,
    archival: archivalService,
    hiero: hieroService,
    system: systemService,
    category: categoryService,
    dsfinvk: dsfinvkService,
    llm: llmService,
  },
  
  // LLM
  llm: {
    provider: llmProvider,
    service: llmService,
  },
  
  // Database
  db,
  dbInit,
  
  // Individual service classes for direct require
  AuthService,
  layoutService,
  loggingService,
  ProductService,
  transactionService,
  TransactionManagementService,
  sessionService,
  websocketService,
  ReportingService,
  managerService,
  printerService,
  searchService,
  embeddingService,
  enrichmentService,
  importService,
  exportService,
  archivalService,
  hieroService,
  systemService,
  categoryService,
  dsfinvkService,
  llmProvider,
  llmService,
  dbInit,
};