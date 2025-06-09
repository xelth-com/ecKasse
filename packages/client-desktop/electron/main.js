// C:\Users\xelth\eckasse\electron\main.js
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const url = require('url');
const expressApp = require('../src/backend/app'); // <-- Путь к вашему Express app
const logger = require('../src/backend/config/logger'); // <-- Путь к вашему логгеру
require('dotenv').config({ path: path.join(__dirname, '..', '.env') }); // <-- Загрузка .env из корня проекта

let mainWindow;
const EXPRESS_PORT = process.env.BACKEND_PORT || 3030; // Порт для Express API

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false, // Рекомендуется для безопасности
    },
  });

  const reactAppPort = process.env.PORT || 3000; // Порт вашего React dev server (например, от CRA)
  const startUrl =
    process.env.ELECTRON_START_URL ||
    (process.env.NODE_ENV === 'development'
      ? `http://localhost:${reactAppPort}` // URL для режима разработки React
      : url.format({ // URL для собранного React-приложения
          pathname: path.join(__dirname, '../build/index.html'), // Указывает на собранный React
          protocol: 'file:',
          slashes: true,
        }));

  mainWindow.loadURL(startUrl);

  if (process.env.NODE_ENV === 'development') {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.on('ready', () => {
  createWindow();

  // Запускаем Express-сервер
  const server = expressApp.listen(EXPRESS_PORT, () => {
    logger.info(`ecKasse Backend API server running on http://localhost:${EXPRESS_PORT}`);
  });

  // Обработка закрытия сервера при выходе из Electron
  app.on('will-quit', () => {
    server.close(() => {
      logger.info('Backend server closed.');
    });
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// Пример IPC для получения URL бэкенда
ipcMain.handle('get-backend-url', () => {
  return `http://localhost:${EXPRESS_PORT}`;
});