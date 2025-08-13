const path = require('path'); // Add this line
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') }); // Add this line
// Ensure this is BEFORE any other require that might need env variables, like your llm.service.js

// packages/backend/src/server.js
const http = require('http');
// Исправленный импорт для совместимости с разными версиями ws
const WebSocket = require('ws');
const app = require('./app'); // Ваше Express-приложение
const logger = require('./config/logger');
// const layoutService = require('../../core/application/layout.service'); // disabled for deployment
const db = require('../../core/db/knex');  
const loggingService = require('../../core/application/logging.service');

require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });

const PORT = process.env.BACKEND_PORT || 3030;
const nodeVersionRequired = '20.0.0';
const currentVersion = process.version;
console.log(`[DEBUG] Node.js version active for this script: ${currentVersion}`);

// Проверка версии Node.js для совместимости с v24
const semver = require('semver');
if (semver.major(currentVersion) < 20) {
  console.warn(`[WARNING] Node.js version ${currentVersion} may not be fully compatible. Recommended: v20+ or v24+`);
} else {
  console.log(`[INFO] Node.js version ${currentVersion} is compatible.`);
}
const httpServer = http.createServer(app);

// Используем правильный конструктор WebSocket Server
const wss = new WebSocket.Server({ server: httpServer });

// Initialize WebSocket service for broadcasting - disabled for deployment
// const websocketService = require('../../core/application/websocket.service'); // disabled for deployment
// websocketService.init(wss);

// Хранилище для отслеживания активных/обработанных operationId (упрощенно)
const processedOperationIds = new Set();
const OPERATION_ID_TTL = 60000; // Время жизни ID операции в мс (например, 1 минута)

