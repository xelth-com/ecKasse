/**
 * Menu import routes for file upload and processing
 */

const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const chalk = require('chalk');

const router = express.Router();

// File size limits
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
const MAX_FILE_SIZE_DEMO = 10 * 1024 * 1024; // 10MB (demo mode)

// Check if in demo mode
const isDemoMode = process.env.NODE_ENV === 'development' || process.env.DEMO_MODE === 'true';

// Create multer storage configuration for file uploads
const storage = multer.memoryStorage(); // Store files in memory temporarily

const upload = multer({
  storage: storage,
  limits: {
    fileSize: isDemoMode ? MAX_FILE_SIZE_DEMO : MAX_FILE_SIZE,
    files: 5 // Maximum 5 files per request
  },
  fileFilter: (req, file, cb) => {
    // Check file type
    const allowedTypes = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Invalid file type: ${file.mimetype}. Only PDF, JPG, and PNG files are allowed.`));
    }
  }
});

/**
 * POST /api/menu/upload-and-import
 * Upload menu file(s) and start import process
 */
router.post('/upload-and-import', upload.single('menuFile'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No file uploaded'
      });
    }

    const file = req.file;
    console.log(chalk.blue(`📄 Received file upload: ${file.originalname} (${Math.round(file.size / 1024 / 1024 * 100) / 100}MB)`));

    // Create temporary directory for uploaded files
    const tempDir = path.resolve(__dirname, '../temp_uploads');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    // Generate unique filename to avoid conflicts
    const timestamp = Date.now();
    const sanitizedName = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
    const tempFilePath = path.join(tempDir, `${timestamp}_${sanitizedName}`);

    // Write uploaded file to temporary location
    fs.writeFileSync(tempFilePath, file.buffer);
    console.log(chalk.cyan(`📁 File saved to: ${tempFilePath}`));

    // Path to the import script
    const scriptPath = path.resolve(__dirname, '../scripts/parse_and_init.js');
    
    console.log(chalk.blue('🚀 Starting menu import process...'));

    // Spawn the import script as a child process
    const childProcess = spawn('node', [scriptPath, tempFilePath], {
      stdio: ['ignore', 'pipe', 'pipe'],
      cwd: path.resolve(__dirname, '..')
    });

    let stdoutData = '';
    let stderrData = '';

    // Collect stdout
    childProcess.stdout.on('data', (data) => {
      const output = data.toString();
      stdoutData += output;
      console.log(chalk.gray('IMPORT:'), output.trim());
    });

    // Collect stderr
    childProcess.stderr.on('data', (data) => {
      const output = data.toString();
      stderrData += output;
      console.error(chalk.red('IMPORT ERROR:'), output.trim());
    });

    // Handle process completion
    childProcess.on('close', (code) => {
      console.log(chalk.blue(`📋 Import script finished with code: ${code}`));
      
      // Clean up temporary file
      try {
        fs.unlinkSync(tempFilePath);
        console.log(chalk.gray(`🧹 Cleaned up temporary file: ${tempFilePath}`));
      } catch (cleanupError) {
        console.warn(chalk.yellow(`⚠️  Warning: Could not clean up temporary file: ${cleanupError.message}`));
      }

      if (code === 0) {
        console.log(chalk.green('✅ Menu import completed successfully!'));
        res.json({
          success: true,
          message: 'Menu imported successfully',
          filename: file.originalname,
          processOutput: stdoutData
        });
      } else {
        console.error(chalk.red(`❌ Import failed with exit code ${code}`));
        res.status(500).json({
          success: false,
          message: `Import failed with exit code ${code}`,
          error: stderrData || 'Import process failed',
          processOutput: stdoutData
        });
      }
    });

    // Handle process errors
    childProcess.on('error', (error) => {
      console.error(chalk.red('❌ Failed to start import script:'), error);
      
      // Clean up temporary file
      try {
        fs.unlinkSync(tempFilePath);
      } catch (cleanupError) {
        console.warn(chalk.yellow(`Warning: Could not clean up temporary file: ${cleanupError.message}`));
      }

      res.status(500).json({
        success: false,
        message: `Failed to start import process: ${error.message}`
      });
    });

  } catch (error) {
    console.error(chalk.red('❌ Upload and import error:'), error);
    
    if (error.code === 'LIMIT_FILE_SIZE') {
      const maxSizeMB = isDemoMode ? '10MB' : '50MB';
      return res.status(413).json({
        success: false,
        message: `File too large. Maximum size allowed: ${maxSizeMB} ${isDemoMode ? '(demo mode limit)' : ''}`
      });
    }

    if (error.code === 'LIMIT_FILE_COUNT') {
      return res.status(413).json({
        success: false,
        message: 'Too many files. Maximum 5 files allowed per request.'
      });
    }

    res.status(500).json({
      success: false,
      message: error.message || 'Upload failed'
    });
  }
});

/**
 * GET /api/menu/upload-limits
 * Get current upload limits and restrictions
 */
router.get('/upload-limits', (req, res) => {
  const maxSizeBytes = isDemoMode ? MAX_FILE_SIZE_DEMO : MAX_FILE_SIZE;
  const maxSizeMB = Math.round(maxSizeBytes / 1024 / 1024);
  
  res.json({
    success: true,
    limits: {
      maxFileSize: maxSizeBytes,
      maxFileSizeMB: maxSizeMB,
      maxFiles: 5,
      allowedTypes: ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'],
      isDemoMode: isDemoMode
    }
  });
});

module.exports = router;