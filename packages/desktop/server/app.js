// Desktop-specific server
// Connects core business logic to SQLite adapter
// Based on original backend/src/app.js but restructured for new architecture

const express = require('express');
const path = require('path');
const cors = require('cors');

// Import core business logic
const { services, db } = require('../../core');
const logger = require('../../core/config/logger');

// Import routes
const llmRoutes = require('./routes/llm.routes');

class DesktopServer {
  constructor() {
    this.app = express();
    this.processedHttpOperationIds = new Set();
    this.HTTP_OPERATION_ID_TTL = 60000;
  }

  async initialize() {
    this.setupMiddleware();
    this.setupRoutes();
    return this.app;
  }

  setupMiddleware() {
    this.app.use(cors());
    this.app.use(express.json());
    this.app.use(express.urlencoded({ extended: true }));

    // Request logging
    this.app.use((req, res, next) => {
      const operationId = req.query.operationId || (req.body && req.body.operationId);
      logger.info({
        type: 'http_request',
        direction: 'in',
        operationId,
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

    // Simple users API endpoint for login screen
    this.app.get('/api/users', async (req, res) => {
      try {
        const users = await services.auth.getLoginUsers();
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
          responsePayload = await services.transactionManagement.getParkedTransactions();
        } else if (command === 'activateTransaction') {
          const { transactionId, userId, updateTimestamp } = payload;
          if (!transactionId || !userId) {
            throw new Error('TransactionId and userId are required');
          }
          responsePayload = await services.transactionManagement.activateTransaction(transactionId, userId, updateTimestamp);
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
}

module.exports = { DesktopServer };
