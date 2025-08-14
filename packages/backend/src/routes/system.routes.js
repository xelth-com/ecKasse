const express = require('express');
const router = express.Router();
const logger = require('../config/logger');
const systemController = require('../controllers/system.controller');

router.get('/mode', (req, res) => {
  const appMode = 'production';
  logger.info({ service: 'System', function: 'getMode', mode: appMode });
  res.json({ mode: appMode });
});

router.post('/request-ui-refresh', systemController.handleUiRefreshRequest);

module.exports = router;