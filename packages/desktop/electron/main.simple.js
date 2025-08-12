const { app, BrowserWindow } = require('electron');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });

let mainWindow;
const BACKEND_PORT = process.env.BACKEND_PORT || 3030;

function createWindow() {
  console.log('Creating Electron window...');
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  const startUrl = `http://localhost:${BACKEND_PORT}`;
  console.log(`Loading URL: ${startUrl}`);
  
  mainWindow.loadURL(startUrl);
  
  mainWindow.webContents.openDevTools();
  
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.on('ready', () => {
  console.log('Electron app is ready, creating window...');
  createWindow();
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

console.log('Simple Electron main script loaded');