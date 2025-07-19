// File: /packages/backend/src/config/logger.js

const pino = require('pino');

// Теперь логи всегда будут в формате JSON, идеальном для машин и LLM.
// Для "красивого" вывода в процессе разработки можно использовать утилиту pino-pretty в терминале:
// node src/server.js | pino-pretty
const logger = pino({
  level: process.env.LOG_LEVEL || 'debug',
});

module.exports = logger;