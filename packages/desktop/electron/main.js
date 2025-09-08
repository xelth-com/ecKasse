// packages/client-desktop/electron/main.js
const { app, BrowserWindow, ipcMain, dialog } = require('electron');
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

  // Crash and Hang Diagnostics
  mainWindow.webContents.on('unresponsive', () => {
    console.log('!!! RENDERER PROCESS HANG DETECTED !!!');
    dialog.showErrorBox('Application Unresponsive', 'The application has become unresponsive. You might need to restart it.');
  });

  mainWindow.webContents.on('render-process-gone', (event, details) => {
    console.error('!!! RENDERER PROCESS GONE !!!', details);
    dialog.showErrorBox('Application Error', `The application's renderer process has crashed. Reason: ${details.reason}.`);
    mainWindow = null;
    app.quit();
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
    // Define allowed directory - only ecKasseIn
    const allowedDir = path.resolve(__dirname, '../../../../ecKasseIn');
    
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Select Menu File',
      filters: [
        { name: 'Menu Files', extensions: ['pdf', 'jpg', 'jpeg', 'png', 'json', 'zip'] },
        { name: 'MDF Files', extensions: ['json', 'zip'] },
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
    
    // Security check: ensure selected file is within ecKasseIn directory
    const normalizedSelected = path.resolve(selectedFile);
    const normalizedAllowed = path.resolve(allowedDir);
    
    if (!normalizedSelected.startsWith(normalizedAllowed)) {
      console.error('Security violation: File outside allowed directory', selectedFile);
      return { 
        error: 'File must be located in the ecKasseIn directory for security reasons.' 
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
    const menuInputsDir = path.resolve(__dirname, '../../../../ecKasseIn');
    
    // Check if directory exists
    if (!fs.existsSync(menuInputsDir)) {
      console.log('Creating ecKasseIn directory:', menuInputsDir);
      fs.mkdirSync(menuInputsDir, { recursive: true });
      return [];
    }
    
    // Read directory contents
    const files = fs.readdirSync(menuInputsDir);
    
    // Filter for supported file types and add file info
    const supportedExtensions = ['.pdf', '.jpg', '.jpeg', '.png', '.json', '.zip'];
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

// Helper function to check if file contains OOP-POS-MDF schema
async function isOopPosMdfFile(filePath) {
  try {
    let jsonContent = '';
    
    if (filePath.toLowerCase().endsWith('.json')) {
      // Direct JSON file
      jsonContent = fs.readFileSync(filePath, 'utf8');
    } else if (filePath.toLowerCase().endsWith('.zip')) {
      // ZIP file - extract and check JSON inside
      const JSZip = require('jszip');
      const zipData = fs.readFileSync(filePath);
      const zip = new JSZip();
      const zipContents = await zip.loadAsync(zipData);
      
      // Find JSON file in ZIP
      for (const [filename, fileData] of Object.entries(zipContents.files)) {
        if (filename.toLowerCase().endsWith('.json') && !fileData.dir) {
          jsonContent = await fileData.async('text');
          break;
        }
      }
    }
    
    if (!jsonContent) return false;
    
    // Parse and check for OOP-POS-MDF schema
    const data = JSON.parse(jsonContent);
    return data.$schema === 'https://schemas.eckasse.com/oop-pos-mdf/v2.0.0/schema.json';
    
  } catch (error) {
    console.warn(`Failed to check MDF schema for ${filePath}:`, error.message);
    return false;
  }
}

// IPC handler for starting menu import
ipcMain.handle('start-menu-import', async (event, filePaths) => {
  try {
    // Handle both single file (string) and multiple files (array) for backward compatibility
    const files = Array.isArray(filePaths) ? filePaths : [filePaths];
    
    if (files.length === 0) {
      return { success: false, message: 'No files specified for import.' };
    }
    
    const allowedDir = path.resolve(__dirname, '../../../../ecKasseIn');
    const validFiles = [];
    
    // Validate all files first
    for (const filePath of files) {
      const normalizedFile = path.resolve(filePath);
      const normalizedAllowed = path.resolve(allowedDir);
      
      if (!normalizedFile.startsWith(normalizedAllowed)) {
        console.error('Security violation: Import file outside allowed directory', filePath);
        return { 
          success: false, 
          message: `Security violation: ${path.basename(filePath)} must be in ecKasseIn directory.` 
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
    
    // Separate MDF files from regular menu files
    const mdfFiles = [];
    const menuFiles = [];
    
    for (const file of validFiles) {
      const isMdf = await isOopPosMdfFile(file.path);
      if (isMdf) {
        mdfFiles.push(file);
      } else {
        menuFiles.push(file);
      }
    }
    
    console.log(`Found ${mdfFiles.length} MDF files and ${menuFiles.length} menu files`);
    if (mdfFiles.length > 0) {
      console.log('MDF files:');
      mdfFiles.forEach(file => console.log(`  - ${path.basename(file.path)} (${file.size}MB)`));
    }
    if (menuFiles.length > 0) {
      console.log('Menu files:');
      menuFiles.forEach(file => console.log(`  - ${path.basename(file.path)} (${file.size}MB)`));
    }
    
    // Use internal services instead of external script
    const MenuParserLLM = require('../../core/lib/menu_parser_llm.js');
    const { importFromOopMdf } = require('../../core/application/import.service.js');
    const { enrichMdfData } = require('../../core/application/enrichment.service.js');
    const { db } = require('../../core');
    
    // Helper to send progress updates to the frontend
    function sendProgress(message, isComplete = false) {
      const prefix = isComplete ? '✅' : '⏳';
      const fullMessage = `${prefix} ${message}`;
      console.log(fullMessage);
      if (mainWindow) {
        mainWindow.webContents.send('menu-import-progress', fullMessage);
      }
    }
    
    // Helper to merge multiple OOP-POS-MDF configurations (simplified version)
    function mergeMdfData(configs) {
      if (!configs || configs.length === 0) {
        throw new Error('No configurations to merge');
      }
      if (configs.length === 1) {
        return configs[0];
      }
      
      // Use the first config as base and merge others
      const masterConfig = JSON.parse(JSON.stringify(configs[0]));
      const firstPoS = masterConfig.company_details.branches[0].point_of_sale_devices[0];
      
      let nextCategoryId = Math.max(...firstPoS.categories_for_this_pos.map(c => c.category_unique_identifier)) + 1;
      let nextItemId = Math.max(...firstPoS.items_for_this_pos.map(i => i.item_unique_identifier)) + 1;
      
      for (let i = 1; i < configs.length; i++) {
        const config = configs[i];
        const posDevice = config.company_details.branches[0].point_of_sale_devices[0];
        
        // Merge categories
        if (posDevice.categories_for_this_pos) {
          posDevice.categories_for_this_pos.forEach(category => {
            const existingCat = firstPoS.categories_for_this_pos.find(c => 
              c.category_names.de === category.category_names.de
            );
            if (!existingCat) {
              firstPoS.categories_for_this_pos.push({
                ...category,
                category_unique_identifier: nextCategoryId++
              });
            }
          });
        }
        
        // Merge items
        if (posDevice.items_for_this_pos) {
          posDevice.items_for_this_pos.forEach(item => {
            const existingItem = firstPoS.items_for_this_pos.find(i => 
              i.display_names.menu.de === item.display_names.menu.de
            );
            if (!existingItem) {
              firstPoS.items_for_this_pos.push({
                ...item,
                item_unique_identifier: nextItemId++
              });
            }
          });
        }
      }
      
      return masterConfig;
    }
    
    // Clean database before import
    async function cleanDatabase() {
      console.log('Cleaning database before import...');
      await db.transaction(async (trx) => {
        await trx('active_transaction_items').del();
        await trx('active_transactions').del();
        
        // Delete embeddings table only for PostgreSQL
        const clientType = trx.client.config.client;
        if (clientType === 'pg') {
          await trx('item_embeddings').del();
        }
        
        await trx('items').del();
        await trx('categories').del();
        await trx('pos_devices').del();
        await trx('branches').del();
        await trx('companies').del();
      });
    }
    
    // Handle MDF files first (direct import without enrichment)
    if (mdfFiles.length > 0) {
      console.log('Processing MDF files directly...');
      
      for (const mdfFile of mdfFiles) {
        try {
          sendProgress(`Processing MDF file: ${path.basename(mdfFile.path)}`);
          
          if (mdfFile.path.toLowerCase().endsWith('.json')) {
            // Direct JSON import via WebSocket
            const jsonContent = fs.readFileSync(mdfFile.path, 'utf8');
            const mdfData = JSON.parse(jsonContent);
            
            // Clean database first
            await cleanDatabase();
            
            // Import MDF data directly
            const result = await importFromOopMdf(mdfData);
            if (result.success) {
              sendProgress(`✅ MDF file imported successfully: ${result.itemCount || 0} items`);
            }
            
          } else if (mdfFile.path.toLowerCase().endsWith('.zip')) {
            // ZIP import via import service
            const { importFromOopMdfZip } = require('../../core/application/import.service.js');
            const zipData = fs.readFileSync(mdfFile.path);
            const base64ZipData = zipData.toString('base64');
            
            // Import ZIP MDF data (cleaning happens inside the function)
            const result = await importFromOopMdfZip(base64ZipData, path.basename(mdfFile.path));
            if (result.success) {
              sendProgress(`✅ MDF ZIP file imported successfully: ${result.itemCount || 0} items`);
            }
          }
          
        } catch (error) {
          console.error(`Failed to import MDF file ${mdfFile.path}:`, error);
          sendProgress(`❌ Failed to import MDF file: ${error.message}`);
        }
      }
      
      // If we only had MDF files, we're done
      if (menuFiles.length === 0) {
        sendProgress('All MDF files processed successfully!', true);
        if (mainWindow) {
          mainWindow.webContents.send('menu-import-complete', true, 'MDF import completed successfully!');
          setTimeout(() => {
            mainWindow.webContents.send('request-ui-refresh');
          }, 2000);
        }
        return { success: true, message: 'MDF import completed' };
      }
    }

    // Process regular menu files (if any) with AI parsing + enrichment
    if (menuFiles.length > 0) {
      console.log('Processing regular menu files with AI parsing...');
      const validFiles = menuFiles; // Use menuFiles for the rest of the process
    
    // Start the import process using internal services
    (async () => {
      try {
        sendProgress('Starting AI-powered multi-file menu import...');
        
        // Step 1: Parse all files
        const parsedConfigurations = [];
        
        for (let i = 0; i < validFiles.length; i++) {
          const file = validFiles[i];
          sendProgress(`Parsing file ${i + 1}/${validFiles.length}: ${path.basename(file.path)}`);
          
          const parser = new MenuParserLLM({
            businessType: 'restaurant',
            defaultLanguage: 'de',
            enableValidation: true
          });
          
          const parseResult = await parser.parseMenu(file.path);
          
          if (parseResult.success && parseResult.configuration) {
            parsedConfigurations.push(parseResult.configuration);
            sendProgress(`Successfully parsed: ${path.basename(file.path)} (${parseResult.metadata.itemsFound} items, ${parseResult.metadata.categoriesFound} categories)`);
          } else {
            throw new Error(`Failed to parse ${path.basename(file.path)}`);
          }
        }
        
        // Step 2: Merge configurations
        sendProgress('Combining parsed menu data...');
        const combinedConfiguration = mergeMdfData(parsedConfigurations);
        
        const totalCategories = combinedConfiguration.company_details.branches[0].point_of_sale_devices[0].categories_for_this_pos?.length || 0;
        const totalItems = combinedConfiguration.company_details.branches[0].point_of_sale_devices[0].items_for_this_pos?.length || 0;
        sendProgress(`Combined data: ${totalCategories} categories, ${totalItems} items`);
        
        // Step 3: Enrich data
        sendProgress('Enriching data for AI optimization...');
        const enrichedData = await enrichMdfData(combinedConfiguration, (current, total, message) => {
          sendProgress(`Enriching ${current}/${total}: ${message}`);
        });
        
        // Step 4: Clean database
        sendProgress('Cleaning database before import...');
        await cleanDatabase();
        
        // Step 5: Import to database
        sendProgress('Importing to database...');
        const importResult = await importFromOopMdf(enrichedData, (current, total, itemName) => {
          if (current % 10 === 0 || current === total) {
            sendProgress(`Importing items: ${current}/${total} (${itemName})`);
          }
        });
        
        if (!importResult.success) {
          throw new Error(`Database import failed: ${importResult.message || 'Unknown error'}`);
        }
        
        sendProgress('Menu import completed successfully!', true);
        
        if (mainWindow) {
          mainWindow.webContents.send('menu-import-complete', true, 'Menu import completed successfully!');
          
          // Request UI refresh to reload the page/data
          setTimeout(() => {
            mainWindow.webContents.send('request-ui-refresh');
          }, 2000); // Wait 2 seconds for user to see the success message
        }
        
      } catch (error) {
        const errorMessage = `Import failed: ${error.message}`;
        console.error(errorMessage);
        sendProgress(errorMessage, true);
        
        if (mainWindow) {
          mainWindow.webContents.send('menu-import-complete', false, errorMessage);
        }
      }
    })();
    } // End of menuFiles.length > 0 check
    
    return { success: true, message: 'Import process started' };
    
  } catch (error) {
    console.error('Error starting menu import:', error);
    return { success: false, message: error.message };
  }
});

