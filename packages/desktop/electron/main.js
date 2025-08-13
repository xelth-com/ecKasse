// packages/client-desktop/electron/main.js
const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const url = require('url');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });

let mainWindow;

// Порт backend сервера (теперь служит и API и статику)
const BACKEND_PORT = process.env.BACKEND_PORT || 3030;

// File size limits (in bytes)
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB - reasonable for menu images and PDFs
const MAX_FILE_SIZE_DEMO = 10 * 1024 * 1024; // 10MB - stricter limit for demo mode

// Check if we're in demo mode (you might want to adjust this logic)
const isDemoMode = process.env.NODE_ENV === 'development' || process.env.DEMO_MODE === 'true';

// Helper function to check file size
function checkFileSize(filePath) {
  try {
    const stats = fs.statSync(filePath);
    const fileSizeInBytes = stats.size;
    const maxAllowed = isDemoMode ? MAX_FILE_SIZE_DEMO : MAX_FILE_SIZE;
    const maxAllowedMB = Math.round(maxAllowed / (1024 * 1024));
    const fileSizeMB = Math.round(fileSizeInBytes / (1024 * 1024) * 100) / 100;
    
    if (fileSizeInBytes > maxAllowed) {
      return {
        valid: false,
        error: `File size (${fileSizeMB}MB) exceeds maximum allowed size of ${maxAllowedMB}MB ${isDemoMode ? '(demo mode limit)' : ''}.`
      };
    }
    
    return { valid: true, sizeMB: fileSizeMB };
  } catch (error) {
    return {
      valid: false,
      error: `Unable to check file size: ${error.message}`
    };
  }
}

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
          pathname: path.join(__dirname, '../frontend/dist/index.html'), // Production build
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

// IPC handler for showing file dialog
ipcMain.handle('show-open-dialog', async () => {
  try {
    // Define allowed directory - only menu_inputs
    const allowedDir = path.resolve(__dirname, '../../../menu_inputs');
    
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Select Menu File',
      filters: [
        { name: 'Menu Files', extensions: ['pdf', 'jpg', 'jpeg', 'png'] },
        { name: 'PDF Files', extensions: ['pdf'] },
        { name: 'Image Files', extensions: ['jpg', 'jpeg', 'png'] }
      ],
      properties: ['openFile'],
      defaultPath: allowedDir
    });
    
    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }
    
    const selectedFile = result.filePaths[0];
    
    // Security check: ensure selected file is within menu_inputs directory
    const normalizedSelected = path.resolve(selectedFile);
    const normalizedAllowed = path.resolve(allowedDir);
    
    if (!normalizedSelected.startsWith(normalizedAllowed)) {
      console.error('Security violation: File outside allowed directory', selectedFile);
      return { 
        error: 'File must be located in the menu_inputs directory for security reasons.' 
      };
    }
    
    // Check file size
    const sizeCheck = checkFileSize(selectedFile);
    if (!sizeCheck.valid) {
      console.error('File size violation:', selectedFile, sizeCheck.error);
      return { error: sizeCheck.error };
    }
    
    console.log(`File selected: ${selectedFile} (${sizeCheck.sizeMB}MB)`);
    return { filePath: selectedFile };
  } catch (error) {
    console.error('Error in show-open-dialog:', error);
    return { error: 'Failed to open file dialog.' };
  }
});

// IPC handler for listing menu files
ipcMain.handle('list-menu-files', async () => {
  try {
    const menuInputsDir = path.resolve(__dirname, '../../../menu_inputs');
    
    // Check if directory exists
    if (!fs.existsSync(menuInputsDir)) {
      console.log('Creating menu_inputs directory:', menuInputsDir);
      fs.mkdirSync(menuInputsDir, { recursive: true });
      return [];
    }
    
    // Read directory contents
    const files = fs.readdirSync(menuInputsDir);
    
    // Filter for supported file types and add file info
    const supportedExtensions = ['.pdf', '.jpg', '.jpeg', '.png'];
    const menuFiles = [];
    
    for (const file of files) {
      const filePath = path.join(menuInputsDir, file);
      const ext = path.extname(file).toLowerCase();
      
      // Skip non-supported files and directories
      if (!supportedExtensions.includes(ext)) continue;
      
      try {
        const stats = fs.statSync(filePath);
        if (stats.isFile()) {
          const sizeCheck = checkFileSize(filePath);
          menuFiles.push({
            name: file,
            path: filePath,
            size: sizeCheck.sizeMB,
            sizeValid: sizeCheck.valid,
            type: ext.substring(1).toUpperCase(),
            lastModified: stats.mtime
          });
        }
      } catch (fileError) {
        console.warn(`Error reading file ${file}:`, fileError.message);
      }
    }
    
    // Sort by last modified (newest first)
    menuFiles.sort((a, b) => new Date(b.lastModified) - new Date(a.lastModified));
    
    console.log(`Found ${menuFiles.length} menu files in ${menuInputsDir}`);
    return menuFiles;
    
  } catch (error) {
    console.error('Error in list-menu-files:', error);
    return { error: error.message };
  }
});

