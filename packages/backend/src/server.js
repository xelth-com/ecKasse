// packages/backend/src/server.js
const app = require('./app'); // Импортируем настроенное Express-приложение из app.js
const logger = require('./config/logger');
const path = require('path');

// Загрузка .env из корневой директории монорепозитория
// Путь к .env из packages/backend/src/server.js
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });

const PORT = process.env.BACKEND_PORT || 3030; // Используйте порт из .env или стандартный

app.listen(PORT, () => {
  logger.info(`Backend server (dev:backend) listening on http://localhost:${PORT}`);
});