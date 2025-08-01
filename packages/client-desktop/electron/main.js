// packages/client-desktop/electron/main.js
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const url = require('url');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });

let mainWindow;

// Порт backend сервера (теперь служит и API и статику)
const BACKEND_PORT = process.env.BACKEND_PORT || 3030;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  const startUrl =
    process.env.ELECTRON_START_URL ||
    (!app.isPackaged
      ? `http://localhost:${BACKEND_PORT}` // Backend serving built files
      : url.format({
          pathname: path.join(__dirname, '../src/renderer/dist/index.html'), // Production build
          protocol: 'file:',
          slashes: true,
        }));

  mainWindow.loadURL(startUrl);

  if (!app.isPackaged) {
    mainWindow.webContents.openDevTools();
    
    // Suppress DevTools Autofill errors
    mainWindow.webContents.once('devtools-opened', () => {
      mainWindow.webContents.devToolsWebContents.executeJavaScript(`
        const originalError = console.error;
        console.error = function(...args) {
          const message = args.join(' ');
          if (message.includes('Autofill.enable') || message.includes('Autofill.setAddresses')) {
            return; // Skip autofill errors
          }
          originalError.apply(console, args);
        };
      `);
    });
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.on('ready', () => {
  createWindow();
  console.log(`Electron app ready. Backend serving at http://localhost:${BACKEND_PORT}`);
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

// IPC для получения URL бэкенда с обработкой ошибок
ipcMain.handle('get-backend-url', async () => {
  try {
    const backendPort = process.env.BACKEND_PORT || 3030;
    if (!backendPort) {
      throw new Error('BACKEND_PORT is not defined in the environment.');
    }
    return `http://localhost:${backendPort}`;
  } catch (error) {
    console.error('IPC Error in get-backend-url:', error);
    // Возвращаем null или ошибку в renderer процесс, чтобы он мог ее обработать
    return null;
  }
});

// Global error handling to catch unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  // Check if this is the IPC cloning error and suppress it
  if (reason && reason.message && reason.message.includes('An object could not be cloned')) {
    console.log('Suppressed IPC cloning error (harmless)');
    return;
  }
  
  // Log other unhandled rejections for debugging
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Global error handling for uncaught exceptions
process.on('uncaughtException', (error) => {
  // Check if this is the IPC cloning error and suppress it
  if (error && error.message && error.message.includes('An object could not be cloned')) {
    console.log('Suppressed IPC cloning error (harmless)');
    return;
  }
  
  console.error('Uncaught Exception:', error);
});

