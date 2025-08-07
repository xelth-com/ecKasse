const express = require('express');
const router = express.Router();
const logger = require('../config/logger');

router.get('/mode', (req, res) => {
  const appMode = process.env.APP_MODE || 'production';
  logger.info({ service: 'System', function: 'getMode', mode: appMode });
  res.json({ mode: appMode });
});

module.exports = router;