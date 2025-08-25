const { services } = require('../../../core');
const logger = require('../../../core/config/logger');
const fs = require('fs');
const path = require('path');

/**
 * WebSocket handler for legacy compatibility
 */
async function handleGenerateExport(payload) {
  const { startDate, endDate } = payload;
  if (!startDate || !endDate) {
    throw new Error('startDate and endDate are required for DSFinV-K export.');
  }
  
  const result = await services.dsfinvk.generateExport({ startDate, endDate, userId: 3 });
  
  logger.info({ result }, 'DSFinV-K export generated.');
  return {
    success: true, 
    message: `Export successfully generated at ${result.path}`,
    ...result 
  };
}

/**
 * HTTP POST /api/dsfinvk/start - Start DSFinV-K export
 * In development: streams file directly
 * In production: creates background job
 */
async function startExport(req, res) {
  try {
    const { startDate, endDate } = req.body;
    // Get user ID from session - user must be authenticated
    const userId = req.session.user.id;
    
    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        error: 'startDate and endDate are required for DSFinV-K export.'
      });
    }

    const isProduction = process.env.NODE_ENV === 'production';
    
    if (isProduction) {
      // Production: Async job mode
      const result = await services.dsfinvk.generateExport({ 
        startDate, 
        endDate, 
        userId 
      });
      
      res.json({
        success: true,
        jobId: result.jobId,
        status: result.status,
        message: result.message
      });
      
    } else {
      // Development: Direct streaming mode
      const result = await services.dsfinvk.generateExport({ 
        startDate, 
        endDate, 
        userId 
      });
      
      if (!result.success) {
        return res.status(500).json({
          success: false,
          error: 'Export generation failed'
        });
      }

      // Stream the ZIP file directly to client
      const filePath = result.path;
      const filename = `dsfinvk-export-${startDate}-to-${endDate}.zip`;
      
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('Content-Type', 'application/zip');
      
      const fileStream = fs.createReadStream(filePath);
      fileStream.pipe(res);
      
      // Cleanup file after streaming
      fileStream.on('end', () => {
        fs.unlink(filePath, (err) => {
          if (err) {
            logger.warn('Failed to cleanup export file:', err.message);
          } else {
            logger.info('Export file cleaned up successfully:', filePath);
          }
        });
      });
    }
    
  } catch (error) {
    logger.error({ error: error.message, stack: error.stack }, 'Export start failed');
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

/**
 * HTTP GET /api/dsfinvk/status/:jobId - Check export job status
 * Only used in production mode
 */
async function getJobStatus(req, res) {
  try {
    const { jobId } = req.params;
    
    if (!jobId) {
      return res.status(400).json({
        success: false,
        error: 'jobId is required'
      });
    }

    const job = await services.dsfinvk.getJobStatus(jobId);
    
    const response = {
      success: true,
      jobId: job.job_id,
      status: job.status,
      createdAt: job.created_at,
      updatedAt: job.updated_at
    };

    if (job.status === 'FAILED') {
      response.error = job.error_message;
    } else if (job.status === 'COMPLETE') {
      response.downloadUrl = `/api/export/dsfinvk/download/${job.download_token}`;
      response.expiresAt = job.expires_at;
    }

    res.json(response);
    
  } catch (error) {
    logger.error({ error: error.message }, 'Job status check failed');
    res.status(404).json({
      success: false,
      error: error.message
    });
  }
}

/**
 * HTTP GET /api/dsfinvk/download/:token - Download completed export
 * Only used in production mode
 */
async function downloadExport(req, res) {
  try {
    const { token } = req.params;
    
    if (!token) {
      return res.status(400).json({
        success: false,
        error: 'Download token is required'
      });
    }

    const downloadInfo = await services.dsfinvk.getDownloadInfo(token);
    
    if (!downloadInfo.file_path || !fs.existsSync(downloadInfo.file_path)) {
      return res.status(404).json({
        success: false,
        error: 'Export file not found or has been deleted'
      });
    }

    // Get date range from job parameters for user-friendly filename
    let filename = `dsfinvk-export-${new Date().toISOString().split('T')[0]}.zip`;
    try {
      // Handle both string and object parameters
      const jobParams = typeof downloadInfo.parameters === 'string' 
        ? JSON.parse(downloadInfo.parameters) 
        : downloadInfo.parameters || {};
      if (jobParams.startDate && jobParams.endDate) {
        filename = `dsfinvk-export-${jobParams.startDate}-to-${jobParams.endDate}.zip`;
      }
    } catch (e) {
      logger.warn('Failed to parse job parameters for filename, using default', e.message);
    }
    
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', 'application/zip');
    
    const fileStream = fs.createReadStream(downloadInfo.file_path);
    fileStream.pipe(res);
    
    // Log successful download
    fileStream.on('end', () => {
      logger.info({ token, filePath: downloadInfo.file_path }, 'Export file downloaded successfully');
    });
    
  } catch (error) {
    logger.error({ error: error.message }, 'Export download failed');
    res.status(404).json({
      success: false,
      error: error.message
    });
  }
}

module.exports = {
  handleGenerateExport,
  startExport,
  getJobStatus,
  downloadExport
};