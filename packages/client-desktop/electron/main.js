// packages/client-desktop/electron/main.js
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const url = require('url');
// const logger = require('../../backend/src/config/logger'); // Логгер из пакета backend, если нужен здесь
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') }); // Загрузка .env из корня монорепозитория

let mainWindow;

// Порт, на котором работает ваш React dev server (CRA по умолчанию 3000)
const REACT_DEV_SERVER_PORT = process.env.PORT || 3000;

// Порт, на котором работает ваш выделенный Backend API сервер
const BACKEND_API_PORT = process.env.BACKEND_PORT || 3030;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'), // Указывает на ваш preload.js
      contextIsolation: true, // Рекомендуется для безопасности
      nodeIntegration: false,  // Рекомендуется для безопасности
    },
  });

  const startUrl =
    process.env.ELECTRON_START_URL || // Для возможности переопределения URL извне
    (app.isPackaged // Проверяем, упаковано ли приложение
      ? url.format({ // URL для собранного React-приложения
          pathname: path.join(__dirname, '../src/renderer/build/index.html'), // Путь к index.html в сборке React
          protocol: 'file:',
          slashes: true,
        })
      : `http://localhost:${REACT_DEV_SERVER_PORT}`); // URL для режима разработки React

  mainWindow.loadURL(startUrl);

  // Открывать DevTools только в режиме разработки
  if (!app.isPackaged) {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.on('ready', () => {
  createWindow();
  // logger?.info(`Electron app ready. Backend should be running at http://localhost:${BACKEND_API_PORT}`);
  console.log(`Electron app ready. React dev server at http://localhost:${REACT_DEV_SERVER_PORT}. Backend should be at http://localhost:${BACKEND_API_PORT}`);
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

// IPC для получения URL бэкенда, чтобы React-часть знала, куда делать запросы
ipcMain.handle('get-backend-url', () => {
  return `http://localhost:${BACKEND_API_PORT}`;
});

// Пример того, как вы могли бы использовать логгер из пакета backend, если он вам нужен в main процессе Electron
// (при условии, что он правильно настроен и экспортирован из пакета @eckasse/backend)
/*
try {
  const backendLogger = require('@eckasse/backend').logger; // Предполагаем, что логгер экспортируется
  if (backendLogger) {
    backendLogger.info('Logger from @eckasse/backend initialized in Electron main process.');
  }
} catch (error) {
  console.error('Failed to load logger from @eckasse/backend:', error);
}
*/