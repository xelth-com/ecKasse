// File: /packages/backend/src/routes/llm.routes.js
const express = require('express');
const llmController = require('../controllers/llm.controller');
const router = express.Router();

router.post('/ping-gemini', llmController.handleGeminiPing);

module.exports = router;