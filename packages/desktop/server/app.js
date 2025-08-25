// Desktop-specific server
// Connects core business logic to SQLite adapter
// Based on original backend/src/app.js but restructured for new architecture

const express = require('express');
const path = require('path');
const cors = require('cors');
const crypto = require('crypto');
const session = require('express-session');
const SQLiteStore = require('connect-sqlite3')(session);

const logger = require('../../core/config/logger');

// Import routes
const llmRoutes = require('./routes/llm.routes');
const menuRoutes = require('./routes/menu.routes');
const exportRoutes = require('./routes/export.routes');
const sessionController = require('./controllers/session.controller');

class DesktopServer {
  constructor(services, authService, reportingService) {
    this.app = express();
    this.services = services;
    this.authService = authService;
    this.reportingService = reportingService;
    this.processedHttpOperationIds = new Set();
    this.HTTP_OPERATION_ID_TTL = 60000;
    this.processedOperationIds = new Set();
    this.OPERATION_ID_TTL = 60000;
    
    // Configure session middleware
    this.sessionMiddleware = session({
      store: new SQLiteStore({ db: 'sessions.db' }),
      secret: process.env.SESSION_SECRET || 'your-secure-secret-key-change-in-production',
      resave: false,
      saveUninitialized: false,
      cookie: {
        secure: process.env.HTTPS === 'true', // Only secure if explicitly using HTTPS
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000, // 24 hours
        sameSite: 'lax'
      }
    });
  }

  async initialize() {
    this.setupMiddleware();
    this.setupRoutes();
    return this.app;
  }

  getSessionMiddleware() {
    return this.sessionMiddleware;
  }

  setupMiddleware() {
    this.app.use((req, res, next) => {
      req.correlationId = req.headers['x-correlation-id'] || crypto.randomUUID();
      res.setHeader('X-Correlation-ID', req.correlationId);
      next();
    });
    this.app.use(cors({
      credentials: true,
      origin: true
    }));
    this.app.use(express.json());
    this.app.use(express.urlencoded({ extended: true }));
    
    // Apply session middleware
    this.app.use(this.sessionMiddleware);

    // Request logging
    this.app.use((req, res, next) => {
      const operationId = req.query.operationId || (req.body && req.body.operationId);
      const correlationId = req.correlationId;
      logger.info({
        type: 'http_request',
        direction: 'in',
        operationId,
        correlationId,
        method: req.method,
        url: req.originalUrl,
        body: req.body,
        query: req.query,
        ip: req.ip
      });
      next();
    });

    // Serve static files from frontend dist
    const staticPath = path.join(__dirname, '../frontend/dist');
    this.app.use(express.static(staticPath));
    logger.info(`Serving static files from: ${staticPath}`);
  }

