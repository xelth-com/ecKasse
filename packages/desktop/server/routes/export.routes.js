const express = require('express');
const { 
  handleGenerateExport, 
  startExport, 
  getJobStatus, 
  downloadExport 
} = require('../controllers/export.controller');
const { isAuthenticated } = require('../middleware/auth.middleware');
const router = express.Router();

// Legacy route for WebSocket compatibility
router.post('/dsfinvk', async (req, res, next) => {
  try {
    const result = await handleGenerateExport(req.body);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

// New HTTP API routes for async export functionality
router.post('/dsfinvk/start', isAuthenticated, startExport);
router.get('/dsfinvk/status/:jobId', isAuthenticated, getJobStatus);
router.get('/dsfinvk/download/:token', downloadExport); // Downloads can be accessed with tokens

module.exports = router;