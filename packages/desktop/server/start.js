const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });

// Desktop server entry point
// Migrated from packages/backendOld/src/server.js
const http = require('http');
const WebSocket = require('ws');
const { DesktopServer } = require('./app'); // Desktop-specific Express app

// Import core business logic and services
const { services, db, dbInit } = require('../../core');
const logger = require('../../core/config/logger');

const PORT = process.env.BACKEND_PORT || 3030;
const nodeVersionRequired = '20.0.0';
const currentVersion = process.version;
console.log(`[DEBUG] Node.js version active for this script: ${currentVersion}`);

// Check Node.js version compatibility
const semver = require('semver');
if (semver.major(currentVersion) < 20) {
  console.warn(`[WARNING] Node.js version ${currentVersion} may not be fully compatible. Recommended: v20+ or v24+`);
} else {
  console.log(`[INFO] Node.js version ${currentVersion} is compatible.`);
}

// Storage for tracking processed operationIds
const processedOperationIds = new Set();
const OPERATION_ID_TTL = 60000; // 1 minute TTL

// Helper function to parse JSON fields consistently across database types
// PostgreSQL returns JSONB as objects, SQLite returns them as strings
function parseJsonField(field) {
  // If it's already an object (from PostgreSQL), return as-is
  if (typeof field === 'object' && field !== null) {
    return field;
  }
  // If it's a string (from SQLite), try to parse it
  if (typeof field === 'string') {
    try {
      return JSON.parse(field);
    } catch (error) {
      // If parsing fails, return the original string
      return field;
    }
  }
  // For null, undefined, or other types, return as-is
  return field;
}