async function handleWebSocketMessage(ws, rawMessage) {
  let parsedMessage;
  try {
    parsedMessage = JSON.parse(rawMessage.toString());
    logger.info({ type: 'websocket_request', direction: 'in', data: parsedMessage, clientId: ws.id || 'unknown' });
  } catch (error) {
    logger.error({ msg: 'Invalid WebSocket message format (not JSON)', raw: rawMessage.toString(), clientId: ws.id, err: error });
    ws.send(JSON.stringify({ error: 'Invalid message format. Expected JSON.' , operationId: null }));
    return;
  }

  const { operationId, command, payload } = parsedMessage;

  if (!operationId) {
    logger.warn({ msg: 'WebSocket message without operationId', data: parsedMessage, clientId: ws.id });
    ws.send(JSON.stringify({ error: 'operationId is required', operationId: null }));
    return;
  }

  if (processedOperationIds.has(operationId)) {
    logger.info({ msg: 'Duplicate WebSocket operationId received, ignoring.', operationId, clientId: ws.id });
    // Отправляем подтверждение, что запрос уже обработан (или был обработан)
    // Можно добавить детали, если результат был сохранен
    const response = {
      operationId,
      status: 'already_processed',
      message: `Operation ${operationId} was already processed or is in progress.`,
      channel: 'websocket'
    };
    ws.send(JSON.stringify(response));
    logger.info({ type: 'websocket_response', direction: 'out', data: response, clientId: ws.id });
    return;
  }

  // Помечаем операцию как обрабатываемую
  processedOperationIds.add(operationId);
  setTimeout(() => {
    processedOperationIds.delete(operationId); // Очистка ID через некоторое время
  }, OPERATION_ID_TTL);

  // --- Обработка команды ---
  let responsePayload;
  let status = 'success';
  let responseCommand = command + 'Response';

  try {
    if (command === 'ping_ws') {
      responsePayload = { message: 'pong_ws', receivedPayload: payload };
    } else if (command === 'listLayouts') {
      responsePayload = await layoutService.listLayouts();
    } else if (command === 'activateLayout') {
      await layoutService.activateLayout(payload.id);
      responsePayload = { success: true, message: `Layout ${payload.id} activated.` };
    } else if (command === 'saveLayout') {
      const categories = await db('categories').select('*'); // Example: saving current state
      responsePayload = await layoutService.saveLayout(payload.name, categories);
    } else if (command === 'findOrCreateActiveTransaction') {
      const { criteria, userId } = payload;
      const transactionManagementService = require('./services/transaction_management.service.js');
      responsePayload = await transactionManagementService.findOrCreateActiveTransaction(criteria, userId);
      if (responsePayload && responsePayload.id) {
          const items = await db('active_transaction_items')
            .leftJoin('items', 'active_transaction_items.item_id', 'items.id')
            .select('active_transaction_items.*', 'items.display_names')
            .where('active_transaction_items.active_transaction_id', responsePayload.id);
          responsePayload.items = items;
      }
      responseCommand = 'orderUpdated';
    } else if (command === 'addItemToTransaction') {
      const { transactionId, itemId, quantity, userId } = payload;
      const transactionManagementService = require('./services/transaction_management.service.js');
      responsePayload = await transactionManagementService.addItemToTransaction(transactionId, itemId, quantity, userId);
      // Fetch items with display_names from products table
      if (responsePayload && responsePayload.id) {
          const items = await db('active_transaction_items')
            .leftJoin('items', 'active_transaction_items.item_id', 'items.id')
            .select('active_transaction_items.*', 'items.display_names')
            .where('active_transaction_items.active_transaction_id', responsePayload.id);
          responsePayload.items = items;
      }
      responseCommand = 'orderUpdated';
    } else if (command === 'finishTransaction') {
      const { transactionId, paymentData, userId } = payload;
      const transactionManagementService = require('./services/transaction_management.service.js');
      const result = await transactionManagementService.finishTransaction(transactionId, paymentData, userId);
      
      // Include printStatus in response payload for UI notifications
      responsePayload = {
        ...result,
        printStatus: result.printStatus || { status: 'unknown' }
      };
      responseCommand = 'transactionFinished';
    } else if (command === 'reprintReceipt') {
      const { transactionId } = payload;
      if (!transactionId) {
        throw new Error('transactionId is required for reprint');
      }
      const printerService = require('./services/printer_service.js');
      responsePayload = await printerService.reprintReceipt(transactionId);
      responseCommand = 'reprintResult';
    } else if (command === 'getCategories') {
      responsePayload = await db('categories').select('*');
    } else if (command === 'getItemsByCategory') {
      const { categoryId } = payload;
      if (!categoryId) {
        throw new Error('categoryId is required');
      }
      const productService = require('./services/product.service');
      responsePayload = await productService.getProductsByCategoryId(categoryId);
    } else if (command === 'getRecentReceipts') {
      const { limit } = payload || {};
      const reportingService = require('./services/reporting.service');
      responsePayload = await reportingService.getRecentTransactions(limit);
    } else if (command === 'logClientEvent') {
      const { level, message, context } = payload;
      // Log the event from the client without sending a response back
      loggingService.logSystemEvent(level, message, { ...context, source: 'frontend', clientId: ws.id });
      return; // End execution here for fire-and-forget logs
    
    // Authentication commands
    } else if (command === 'login') {
      const { username, password, ipAddress, userAgent } = payload;
      if (!username || !password) {
        throw new Error('Username and password are required');
      }
      const authService = require('./services/auth.service');
      responsePayload = await authService.authenticateUser(
        username, 
        password, 
        ipAddress || 'unknown', 
        userAgent || 'unknown'
      );
    } else if (command === 'logout') {
      const { sessionId } = payload;
      if (!sessionId) {
        throw new Error('SessionId is required');
      }
      const authService = require('./services/auth.service');
      const result = await authService.logout(sessionId);
      responsePayload = { success: result, message: result ? 'Logged out successfully' : 'Logout failed' };
    } else if (command === 'getCurrentUser') {
      const { sessionId } = payload;
      if (!sessionId) {
        throw new Error('SessionId is required');
      }
      const authService = require('./services/auth.service');
      const user = await authService.getCurrentUser(sessionId);
      responsePayload = user ? { success: true, user } : { success: false, error: 'Invalid session' };
    
    // Product management with permissions
    } else if (command === 'updateProduct') {
      const { productId, updates, sessionId } = payload;
      if (!productId || !updates || !sessionId) {
        throw new Error('ProductId, updates, and sessionId are required');
      }
      const productService = require('./services/product.service');
      responsePayload = await productService.updateExistingProduct(productId, updates, sessionId);
    
    // Storno operations
    } else if (command === 'performStorno') {
      const { sessionId, transactionId, amount, reason, isEmergency } = payload;
      if (!sessionId || !transactionId || !amount || !reason) {
        throw new Error('SessionId, transactionId, amount, and reason are required');
      }
      const transactionService = require('./services/transaction.service');
      responsePayload = await transactionService.performStorno(
        sessionId, 
        transactionId, 
        parseFloat(amount), 
        reason, 
        Boolean(isEmergency)
      );
    } else if (command === 'approveStorno') {
      const { managerSessionId, stornoId, approvalNotes } = payload;
      if (!managerSessionId || !stornoId) {
        throw new Error('ManagerSessionId and stornoId are required');
      }
      const transactionService = require('./services/transaction.service');
      responsePayload = await transactionService.approveStorno(managerSessionId, stornoId, approvalNotes);
    } else if (command === 'rejectStorno') {
      const { managerSessionId, stornoId, rejectionReason } = payload;
      if (!managerSessionId || !stornoId) {
        throw new Error('ManagerSessionId and stornoId are required');
      }
      const transactionService = require('./services/transaction.service');
      responsePayload = await transactionService.rejectStorno(managerSessionId, stornoId, rejectionReason);
    } else if (command === 'getPendingStornos') {
      const { sessionId } = payload;
      if (!sessionId) {
        throw new Error('SessionId is required');
      }
      const transactionService = require('./services/transaction.service');
      responsePayload = await transactionService.getPendingStornos(sessionId);
    
    // Manager operations for pending changes
    } else if (command === 'getPendingChanges') {
      const { sessionId, filterType } = payload;
      if (!sessionId) {
        throw new Error('SessionId is required');
      }
      const managerService = require('./services/manager.service');
      responsePayload = await managerService.getPendingChanges(sessionId, filterType);
    } else if (command === 'approveChange') {
      const { sessionId, changeId, approvalNotes } = payload;
      if (!sessionId || !changeId) {
        throw new Error('SessionId and changeId are required');
      }
      const managerService = require('./services/manager.service');
      responsePayload = await managerService.approveChange(sessionId, changeId, approvalNotes);
    } else if (command === 'rejectChange') {
      const { sessionId, changeId, rejectionReason } = payload;
      if (!sessionId || !changeId) {
        throw new Error('SessionId and changeId are required');
      }
      const managerService = require('./services/manager.service');
      responsePayload = await managerService.rejectChange(sessionId, changeId, rejectionReason);
    } else if (command === 'batchProcessChanges') {
      const { sessionId, actions } = payload;
      if (!sessionId || !actions || !Array.isArray(actions)) {
        throw new Error('SessionId and actions array are required');
      }
      const managerService = require('./services/manager.service');
      responsePayload = await managerService.batchProcessChanges(sessionId, actions);
    } else if (command === 'getManagerDashboard') {
      const { sessionId } = payload;
      if (!sessionId) {
        throw new Error('SessionId is required');
      }
      const managerService = require('./services/manager.service');
      responsePayload = await managerService.getDashboardStats(sessionId);
    
    // Permission checking
    } else if (command === 'checkPermission') {
      const { sessionId, permission } = payload;
      if (!sessionId || !permission) {
        throw new Error('SessionId and permission are required');
      }
      const authService = require('./services/auth.service');
      const hasPermission = await authService.hasPermission(sessionId, permission);
      responsePayload = { hasPermission, permission };
    } else if (command === 'canPerformAction') {
      const { sessionId, action } = payload;
      if (!sessionId || !action) {
        throw new Error('SessionId and action are required');
      }
      const authService = require('./services/auth.service');
      const canPerform = await authService.canPerformAction(sessionId, action);
      responsePayload = { canPerform, action };
    } else if (command === 'getLoginUsers') {
      const authService = require('./services/auth.service');
      responsePayload = await authService.getLoginUsers();
    
    // Pending transaction resolution
    } else if (command === 'resolvePendingTransaction') {
      const { transactionId, resolution, userId } = payload;
      if (!transactionId || !resolution || !userId) {
        throw new Error('TransactionId, resolution, and userId are required');
      }
      const transactionManagementService = require('./services/transaction_management.service');
      responsePayload = await transactionManagementService.resolvePendingTransaction(transactionId, resolution, userId);
    
    // Parked orders management
    } else if (command === 'parkTransaction') {
      const { transactionId, tableIdentifier, userId, updateTimestamp } = payload;
      if (!transactionId || !tableIdentifier || !userId) {
        throw new Error('TransactionId, tableIdentifier, and userId are required');
      }
      const transactionManagementService = require('./services/transaction_management.service');
      responsePayload = await transactionManagementService.parkTransaction(transactionId, tableIdentifier, userId, updateTimestamp);
    } else if (command === 'activateTransaction') {
      const { transactionId, userId, updateTimestamp } = payload;
      if (!transactionId || !userId) {
        throw new Error('TransactionId and userId are required');
      }
      const transactionManagementService = require('./services/transaction_management.service');
      responsePayload = await transactionManagementService.activateTransaction(transactionId, userId, updateTimestamp);
      responseCommand = 'orderUpdated';
    } else if (command === 'getParkedTransactions') {
      const transactionManagementService = require('./services/transaction_management.service');
      responsePayload = await transactionManagementService.getParkedTransactions(payload.sessionId || null);
    } else if (command === 'updateTransactionMetadata') {
      const { transactionId, metadata, userId, updateTimestamp = false } = payload;
      if (!transactionId || !metadata || !userId) {
        throw new Error('TransactionId, metadata, and userId are required');
      }
      const transactionManagementService = require('./services/transaction_management.service');
      responsePayload = await transactionManagementService.updateTransactionMetadata(transactionId, metadata, userId, updateTimestamp);
    } else if (command === 'checkTableAvailability') {
      const { tableNumber, excludeTransactionId } = payload;
      if (!tableNumber) {
        throw new Error('Table number is required');
      }
      const transactionManagementService = require('./services/transaction_management.service');
      const isInUse = await transactionManagementService.checkTableNumberInUse(tableNumber, excludeTransactionId);
      responsePayload = { tableNumber, isInUse };
      responseCommand = 'checkTableAvailabilityResponse';
    
    } else {
      status = 'error';
      responsePayload = { message: 'Unknown command', originalCommand: command };
      logger.warn({ msg: 'Unknown WebSocket command', command, operationId, clientId: ws.id });
    }
  } catch (error) {
    status = 'error';
    responsePayload = { message: 'Command execution failed', error: error.message };
    logger.error({ msg: 'WebSocket command execution error', command, operationId, clientId: ws.id, error: error.message });
  }
  // --- Конец обработки команды ---

  const response = { 
    operationId, 
    command: responseCommand, 
    status, 
    payload: responsePayload, 
    channel: 'websocket',
    serverTime: new Date().toISOString()
  };
  ws.send(JSON.stringify(response));
  logger.info({ type: 'websocket_response', direction: 'out', data: response, clientId: ws.id });
}


