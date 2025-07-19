// File: /packages/backend/src/controllers/llm.controller.js
const llmService = require('../services/llm.service');
const logger = require('../config/logger');

// In a real app, chat history would be stored per user/session
let globalChatHistory = []; 

async function handleGeminiPing(req, res, next) {
  const { message, history } = req.body; // Expect history to be passed if continuing a conversation

  if (!message) {
    logger.warn({type: 'http_request', direction: 'in', msg: 'Gemini ping request without message body'});
    return res.status(400).json({ error: 'Message is required in the request body.' });
  }

  // Use provided history or the global one (for simple demo)
  const currentHistory = history || globalChatHistory;

  try {
    const geminiServiceResponse = await llmService.sendMessage(message, currentHistory);
    
    // Update global history (for next turn in this simple demo)
    // In a real app, manage this per session.
    if (geminiServiceResponse.history) {
        globalChatHistory = geminiServiceResponse.history;
    } else { // If only text was returned (error or simple response without history update from service)
        globalChatHistory.push({ role: "user", parts: [{ text: message }] });
        globalChatHistory.push({ role: "model", parts: [{ text: geminiServiceResponse.text }] });
    }
    // Cap history length to avoid overly long contexts for this demo
    if (globalChatHistory.length > 10) {
        globalChatHistory = globalChatHistory.slice(-10);
    }

    const responsePayload = {
      status: 'success',
      original_message: message,
      gemini_response_text: geminiServiceResponse.text, // just the text for client
      // Добавляем информацию о лимитах для UI
      isTemporary: geminiServiceResponse.isTemporary,
      errorType: geminiServiceResponse.errorType,
      // full_gemini_service_response: geminiServiceResponse, // Optional: for debugging
    };
    
    logger.info({type: 'http_response', direction: 'out', operation: 'geminiPing', data: responsePayload});
    res.json(responsePayload);
  } catch (error) {
    logger.error({ msg: 'Error in handleGeminiPing controller', err: error.message, originalMessage: message });
    // Clear history on error for this simple demo to avoid corrupted state
    globalChatHistory = []; 
    res.status(500).json({ error: error.message || 'Failed to get response from Gemini.' });
  }
}

module.exports = {
  handleGeminiPing,
};