async function handleWebSocketMessage(ws, rawMessage) {
  let parsedMessage;
  try {
    parsedMessage = JSON.parse(rawMessage.toString());
    
    // DEBUG: Специальное логирование для getCategories
    if (parsedMessage.command === 'getCategories') {
      console.log('🔍 [Backend] RECEIVED getCategories command:', parsedMessage);
      logger.info({ 
        msg: '🔍 getCategories command received', 
        type: 'websocket_request', 
        direction: 'in', 
        data: parsedMessage, 
        clientId: ws.id || 'unknown' 
      });
    } else {
      logger.info({ type: 'websocket_request', direction: 'in', data: parsedMessage, clientId: ws.id || 'unknown' });
    }
  } catch (error) {
    logger.error({ msg: 'Invalid WebSocket message format (not JSON)', raw: rawMessage.toString(), clientId: ws.id, err: error });
    ws.send(JSON.stringify({ error: 'Invalid message format. Expected JSON.', operationId: null }));
    return;
  }

  const { operationId, command, payload } = parsedMessage;
  
  // DEBUG: Дополнительное логирование для getCategories
  if (command === 'getCategories') {
    console.log('🔍 [Backend] Processing getCategories command with operationId:', operationId);
  }

  if (!operationId) {
    logger.warn({ msg: 'WebSocket message without operationId', data: parsedMessage, clientId: ws.id });
    ws.send(JSON.stringify({ error: 'operationId is required', operationId: null }));
    return;
  }

  if (processedOperationIds.has(operationId)) {
    logger.info({ msg: 'Duplicate WebSocket operationId received, ignoring.', operationId, clientId: ws.id });
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

  // Mark operation as processing
  processedOperationIds.add(operationId);
  setTimeout(() => {
    processedOperationIds.delete(operationId);
  }, OPERATION_ID_TTL);

  // Global try-catch for all command processing to ensure robust error handling
  try {
    // Command processing
    let responsePayload;
    let status = 'success';
    let responseCommand = command + 'Response';

    try {
      if (command === 'ping_ws') {
        responsePayload = { message: 'pong_ws', receivedPayload: payload };
      } else if (command === 'listLayouts') {
        responsePayload = await services.layout.listLayouts();
      } else if (command === 'activateLayout') {
        await services.layout.activateLayout(payload.id);
        responsePayload = { success: true, message: `Layout ${payload.id} activated.` };
      } else if (command === 'saveLayout') {
        const categories = await db('categories').select('*');
        responsePayload = await services.layout.saveLayout(payload.name, categories);
      } else if (command === 'findOrCreateActiveTransaction') {
        const { criteria, userId } = payload;
        responsePayload = await services.transactionManagement.findOrCreateActiveTransaction(criteria, userId);
        if (responsePayload && responsePayload.id) {
            const items = await db('active_transaction_items')
              .leftJoin('items', 'active_transaction_items.item_id', 'items.id')
              .select('active_transaction_items.*', 'items.display_names')
              .where('active_transaction_items.active_transaction_id', responsePayload.id);
            responsePayload.items = items.map(item => ({
              ...item,
              display_names: parseJsonField(item.display_names)
            }));
        }
        responseCommand = 'orderUpdated';
      } else if (command === 'addItemToTransaction') {
        const { transactionId, itemId, quantity, userId } = payload;
        responsePayload = await services.transactionManagement.addItemToTransaction(transactionId, itemId, quantity, userId);
        if (responsePayload && responsePayload.id) {
            const items = await db('active_transaction_items')
              .leftJoin('items', 'active_transaction_items.item_id', 'items.id')
              .select('active_transaction_items.*', 'items.display_names')
              .where('active_transaction_items.active_transaction_id', responsePayload.id);
            responsePayload.items = items.map(item => ({
              ...item,
              display_names: parseJsonField(item.display_names)
            }));
        }
        responseCommand = 'orderUpdated';
      } else if (command === 'finishTransaction') {
        const { transactionId, paymentData, userId } = payload;
        const result = await services.transactionManagement.finishTransaction(transactionId, paymentData, userId);
        
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
        responsePayload = await services.printer.reprintReceipt(transactionId);
        responseCommand = 'reprintResult';
      } else if (command === 'getCategories') {
        console.log('🔍 [Backend] Executing getCategories - fetching from database...');
        const categories = await db('categories').select('*');
        console.log('🔍 [Backend] Raw categories from DB:', categories.length, 'items');
        
        // Use parseJsonField helper to ensure consistent object types across database types
        responsePayload = categories.map(category => ({
          ...category,
          category_names: parseJsonField(category.category_names),
          audit_trail: parseJsonField(category.audit_trail)
        }));
        
        console.log('🔍 [Backend] getCategories processed successfully - prepared', responsePayload.length, 'categories for response');
      } else if (command === 'getItemsByCategory') {
        const { categoryId } = payload;
        if (!categoryId) {
          throw new Error('categoryId is required');
        }
        const items = await services.product.getProductsByCategoryId(categoryId);
        responsePayload = items.map(item => ({
          ...item,
          display_names: parseJsonField(item.display_names),
          pricing_schedules: parseJsonField(item.pricing_schedules),
          availability_schedule: parseJsonField(item.availability_schedule),
          additional_item_attributes: parseJsonField(item.additional_item_attributes),
          item_flags: parseJsonField(item.item_flags),
          audit_trail: parseJsonField(item.audit_trail)
        }));
      } else if (command === 'getRecentReceipts') {
        const { limit } = payload || {};
        const result = await services.reporting.getRecentTransactions(limit);
        if (result.success) {
          responsePayload = {
            ...result,
            transactions: result.transactions.map(tx => ({
              ...tx,
              metadata: parseJsonField(tx.metadata),
              items: tx.items.map(item => ({
                ...item,
                display_names: parseJsonField(item.display_names)
              }))
            }))
          };
        } else {
          responsePayload = result;
        }
      } else if (command === 'logClientEvent') {
        const { level, message, context } = payload;
        services.logging.logSystemEvent(level, message, { ...context, source: 'frontend', clientId: ws.id });
        return; // Fire-and-forget logs
      
      // Authentication commands
      } else if (command === 'login') {
        const { username, password, ipAddress, userAgent } = payload;
        if (!password) {
          throw new Error('Password is required');
        }
        responsePayload = await services.auth.authenticateUser(
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
        const result = await services.auth.logout(sessionId);
        responsePayload = { success: result, message: result ? 'Logged out successfully' : 'Logout failed' };
      } else if (command === 'getCurrentUser') {
        const { sessionId } = payload;
        if (!sessionId) {
          throw new Error('SessionId is required');
        }
        const user = await services.auth.getCurrentUser(sessionId);
        responsePayload = user ? { success: true, user } : { success: false, error: 'Invalid session' };
      
      // Product management with permissions
      } else if (command === 'updateProduct') {
        const { productId, updates, sessionId } = payload;
        if (!productId || !updates || !sessionId) {
          throw new Error('ProductId, updates, and sessionId are required');
        }
        responsePayload = await services.product.updateExistingProduct(productId, updates, sessionId);
      
      // Additional commands truncated for brevity - add remaining as needed
      } else if (command === 'getLoginUsers') {
        responsePayload = await services.auth.getLoginUsers();
      } else if (command === 'systemTimeCheck') {
        const { clientTime } = payload;
        if (!clientTime) {
          throw new Error('clientTime is required');
        }
        const serverTime = new Date();
        const clientTimeObj = new Date(clientTime);
        const timeDifferenceMs = serverTime.getTime() - clientTimeObj.getTime();
        const timeDifferenceSeconds = Math.floor(timeDifferenceMs / 1000);
        
        responsePayload = {
          serverTime: serverTime.toISOString(),
          clientTime: clientTime,
          timeDifferenceMs,
          timeDifferenceSeconds
        };
      } else if (command === 'getParkedTransactions') {
        responsePayload = await services.transactionManagement.getParkedTransactions();
      } else if (command === 'parkTransaction') {
        const { transactionId, tableNumber } = payload;
        responsePayload = await services.transactionManagement.parkTransaction(transactionId, tableNumber);
      } else if (command === 'activateTransaction') {
        const { transactionId } = payload;
        responsePayload = await services.transactionManagement.activateTransaction(transactionId);
      } else if (command === 'checkTableAvailability') {
        const { tableNumber } = payload;
        responsePayload = await services.transactionManagement.checkTableAvailability(tableNumber);
      } else if (command === 'updateTransactionMetadata') {
        const { transactionId, metadata } = payload;
        responsePayload = await services.transactionManagement.updateTransactionMetadata(transactionId, metadata);
      } else {
        status = 'error';
        responsePayload = { message: 'Unknown command', originalCommand: command };
        logger.warn({ msg: 'Unknown WebSocket command', command, operationId, clientId: ws.id });
      }
    } catch (error) {
      status = 'error';
      responsePayload = { message: 'Command execution failed', error: error.message };
      logger.error({ msg: 'WebSocket command execution error', command, operationId, clientId: ws.id, error: error.message, stack: error.stack });
    }

    const response = { 
      operationId, 
      command: responseCommand, 
      status, 
      payload: responsePayload, 
      channel: 'websocket',
      serverTime: new Date().toISOString()
    };
    
    // DEBUG: Специальное логирование для getCategories ответа
    if (responseCommand === 'getCategoriesResponse') {
      console.log('🔍 [Backend] SENDING getCategoriesResponse:', {
        operationId,
        status,
        payloadLength: Array.isArray(responsePayload) ? responsePayload.length : 'not array',
        responseCommand
      });
    }
    
    ws.send(JSON.stringify(response));
    logger.info({ type: 'websocket_response', direction: 'out', data: response, clientId: ws.id });

  } catch (globalError) {
    // Global error handler - ensures we always send a response even if there's an unexpected error
    logger.error({ 
      msg: 'Critical WebSocket handler error', 
      command, 
      operationId, 
      clientId: ws.id, 
      error: globalError.message, 
      stack: globalError.stack 
    });
    
    try {
      const errorResponse = {
        operationId,
        command: command + 'Response',
        status: 'error',
        payload: { 
          message: 'Critical server error occurred', 
          error: globalError.message 
        },
        channel: 'websocket',
        serverTime: new Date().toISOString()
      };
      ws.send(JSON.stringify(errorResponse));
    } catch (sendError) {
      logger.error({ 
        msg: 'Failed to send error response to WebSocket client', 
        clientId: ws.id, 
        sendError: sendError.message 
      });
    }
  }
}

async function getCompanyAndBranchInfo() {
  try {
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
    
    return {
      companyName: 'ecKasse Demo',
      branchName: 'Hauptfiliale',
      branchAddress: 'Musterstraße 1, 12345 Berlin'
    };
  }
}

async function runRecoveryProcess() {
  logger.info('Starting recovery process for stale active transactions...');
  
  try {
    const staleTransactions = await db('active_transactions')
      .where('status', 'active')
      .where('resolution_status', 'none')
      .select('id', 'uuid', 'created_at');

    if (staleTransactions.length > 0) {
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
  }
}

// Global variable to store initialization result
let initializationResult = { isFirstRun: false };

async function startServer() {
  // Ensure default users and roles exist and capture result
  initializationResult = await dbInit.ensureDefaultUsersAndRoles();
  
  // Run recovery process for stale active transactions
  await runRecoveryProcess();

  // Initialize printer service
  try {
    await services.printer.loadPrinters();
    logger.info('Printer service initialized successfully');
  } catch (error) {
    logger.warn('Failed to initialize printer service:', error.message);
  }

  // Create desktop server instance
  const desktopServer = new DesktopServer();
  const app = await desktopServer.initialize();
  
  // Create HTTP server
  const httpServer = http.createServer(app);
  
  // Create WebSocket server
  const wss = new WebSocket.Server({ server: httpServer });
  
  // Initialize WebSocket service for broadcasting
  const websocketService = require('../../core/application/websocket.service');
  websocketService.init(wss);

  // WebSocket connection handler
  wss.on('connection', async (ws, req) => {
    ws.id = Date.now() + '_' + Math.random().toString(36).substring(2,7);
    logger.info({ msg: 'WebSocket client connected', clientId: ws.id, remoteAddress: req.socket.remoteAddress });

    // Auto-login for eckasse.com domain
    if (req.headers.host === 'eckasse.com' || req.headers.host === 'www.eckasse.com') {
      try {
        logger.info({ msg: 'eckasse.com domain: Auto-authenticating client', clientId: ws.id });
        
        const authResult = await services.auth.authenticateUser(
          'admin', 
          '1234', 
          req.socket.remoteAddress || 'eckasse.com-client', 
          'eckasse.com Auto-Login'
        );
        
        if (authResult.success) {
          const sessionMessage = {
            command: 'sessionEstablished',
            payload: {
              user: authResult.user,
              session: authResult.session
            },
            timestamp: new Date().toISOString(),
            clientId: ws.id
          };
          
          ws.send(JSON.stringify(sessionMessage));
          logger.info({ 
            msg: 'eckasse.com domain: Auto-authentication successful', 
            clientId: ws.id,
            username: authResult.user.username
          });
        } else {
          logger.error({ 
            msg: 'eckasse.com domain: Auto-authentication failed', 
            clientId: ws.id,
            error: authResult.error 
          });
        }
      } catch (error) {
        logger.error({ 
          msg: 'eckasse.com domain: Auto-authentication error', 
          clientId: ws.id,
          error: error.message 
        });
      }
    }

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

    // Check if this was the first run and send admin credentials if needed
    if (initializationResult.isFirstRun && initializationResult.defaultUser) {
      const firstRunMessage = {
        command: 'firstRunAdminCreated',
        payload: {
          username: initializationResult.defaultUser.username,
          password: initializationResult.defaultUser.password,
          message: `Willkommen! Admin-Benutzer '${initializationResult.defaultUser.username}' wurde erstellt mit PIN: ${initializationResult.defaultUser.password}`
        },
        timestamp: new Date().toISOString(),
        clientId: ws.id
      };
      
      ws.send(JSON.stringify(firstRunMessage));
      logger.info({ 
        msg: 'Sent first run admin credentials to client', 
        clientId: ws.id,
        username: initializationResult.defaultUser.username 
      });
    }

    // Send pending recovery transactions to newly connected client
    (async () => {
      try {
        const pendingTransactions = await services.transactionManagement.getPendingTransactions();
        
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

  // Start the server
  httpServer.listen(PORT, () => {
    logger.info(`Desktop server (HTTP & WebSocket) listening on http://localhost:${PORT}`);
  });
}

// Initialize and start the server
startServer().catch(error => {
  logger.error('Failed to start server:', error.message);
  logger.error('Error stack:', error.stack);
  console.error('STARTUP ERROR:', error.message);
  console.error('ERROR STACK:', error.stack);
  process.exit(1);
});