wss.on('connection', (ws, req) => {
  // req.socket.remoteAddress можно использовать для получения IP, если нужно
  ws.id = Date.now() + '_' + Math.random().toString(36).substring(2,7); // Простой уникальный ID для клиента
  logger.info({ msg: 'WebSocket client connected', clientId: ws.id, remoteAddress: req.socket.remoteAddress });

  ws.on('message', (message) => {
    handleWebSocketMessage(ws, message);
  });

  ws.on('close', () => {
    logger.info({ msg: 'WebSocket client disconnected', clientId: ws.id });
  });

  ws.on('error', (error) => {
    logger.error({ msg: 'WebSocket client error', clientId: ws.id, err: error });
  });

  ws.send(JSON.stringify({ 
    message: 'Welcome to ecKasse WebSocket API!', 
    clientId: ws.id,
    serverTime: new Date().toISOString()
  }));

  // Send pending recovery transactions to the newly connected client
  (async () => {
    try {
      const transactionManagementService = require('./services/transaction_management.service');
      const pendingTransactions = await transactionManagementService.getPendingTransactions();
      
      if (pendingTransactions.length > 0) {
        const pendingMessage = {
          command: 'pendingTransactions',
          payload: {
            transactions: pendingTransactions,
            count: pendingTransactions.length
          },
          timestamp: new Date().toISOString(),
          clientId: ws.id
        };
        
        ws.send(JSON.stringify(pendingMessage));
        logger.info({ 
          msg: 'Sent pending recovery transactions to client', 
          clientId: ws.id, 
          count: pendingTransactions.length 
        });
      } else {
        logger.info({ 
          msg: 'No pending recovery transactions to send to client', 
          clientId: ws.id 
        });
        
        // Send company/branch info since no pending transactions exist
        try {
          const companyInfo = await getCompanyAndBranchInfo();
          const initialAppDataMessage = {
            command: 'initialAppData',
            payload: {
              companyInfo
            },
            serverTime: new Date().toISOString(),
            clientId: ws.id
          };
          
          ws.send(JSON.stringify(initialAppDataMessage));
          logger.info({ 
            msg: 'Sent initial app data (company info) to client', 
            clientId: ws.id,
            companyInfo
          });
        } catch (error) {
          logger.error({ 
            msg: 'Failed to send initial app data to client', 
            clientId: ws.id, 
            error: error.message 
          });
        }
      }
    } catch (error) {
      logger.error({ 
        msg: 'Failed to send pending recovery transactions to client', 
        clientId: ws.id, 
        error: error.message 
      });
    }
  })();
});

