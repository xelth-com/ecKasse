const { app, BrowserWindow } = require('electron');

let mainWindow;

function createWindow() {
  console.log('Creating minimal Electron window...');
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
  });

  console.log('Loading Google...');
  mainWindow.loadURL('https://google.com');
  
  console.log('Window created successfully');
}

app.on('ready', () => {
  console.log('App ready, creating window...');
  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

console.log('Script loaded successfully');