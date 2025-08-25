const pino = require('pino');
const fs = require('fs');
const path = require('path');

const logDir = path.resolve(__dirname, '../../../logs');
const logPath = path.join(logDir, 'backend.log');

// Ensure log directory exists
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

// Define pino transports
const transports = pino.transport({
  targets: [
    {
      target: 'pino-pretty', // For development console
      options: { 
        colorize: true, 
        sync: true // Important for development debugging
      }
    },
    {
      target: 'pino-roll', // For file logging with rotation
      options: {
        file: logPath,
        frequency: 'daily', // Rotate daily or when size is reached
        size: '10M',      // Max file size 10MB
        maxFiles: 5,      // Keep 5 old log files
        sync: true        // CRITICAL for ensuring crash logs are written before exit
      }
    }
  ]
});

const logger = pino({
  level: process.env.LOG_LEVEL || 'debug',
}, transports);

// Add a startup log to confirm file logging is working
logger.info(`File logging initialized at: ${logPath}`);

// Global handler to ensure pino transports are flushed before exit
process.on('beforeExit', () => {
  logger.flush();
});

module.exports = logger;