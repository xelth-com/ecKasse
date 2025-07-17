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
      ? 'http://localhost:3001' // Vite dev server
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

// IPC для получения URL бэкенда
ipcMain.handle('get-backend-url', () => {
  return `http://localhost:${BACKEND_PORT}`;
});