/**
 * Gets company and branch information from the database
 */
async function getCompanyAndBranchInfo() {
  try {
    // Get company information - assuming there's a company/settings table
    // This is a placeholder - adjust according to your actual database schema
    const companyData = await db('companies').first() || {};
    const branchData = await db('branches').first() || {};
    
    return {
      companyName: companyData.name || 'ecKasse Demo',
      branchName: branchData.name || 'Hauptfiliale',
      branchAddress: branchData.address || 'Musterstraße 1, 12345 Berlin'
    };
    
  } catch (error) {
    logger.warn({ 
      msg: 'Could not fetch company/branch info from database, using defaults', 
      error: error.message 
    });
    
    // Return default values if database tables don't exist yet
    return {
      companyName: 'ecKasse Demo',
      branchName: 'Hauptfiliale',
      branchAddress: 'Musterstraße 1, 12345 Berlin'
    };
  }
}

/**
 * Runs recovery process to identify stale active transactions and mark them as pending for manual resolution.
 * This function runs on startup and finds transactions left in 'active' state from previous sessions.
 */
async function runRecoveryProcess() {
  logger.info('Starting recovery process for stale active transactions...');
  
  try {
    // Find all transactions that are still 'active' but have resolution_status 'none'
    // These are transactions that were left hanging from a previous session
    const staleTransactions = await db('active_transactions')
      .where('status', 'active')
      .where('resolution_status', 'none')
      .select('id', 'uuid', 'created_at');

    if (staleTransactions.length > 0) {
      // Update their resolution_status to 'pending' for manual resolution
      await db('active_transactions')
        .where('status', 'active')
        .where('resolution_status', 'none')
        .update('resolution_status', 'pending');

      logger.warn({ 
        count: staleTransactions.length,
        transactions: staleTransactions.map(t => ({ id: t.id, uuid: t.uuid, created_at: t.created_at }))
      }, `Marked ${staleTransactions.length} stale transactions as pending for recovery.`);
    } else {
      logger.info('No stale active transactions found. System is clean.');
    }
  } catch (error) {
    logger.error({ 
      msg: 'Failed to run recovery process for stale active transactions.', 
      error: error.message, 
      stack: error.stack 
    });
    // Continue startup even if recovery fails, but log the critical error
  }
}