  setupRoutes() {
    // Mount LLM routes
    this.app.use('/api/llm', llmRoutes);
    
    // Mount menu routes
    this.app.use('/api/menu', menuRoutes);
    
    // Mount export routes
    this.app.use('/api/export', exportRoutes);

    // Session status endpoint
    this.app.get('/api/session/status', sessionController.getSessionStatus);

    // HTTP Login endpoint
    this.app.post('/api/auth/login', async (req, res) => {
      try {
        const { username, password } = req.body;
        if (!password) {
          return res.status(400).json({ success: false, error: 'Password is required' });
        }
        
        const result = await this.authService.authenticateUser(
          username,
          password,
          req.ip || 'unknown',
          req.get('User-Agent') || 'unknown'
        );
        
        if (result.success && result.user) {
          // Store user in session
          req.session.user = {
            id: result.user.id,
            username: result.user.username,
            role: result.user.role
          };
        }
        
        res.json(result);
      } catch (error) {
        logger.error({ msg: 'HTTP login error', err: error });
        res.status(500).json({ success: false, error: 'Login failed' });
      }
    });

    // HTTP Logout endpoint
    this.app.post('/api/auth/logout', (req, res) => {
      if (req.session.user) {
        req.session.user = null;
        res.json({ success: true, message: 'Logged out successfully' });
      } else {
        res.json({ success: false, message: 'No active session' });
      }
    });

    // Simple users API endpoint for login screen
    this.app.get('/api/users', async (req, res) => {
      try {
        const users = await this.authService.getLoginUsers();
        res.json(users);
      } catch (error) {
        logger.error({ msg: 'Error fetching users', err: error });
        res.status(500).json({ error: 'Failed to fetch users' });
      }
    });

    // HTTP fallback endpoint for WebSocket commands
    this.app.post('/api/websocket-fallback', async (req, res) => {
      const { operationId, command, payload } = req.body;

      if (!operationId) {
        logger.warn({ msg: 'HTTP fallback request without operationId' });
        return res.status(400).json({ error: 'operationId is required' });
      }

      if (this.processedHttpOperationIds.has(operationId)) {
        logger.info({ msg: 'Duplicate HTTP fallback operationId received', operationId });
        return res.json({
          operationId,
          status: 'already_processed',
          message: `Operation ${operationId} was already processed via HTTP.`,
          channel: 'http'
        });
      }

      this.processedHttpOperationIds.add(operationId);
      setTimeout(() => {
        this.processedHttpOperationIds.delete(operationId);
      }, this.HTTP_OPERATION_ID_TTL);

      let responsePayload;
      let status = 'success';
      let responseCommand = command + 'Response';

      try {
        if (command === 'getParkedTransactions') {
          responsePayload = await this.services.transactionManagement.getParkedTransactions();
        } else if (command === 'activateTransaction') {
          const { transactionId, userId, updateTimestamp } = payload;
          if (!transactionId || !userId) {
            throw new Error('TransactionId and userId are required');
          }
          responsePayload = await this.services.transactionManagement.activateTransaction(transactionId, userId, updateTimestamp);
          responseCommand = 'orderUpdated';
        } else {
          status = 'error';
          responsePayload = { message: 'Command not supported in HTTP fallback', originalCommand: command };
          logger.warn({ msg: 'Unsupported HTTP fallback command', command, operationId });
        }
      } catch (error) {
        status = 'error';
        responsePayload = { message: 'Command execution failed', error: error.message };
        logger.error({ msg: 'HTTP fallback command execution error', command, operationId, error: error.message });
      }

      const response = {
        operationId,
        command: responseCommand,
        status,
        payload: responsePayload,
        channel: 'http',
        serverTime: new Date().toISOString()
      };

      logger.info({ type: 'http_response', direction: 'out', data: response });
      res.json(response);
    });

    // System mode endpoint
    this.app.get('/api/system/mode', (req, res) => {
      const mode = process.env.APP_MODE || process.env.NODE_ENV || 'production';
      res.json({ mode });
    });

    // Ping endpoint
    this.app.get('/api/ping', (req, res) => {
      const operationId = req.query.operationId;

      if (!operationId) {
        logger.warn({ msg: 'HTTP /api/ping request without operationId' });
        return res.status(400).json({ error: 'operationId is required in query parameters' });
      }

      if (this.processedHttpOperationIds.has(operationId)) {
        logger.info({ msg: 'Duplicate HTTP /api/ping operationId received', operationId });
        return res.json({
          operationId,
          status: 'already_processed',
          message: `Operation ${operationId} was already processed or is in progress via HTTP.`,
          channel: 'http'
        });
      }

      this.processedHttpOperationIds.add(operationId);
      setTimeout(() => {
        this.processedHttpOperationIds.delete(operationId);
      }, this.HTTP_OPERATION_ID_TTL);

      const responsePayload = { message: 'pong from ecKasse desktop server!', timestamp: new Date().toISOString() };
      const response = { 
        operationId, 
        status: 'success', 
        payload: responsePayload, 
        channel: 'http',
        serverTime: new Date().toISOString()
      };

      logger.info({ type: 'http_response', direction: 'out', operationId, data: response });
      res.json(response);
    });

    // Catch-all route for SPA - return index.html for all non-API routes
    this.app.get('*', (req, res, next) => {
      if (req.originalUrl.startsWith('/api')) {
        const error = new Error('API Route Not Found');
        error.status = 404;
        logger.warn({ msg: 'API route not found', url: req.originalUrl });
        return next(error);
      }
      
      res.sendFile(path.join(__dirname, '../frontend/dist/index.html'));
    });

    // Global error handler
    this.app.use((error, req, res, next) => {
      logger.error({
        msg: 'Global error handler caught an error',
        err: { message: error.message, stack: error.stack, status: error.status || 500 },
        url: req.originalUrl
      });
      res.status(error.status || 500);
      res.json({
        error: {
          message: error.message || 'Internal Server Error',
        },
      });
    });
  }

