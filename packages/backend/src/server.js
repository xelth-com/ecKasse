// packages/backend/src/server.js
const http = require('http');
// Исправленный импорт для совместимости с разными версиями ws
const WebSocket = require('ws');
const app = require('./app'); // Ваше Express-приложение
const logger = require('./config/logger');
const path = require('path');

require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });

const PORT = process.env.BACKEND_PORT || 3030;
console.log(`[DEBUG] Node.js version active for this script: ${process.version}`);
const httpServer = http.createServer(app);

// Используем правильный конструктор WebSocket Server
const wss = new WebSocket.Server({ server: httpServer });

// Хранилище для отслеживания активных/обработанных operationId (упрощенно)
const processedOperationIds = new Set();
const OPERATION_ID_TTL = 60000; // Время жизни ID операции в мс (например, 1 минута)

function handleWebSocketMessage(ws, rawMessage) {
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

  if (command === 'ping_ws') {
    responsePayload = { message: 'pong_ws', receivedPayload: payload };
  } else {
    status = 'error';
    responsePayload = { message: 'Unknown command', originalCommand: command };
    logger.warn({ msg: 'Unknown WebSocket command', command, operationId, clientId: ws.id });
  }
  // --- Конец обработки команды ---

  const response = { operationId, status, payload: responsePayload, channel: 'websocket' };
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

  ws.send(JSON.stringify({ message: 'Welcome to ecKasse WebSocket API!', clientId: ws.id }));
});

httpServer.listen(PORT, () => {
  logger.info(`Backend server (HTTP & WebSocket) listening on http://localhost:${PORT}`);
});