/**
 * Initializes and starts the server.
 * Runs the recovery process for pending fiscal operations before accepting connections.
 */
async function startServer() {
  const { recoverPendingFiscalOperations } = require('./scripts/recover_pending_operations');
  const { ensureDefaultUsersAndRoles, validateDatabaseStructure } = require('../../core/db/db_init');
  
  // Step 1: Validate database structure
  const structureValid = await validateDatabaseStructure();
  if (!structureValid) {
    logger.error('Database structure validation failed. Please run migrations.');
    process.exit(1);
  }
  
  // Step 2: Ensure default users and roles exist (CRITICAL for preventing lockout)
  await ensureDefaultUsersAndRoles();
  
  // Step 3: Ensure data integrity by recovering any pending operations from the last session.
  await recoverPendingFiscalOperations();
  
  // Step 4: Run recovery process for stale active transactions
  await runRecoveryProcess();

  // Step 5: Initialize printer service
  try {
    const printerService = require('./services/printer_service');
    await printerService.loadPrinters();
    logger.info('Printer service initialized successfully');
  } catch (error) {
    logger.warn('Failed to initialize printer service:', error.message);
  }

  // Step 6: Start the server
  httpServer.listen(PORT, () => {
    logger.info(`Backend server (HTTP & WebSocket) listening on http://localhost:${PORT}`);
  });
}

// Start the server - simplified startup for now
httpServer.listen(PORT, () => {
  logger.info(`Backend server (HTTP & WebSocket) listening on http://localhost:${PORT}`);
});