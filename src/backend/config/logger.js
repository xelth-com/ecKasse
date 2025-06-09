// C:\Users\xelth\eckasse\src\backend\config\logger.js
const pino = require('pino');

const isDevelopment = process.env.NODE_ENV !== 'production';

const logger = pino({
  level: process.env.LOG_LEVEL || (isDevelopment ? 'debug' : 'info'),
  ...(isDevelopment && {
    transport: {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'SYS:yyyy-mm-dd HH:MM:ss.l',
        ignore: 'pid,hostname',
      },
    },
  }),
  // Для продакшена логи будут в JSON. Рассмотрите запись в файл или систему логирования.
  // Например, для записи в файл:
  // transport: {
  //   targets: [
  //     { target: 'pino/file', options: { destination: './eckasse-backend.log' } },
  //     ...(isDevelopment ? [{ target: 'pino-pretty', options: { colorize: true, translateTime: 'SYS:yyyy-mm-dd HH:MM:ss.l', ignore: 'pid,hostname'} }] : [])
  //   ]
  // }
});

module.exports = logger;