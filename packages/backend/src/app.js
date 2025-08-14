// C:\Users\xelth\eckasse\src\backend\app.js
const express = require('express');
const cors = require('cors');
const path = require('path');
const logger = require('./config/logger'); // Путь к вашему логгеру
// const sessionMiddleware = require('./middleware/session.middleware');
// const mainRoutes = require('./routes/index'); // THIS SHOULD BE COMMENTED OR REMOVED
const llmRoutes = require('./routes/llm.routes.js'); // For Gemini Ping-Pong
const systemRoutes = require('./routes/system.routes.js');
// const printerRoutes = require('./routes/printers.js'); // disabled for deployment
const menuRoutes = require('./routes/menu.routes.js'); // disabled for deployment

// Import services for API endpoints
const { services } = require('../../core');


const app = express();

// Middleware
app.use(cors()); // Включить CORS для всех маршрутов (настройте более строго для продакшена)
app.use(express.json()); // Для парсинга application/json
app.use(express.urlencoded({ extended: true })); // Для парсинга application/x-www-form-urlencoded
// app.use(sessionMiddleware); // Session management for demo mode - disabled for production


// Временное хранилище для operationId HTTP - должно быть синхронизировано или объединено с WebSocket
// Для простоты сейчас оставим отдельным, но в реальном приложении это должен быть общий механизм
const processedHttpOperationIds = new Set();
const HTTP_OPERATION_ID_TTL = 60000;

// Логирование запросов
app.use((req, res, next) => {
  // Добавим operationId в лог, если он есть в query или body
  const operationId = req.query.operationId || (req.body && req.body.operationId);
  logger.info({
    type: 'http_request',
    direction: 'in',
    operationId,
    method: req.method,
    url: req.originalUrl,
    body: req.body, // Be careful logging full bodies in production
    query: req.query,
    ip: req.ip
  });
  next();
});

// Раздача статических файлов для фронтенда
const staticPath = path.join(__dirname, '../../desktop/frontend/dist');
app.use(express.static(staticPath));
logger.info(`Serving static files from: ${staticPath}`);

// Подключение маршрутов API - all disabled for deployment due to refactoring issues
// app.use('/api', mainRoutes); // Когда у вас будут роуты
app.use('/api/llm', llmRoutes); // Mount the LLM routes
app.use('/api/system', systemRoutes);
// app.use('/api/printers', printerRoutes); // disabled for deployment
app.use('/api/menu', menuRoutes); // disabled for deployment

// Simple users API endpoint for login screen
app.get('/api/users', async (req, res) => {
  try {
    const users = await services.auth.getLoginUsers();
    res.json(users);
  } catch (error) {
    logger.error({ msg: 'Error fetching users', err: error });
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// HTTP fallback endpoint for WebSocket commands
app.post('/api/websocket-fallback', async (req, res) => {
  const { operationId, command, payload } = req.body;

  if (!operationId) {
    logger.warn({ msg: 'HTTP fallback request without operationId' });
    return res.status(400).json({ error: 'operationId is required' });
  }

  if (processedHttpOperationIds.has(operationId)) {
    logger.info({ msg: 'Duplicate HTTP fallback operationId received', operationId });
    return res.json({
      operationId,
      status: 'already_processed',
      message: `Operation ${operationId} was already processed via HTTP.`,
      channel: 'http'
    });
  }

  processedHttpOperationIds.add(operationId);
  setTimeout(() => {
    processedHttpOperationIds.delete(operationId);
  }, HTTP_OPERATION_ID_TTL);

  // Reuse the same command handling logic from WebSocket server
  let responsePayload;
  let status = 'success';
  let responseCommand = command + 'Response';

  try {
    if (command === 'getParkedTransactions') {
      const transactionManagementService = require('./services/transaction_management.service');
      responsePayload = await transactionManagementService.getParkedTransactions(req.session ? req.session.id : null);
    } else if (command === 'activateTransaction') {
      const { transactionId, userId, updateTimestamp } = payload;
      if (!transactionId || !userId) {
        throw new Error('TransactionId and userId are required');
      }
      const transactionManagementService = require('./services/transaction_management.service');
      responsePayload = await transactionManagementService.activateTransaction(transactionId, userId, updateTimestamp);
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
app.get('/api/system/mode', (req, res) => {
  const mode = process.env.APP_MODE || process.env.NODE_ENV || 'production';
  res.json({ mode });
});

// Пример простого маршрута для теста
app.get('/api/ping', (req, res) => {
  const operationId = req.query.operationId; // Ожидаем operationId в query параметрах для GET

  if (!operationId) {
    logger.warn({ msg: 'HTTP /api/ping request without operationId' });
    return res.status(400).json({ error: 'operationId is required in query parameters' });
  }

  if (processedHttpOperationIds.has(operationId)) {
    logger.info({ msg: 'Duplicate HTTP /api/ping operationId received', operationId });
    return res.json({
      operationId,
      status: 'already_processed',
      message: `Operation ${operationId} was already processed or is in progress via HTTP.`,
      channel: 'http'
    });
  }

  processedHttpOperationIds.add(operationId);
  setTimeout(() => {
    processedHttpOperationIds.delete(operationId);
  }, HTTP_OPERATION_ID_TTL);

  const responsePayload = { message: 'pong from ecKasse backend!', timestamp: new Date().toISOString() };
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

// Catch-all route для SPA - возвращаем index.html для всех не-API роутов
app.get('*', (req, res, next) => {
  // Если запрос начинается с /api, то это API роут - переходим к 404
  if (req.originalUrl.startsWith('/api')) {
    const error = new Error('API Route Not Found');
    error.status = 404;
    logger.warn({ msg: 'API route not found', url: req.originalUrl });
    return next(error);
  }
  
  // Для всех остальных роутов отдаем index.html (для фронтенда)
  res.sendFile(path.join(staticPath, 'index.html'));
});

// Глобальный обработчик ошибок
app.use((error, req, res, next) => {
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

module.exports = app;