  // Helper function to parse JSON fields consistently across database types
  parseJsonField(field) {
    if (typeof field === 'object' && field !== null) {
      return field;
    }
    if (typeof field === 'string') {
      try {
        return JSON.parse(field);
      } catch (error) {
        return field;
      }
    }
    return field;
  }

  async handleWebSocketMessage(ws, rawMessage, db) {
    let parsedMessage;
    try {
      parsedMessage = JSON.parse(rawMessage.toString());
      
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
    const correlationId = crypto.randomUUID();
    
    if (command === 'getCategories') {
      console.log('🔍 [Backend] Processing getCategories command with operationId:', operationId);
    }

    if (!operationId) {
      logger.warn({ msg: 'WebSocket message without operationId', data: parsedMessage, clientId: ws.id });
      ws.send(JSON.stringify({ error: 'operationId is required', operationId: null }));
      return;
    }

    if (this.processedOperationIds.has(operationId)) {
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

    this.processedOperationIds.add(operationId);
    setTimeout(() => {
      this.processedOperationIds.delete(operationId);
    }, this.OPERATION_ID_TTL);

    try {
      let responsePayload;
      let status = 'success';
      let responseCommand = command + 'Response';

      try {
        if (command === 'ping_ws') {
          responsePayload = { message: 'pong_ws', receivedPayload: payload };
        } else if (command === 'listLayouts') {
          responsePayload = await this.services.layout.listLayouts();
        } else if (command === 'activateLayout') {
          await this.services.layout.activateLayout(payload.id);
          responsePayload = { success: true, message: `Layout ${payload.id} activated.` };
        } else if (command === 'saveLayout') {
          const categories = await db('categories').select('*');
          responsePayload = await this.services.layout.saveLayout(payload.name, categories);
        } else if (command === 'findOrCreateActiveTransaction') {
          const { criteria, userId } = payload;
          responsePayload = await this.services.transactionManagement.findOrCreateActiveTransaction(criteria, userId, correlationId);
          if (responsePayload && responsePayload.id) {
              const items = await db('active_transaction_items')
                .leftJoin('items', 'active_transaction_items.item_id', 'items.id')
                .select('active_transaction_items.*', 'items.display_names')
                .where('active_transaction_items.active_transaction_id', responsePayload.id);
              responsePayload.items = items.map(item => ({
                ...item,
                display_names: this.parseJsonField(item.display_names)
              }));
          }
          responseCommand = 'orderUpdated';
        } else if (command === 'addItemToTransaction') {
          const { transactionId, itemId, quantity, userId } = payload;
          responsePayload = await this.services.transactionManagement.addItemToTransaction(transactionId, itemId, quantity, userId, {}, correlationId);
          if (responsePayload && responsePayload.id) {
              const items = await db('active_transaction_items')
                .leftJoin('items', 'active_transaction_items.item_id', 'items.id')
                .select('active_transaction_items.*', 'items.display_names')
                .where('active_transaction_items.active_transaction_id', responsePayload.id);
              responsePayload.items = items.map(item => ({
                ...item,
                display_names: this.parseJsonField(item.display_names)
              }));
          }
          responseCommand = 'orderUpdated';
        } else if (command === 'finishTransaction') {
          const { transactionId, paymentData, userId } = payload;
          const result = await this.services.transactionManagement.finishTransaction(transactionId, paymentData, userId, correlationId);
          
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
          const printResult = await this.services.printer.reprintReceipt(transactionId);
          
          // Send feedback via WebSocket instead of returning payload
          if (printResult.status === 'success') {
            this.services.websocket.broadcast('displayAgentMessage', {
              timestamp: new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
              type: 'agent',
              message: `Beleg №${transactionId} Nachdruck erfolgreich`,
              style: 'print-success'
            });
          } else {
            this.services.websocket.broadcast('displayAgentMessage', {
              timestamp: new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
              type: 'agent',
              message: `Nachdruck-Fehler: ${printResult.message}`,
              style: 'print-error'
            });
          }
          
          responsePayload = { success: printResult.status === 'success' };
          responseCommand = 'reprintResult';
        } else if (command === 'getCategories') {
          console.log('🔍 [Backend] Executing getCategories - fetching from database...');
          const categories = await db('categories').select('*');
          console.log('🔍 [Backend] Raw categories from DB:', categories.length, 'items');
          
          responsePayload = categories.map(category => ({
            ...category,
            category_names: this.parseJsonField(category.category_names),
            audit_trail: this.parseJsonField(category.audit_trail)
          }));
          
          console.log('🔍 [Backend] getCategories processed successfully - prepared', responsePayload.length, 'categories for response');
        } else if (command === 'getItemsByCategory') {
          const { categoryId } = payload;
          if (!categoryId) {
            throw new Error('categoryId is required');
          }
          const items = await this.services.product.getProductsByCategoryId(categoryId);
          responsePayload = items.map(item => ({
            ...item,
            display_names: this.parseJsonField(item.display_names),
            pricing_schedules: this.parseJsonField(item.pricing_schedules),
            availability_schedule: this.parseJsonField(item.availability_schedule),
            additional_item_attributes: this.parseJsonField(item.additional_item_attributes),
            item_flags: this.parseJsonField(item.item_flags),
            audit_trail: this.parseJsonField(item.audit_trail)
          }));
        } else if (command === 'getRecentReceipts') {
          const { limit } = payload || {};
          const result = await this.reportingService.getRecentTransactions(limit);
          if (result.success) {
            responsePayload = {
              ...result,
              transactions: result.transactions.map(tx => ({
                ...tx,
                metadata: this.parseJsonField(tx.metadata),
                items: tx.items.map(item => ({
                  ...item,
                  display_names: this.parseJsonField(item.display_names)
                }))
              }))
            };
          } else {
            responsePayload = result;
          }
        } else if (command === 'logClientEvent') {
          const { level, message, context } = payload;
          this.services.logging.logSystemEvent(level, message, { ...context, source: 'frontend', clientId: ws.id });
          return;
        
        // Authentication commands
        } else if (command === 'login') {
          const { username, password, ipAddress, userAgent } = payload;
          if (!password) {
            throw new Error('Password is required');
          }
          responsePayload = await this.authService.authenticateUser(
            username, 
            password, 
            ipAddress || 'unknown', 
            userAgent || 'unknown'
          );
          
          // Store user in HTTP session if authentication successful
          if (responsePayload.success && responsePayload.user && ws.request && ws.request.session) {
            ws.request.session.user = {
              id: responsePayload.user.id,
              username: responsePayload.user.username,
              role: responsePayload.user.role
            };
          }
        } else if (command === 'logout') {
          const { sessionId } = payload;
          if (!sessionId) {
            throw new Error('SessionId is required');
          }
          const result = await this.authService.logout(sessionId);
          responsePayload = { success: result, message: result ? 'Logged out successfully' : 'Logout failed' };
          
          // Clear HTTP session if logout successful
          if (result && ws.request && ws.request.session) {
            ws.request.session.user = null;
          }
        } else if (command === 'getCurrentUser') {
          const { sessionId } = payload;
          if (!sessionId) {
            throw new Error('SessionId is required');
          }
          const user = await this.authService.getCurrentUser(sessionId);
          responsePayload = user ? { success: true, user } : { success: false, error: 'Invalid session' };
        
        // Product management with permissions
        } else if (command === 'updateProduct') {
          const { productId, updates, sessionId } = payload;
          if (!productId || !updates || !sessionId) {
            throw new Error('ProductId, updates, and sessionId are required');
          }
          responsePayload = await this.services.product.updateExistingProduct(productId, updates, sessionId);
        
        } else if (command === 'getLoginUsers') {
          responsePayload = await this.authService.getLoginUsers();
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
          responsePayload = await this.services.transactionManagement.getParkedTransactions();
        } else if (command === 'parkTransaction') {
          const { transactionId, tableIdentifier, userId, updateTimestamp } = payload;
          responsePayload = await this.services.transactionManagement.parkTransaction(transactionId, tableIdentifier, userId, updateTimestamp);
          responseCommand = 'parkTransactionResponse';
        } else if (command === 'activateTransaction') {
          const { transactionId, userId, updateTimestamp } = payload;
          responsePayload = await this.services.transactionManagement.activateTransaction(transactionId, userId, updateTimestamp);
        } else if (command === 'checkTableAvailability') {
          const { tableNumber, excludeTransactionId } = payload;
          const isInUse = await this.services.transactionManagement.checkTableAvailability(tableNumber, excludeTransactionId);
          responsePayload = { isInUse };
        } else if (command === 'updateTransactionMetadata') {
          const { transactionId, metadata, userId, updateTimestamp } = payload;
          responsePayload = await this.services.transactionManagement.updateTransactionMetadata(transactionId, metadata, userId, updateTimestamp);
        } else if (command === 'updateItemQuantity') {
          const { transactionId, transactionItemId, newQuantity, userId } = payload;
          if (!transactionId || !transactionItemId || newQuantity === undefined || !userId) {
            throw new Error('transactionId, transactionItemId, newQuantity, and userId are required');
          }
          responsePayload = await this.services.transactionManagement.updateItemQuantityInTransaction(transactionId, transactionItemId, newQuantity, userId);
          if (responsePayload && responsePayload.id) {
              const items = await db('active_transaction_items')
                .leftJoin('items', 'active_transaction_items.item_id', 'items.id')
                .select('active_transaction_items.*', 'items.display_names')
                .where('active_transaction_items.active_transaction_id', responsePayload.id);
              responsePayload.items = items.map(item => ({
                ...item,
                display_names: this.parseJsonField(item.display_names)
              }));
          }
          responseCommand = 'orderUpdated';
        } else if (command === 'updateItemPrice') {
          const { transactionId, transactionItemId, newPrice, userId, isTotalPrice } = payload;
          if (!transactionId || !transactionItemId || newPrice === undefined || !userId) {
            throw new Error('transactionId, transactionItemId, newPrice, and userId are required');
          }
          responsePayload = await this.services.transactionManagement.updateItemPriceInTransaction(transactionId, transactionItemId, newPrice, userId, isTotalPrice);
          if (responsePayload && responsePayload.id) {
              const items = await db('active_transaction_items')
                .leftJoin('items', 'active_transaction_items.item_id', 'items.id')
                .select('active_transaction_items.*', 'items.display_names')
                .where('active_transaction_items.active_transaction_id', responsePayload.id);
              responsePayload.items = items.map(item => ({
                ...item,
                display_names: this.parseJsonField(item.display_names)
              }));
          }
          responseCommand = 'orderUpdated';
        } else if (command === 'addCustomPriceItem') {
          const { transactionId, itemId, customPrice, quantity, userId, options } = payload;
          if (!transactionId || !itemId || customPrice === undefined || !quantity || !userId) {
            throw new Error('transactionId, itemId, customPrice, quantity, and userId are required');
          }
          responsePayload = await this.services.transactionManagement.addCustomPriceItemToTransaction(transactionId, itemId, customPrice, quantity, userId, options);
          if (responsePayload && responsePayload.id) {
              const items = await db('active_transaction_items')
                .leftJoin('items', 'active_transaction_items.item_id', 'items.id')
                .select('active_transaction_items.*', 'items.display_names')
                .where('active_transaction_items.active_transaction_id', responsePayload.id);
              responsePayload.items = items.map(item => ({
                ...item,
                display_names: this.parseJsonField(item.display_names)
              }));
          }
          responseCommand = 'orderUpdated';
        } else if (command === 'updateCategory') {
          const { categoryId, updates } = payload;
          if (!categoryId || !updates) {
            throw new Error('categoryId and updates are required');
          }
          responsePayload = await this.services.category.updateExistingCategory(categoryId, updates);
        } else if (command === 'getEntityJson') {
          const { entityType, entityId } = payload;
          if (!entityType || !entityId) {
            throw new Error('entityType and entityId are required');
          }
          responsePayload = await this.services.export.exportEntityToOopMdf(entityType, entityId);
        } else if (command === 'saveEntityJson') {
          const { entityType, entityId, jsonSnippet } = payload;
          if (!entityType || !entityId || !jsonSnippet) {
            throw new Error('entityType, entityId, and jsonSnippet are required');
          }
          responsePayload = await this.services.import.updateEntityFromOopMdf(entityType, entityId, jsonSnippet);
        } else if (command === 'generateDsfinvkExport') {
          const { handleGenerateExport } = require('./controllers/export.controller');
          responsePayload = await handleGenerateExport(payload);
          responseCommand = 'generateDsfinvkExportResponse';
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
}

module.exports = { DesktopServer };
