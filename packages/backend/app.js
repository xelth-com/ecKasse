// C:\Users\xelth\eckasse\src\backend\app.js
const express = require('express');
const cors = require('cors');
const path = require('path');
const logger = require('./config/logger'); // Путь к вашему логгеру
// const mainRoutes = require('./routes/index'); // Главный роутер

const app = express();

// Middleware
app.use(cors()); // Включить CORS для всех маршрутов (настройте более строго для продакшена)
app.use(express.json()); // Для парсинга application/json
app.use(express.urlencoded({ extended: true })); // Для парсинга application/x-www-form-urlencoded

// Логирование запросов (простой пример)
app.use((req, res, next) => {
  logger.info({ method: req.method, url: req.originalUrl, body: req.body, ip: req.ip });
  next();
});

// Подключение маршрутов API
// app.use('/api', mainRoutes); // Когда у вас будут роуты

// Пример простого маршрута для теста
app.get('/api/ping', (req, res) => {
  res.json({ message: 'pong from ecKasse backend!' });
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