// C:\Users\xelth\eckasse\src\backend\app.js
const express = require('express');
const cors = require('cors');
const path = require('path');
const logger = require('./config/logger'); // Путь к вашему логгеру
// const mainRoutes = require('./routes/index'); // THIS SHOULD BE COMMENTED OR REMOVED
const llmRoutes = require('./routes/llm.routes.js'); // For Gemini Ping-Pong


const app = express();

// Middleware
app.use(cors()); // Включить CORS для всех маршрутов (настройте более строго для продакшена)
app.use(express.json()); // Для парсинга application/json
app.use(express.urlencoded({ extended: true })); // Для парсинга application/x-www-form-urlencoded


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

// Подключение маршрутов API
// app.use('/api', mainRoutes); // Когда у вас будут роуты
app.use('/api/llm', llmRoutes); // Mount the LLM routes


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
  const response = { operationId, status: 'success', payload: responsePayload, channel: 'http' };

  logger.info({ type: 'http_response', direction: 'out', operationId, data: response });
  res.json(response);
});

// Обработка несуществующих роутов (404)
app.use((req, res, next) => {
  const error = new Error('Not Found');
  error.status = 404;
  logger.warn({ msg: 'Route not found', url: req.originalUrl });
  next(error);
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