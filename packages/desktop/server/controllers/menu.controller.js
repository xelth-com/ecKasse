const path = require('path');
const fs = require('fs').promises;
const { spawn } = require('child_process');
const { services, db } = require('../../../core');
const logger = require('../../../core/config/logger');

// Helper to send progress updates to the frontend
function sendProgress(message, isComplete = false) {
  const prefix = isComplete ? '✅' : '⏳';
  const fullMessage = `PROGRESS: ${prefix} ${message}`;
  console.log(fullMessage); // Log to server console
  if (services.websocket && services.websocket.broadcast) {
    services.websocket.broadcast('menu-import-progress', { message: fullMessage });
  }
}

// Real parsing will be handled by parse_and_init.js script

async function uploadAndImportMenu(req, res) {
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ success: false, message: 'No files uploaded.' });
  }

  const uploadedFiles = req.files;
  const filePaths = uploadedFiles.map(f => f.path);
  const originalFilenames = uploadedFiles.map(f => f.originalname);
  logger.info({ fileCount: filePaths.length, filenames: originalFilenames }, 'Received files for menu import.');

  try {
    sendProgress('Starting AI-powered menu import with real parsing...');
    
    // Execute parse_and_init script for each uploaded file with enhanced progress tracking
    for (let i = 0; i < filePaths.length; i++) {
      const filePath = filePaths[i];
      const originalFilename = originalFilenames[i];
      
      sendProgress(`Processing file ${i + 1}/${filePaths.length}: ${originalFilename}`);
      logger.info(`Processing file ${i + 1}/${filePaths.length}: ${originalFilename}`);
      
      await executeParseAndInit(filePath);
      sendProgress(`Successfully processed: ${originalFilename}`, true);
      logger.info(`Successfully processed: ${originalFilename}`);
    }

    sendProgress('Finalizing import and refreshing UI...', true);

    // Request UI refresh via WebSocket
    if (services.websocket && services.websocket.requestUiRefresh) {
      services.websocket.requestUiRefresh();
    }

    sendProgress('🎉 Menu import completed successfully with AI parsing!', true);

    res.json({
      success: true,
      message: 'Menu imported successfully with AI parsing!',
      fileCount: filePaths.length,
      filenames: originalFilenames
    });

  } catch (error) {
    const errorMessage = `Import failed: ${error.message}`;
    logger.error({ msg: 'Menu import process failed', error: error.message, stack: error.stack });
    sendProgress(`❌ ${errorMessage}`, true);
    res.status(500).json({ success: false, message: errorMessage });
  } finally {
    // Final cleanup of uploaded files
    for (const filePath of filePaths) {
      try {
        await fs.unlink(filePath);
      } catch (cleanupError) {
        logger.warn({ error: cleanupError.message }, `Failed to clean up file: ${filePath}`);
      }
    }
  }
}

function executeParseAndInit(filePath) {
  return new Promise((resolve, reject) => {
    const scriptPath = path.resolve(__dirname, '../../../core/scripts/parse_and_init.js');
    const childProcess = spawn('node', [scriptPath, filePath], {
      cwd: path.resolve(__dirname, '../../../..'), // Set working directory to project root
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        DB_CLIENT: 'pg', // Force PostgreSQL usage
        PG_HOST: 'localhost',
        PG_PORT: '5432',
        PG_USERNAME: 'wms_user',
        PG_PASSWORD: 'gK76543n2PqX5bV9zR4m',
        PG_DATABASE: 'eckwms'
      }
    });

    let stdout = '';
    let stderr = '';

    childProcess.stdout.on('data', (data) => {
      stdout += data.toString();
      const output = data.toString().trim();
      logger.info({ msg: 'Parse script output', output });
      
      // Parse output for progress messages and forward them as WebSocket messages
      const lines = output.split('\n');
      for (const line of lines) {
        if (line.includes('PROGRESS:') || line.includes('Step') || line.includes('Processing') || line.includes('Importing') || line.includes('✅') || line.includes('⏳')) {
          // Clean the line and send as progress
          const cleanLine = line.replace(/PROGRESS:\s*/, '').trim();
          if (cleanLine) {
            sendProgress(cleanLine);
          }
        }
      }
    });

    childProcess.stderr.on('data', (data) => {
      stderr += data.toString();
      logger.warn({ msg: 'Parse script error output', error: data.toString().trim() });
    });

    childProcess.on('close', (code) => {
      if (code === 0) {
        logger.info({ msg: 'Parse script completed successfully', file: filePath });
        resolve({ stdout, stderr });
      } else {
        logger.error({ msg: 'Parse script failed', code, stdout, stderr, file: filePath });
        reject(new Error(`Parse script failed with exit code ${code}: ${stderr}`));
      }
    });

    childProcess.on('error', (error) => {
      logger.error({ msg: 'Failed to start parse script', error: error.message, file: filePath });
      reject(error);
    });
  });
}

module.exports = {
  uploadAndImportMenu,
};