// IPC handler for starting menu import
ipcMain.handle('start-menu-import', async (event, filePaths) => {
  try {
    // Handle both single file (string) and multiple files (array) for backward compatibility
    const files = Array.isArray(filePaths) ? filePaths : [filePaths];
    
    if (files.length === 0) {
      return { success: false, message: 'No files specified for import.' };
    }
    
    const allowedDir = path.resolve(__dirname, '../../../menu_inputs');
    const validFiles = [];
    
    // Validate all files first
    for (const filePath of files) {
      const normalizedFile = path.resolve(filePath);
      const normalizedAllowed = path.resolve(allowedDir);
      
      if (!normalizedFile.startsWith(normalizedAllowed)) {
        console.error('Security violation: Import file outside allowed directory', filePath);
        return { 
          success: false, 
          message: `Security violation: ${path.basename(filePath)} must be in menu_inputs directory.` 
        };
      }
      
      // Check if file exists
      if (!fs.existsSync(filePath)) {
        return { 
          success: false, 
          message: `File not found: ${path.basename(filePath)}` 
        };
      }
      
      // Check file size
      const sizeCheck = checkFileSize(filePath);
      if (!sizeCheck.valid) {
        console.error('File size violation:', filePath, sizeCheck.error);
        return { 
          success: false, 
          message: `${path.basename(filePath)}: ${sizeCheck.error}` 
        };
      }
      
      validFiles.push({ path: filePath, size: sizeCheck.sizeMB });
    }
    
    const totalSize = validFiles.reduce((sum, file) => sum + file.size, 0);
    console.log(`Starting menu import for ${validFiles.length} file(s) (${totalSize.toFixed(2)}MB total):`);
    validFiles.forEach(file => console.log(`  - ${path.basename(file.path)} (${file.size}MB)`));
    
    // Path to the parse_and_init.js script
    const scriptPath = path.resolve(__dirname, '../../../backend/src/scripts/parse_and_init.js');
    
    // For now, process files sequentially (script accepts one file at a time)
    // TODO: Update script to handle multiple files in one run for better performance
    let processedCount = 0;
    const totalFiles = validFiles.length;
    
    // For now, process only the first file (script accepts one file at a time)
    // TODO: Update to handle multiple files properly with sequential processing
    const firstFile = validFiles[0];
    
    if (mainWindow) {
      mainWindow.webContents.send('menu-import-progress', 
        `Processing file: ${path.basename(firstFile.path)}`);
    }
    
    // Spawn the Node.js process for the first file
    const childProcess = spawn('node', [scriptPath, firstFile.path], {
      stdio: ['ignore', 'pipe', 'pipe'],
      cwd: path.resolve(__dirname, '../../../backend')
    });
    
    // Listen to stdout for progress messages
    childProcess.stdout.on('data', (data) => {
      const output = data.toString();
      const lines = output.split('\n').filter(line => line.trim());
      
      lines.forEach(line => {
        if (line.trim() && mainWindow) {
          // Send all non-empty output lines as progress updates
          // This provides detailed, real-time feedback during import
          mainWindow.webContents.send('menu-import-progress', line.trim());
        }
      });
    });
    
    // Listen to stderr for errors
    childProcess.stderr.on('data', (data) => {
      console.error(`Import script error: ${data}`);
    });
    
    // Handle process completion
    childProcess.on('close', (code) => {
      console.log(`Import script finished with code: ${code}`);
      if (mainWindow) {
        if (code === 0) {
          mainWindow.webContents.send('menu-import-complete', true, 'Menu import completed successfully!');
        } else {
          mainWindow.webContents.send('menu-import-complete', false, `Import failed with code ${code}`);
        }
      }
    });
    
    // Handle process errors
    childProcess.on('error', (error) => {
      console.error('Failed to start import script:', error);
      if (mainWindow) {
        mainWindow.webContents.send('menu-import-complete', false, `Failed to start import: ${error.message}`);
      }
    });
    
    return { success: true, message: 'Import process started' };
    
  } catch (error) {
    console.error('Error starting menu import:', error);
    return { success: false, message: error.message };
  }
});

