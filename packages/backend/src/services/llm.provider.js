// packages/backend/src/services/llm.provider.js
const { GoogleGenAI } = require('@google/genai');

if (!process.env.GEMINI_API_KEY) {
  console.error('❌ FATAL: GEMINI_API_KEY is not configured. The application cannot function.');
  throw new Error('GEMINI_API_KEY is missing from environment variables.');
}

const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

/**
 * A shared, singleton instance of the Google AI client.
 */
const geminiClient = genAI;

/**
 * A helper to get a specific model from the shared client.
 * @param {object} options - Model options like modelName.
 * @returns {import('@google/generative-ai').GenerativeModel}
 */
function getGeminiModel(options = {}) {
    const modelName = options.modelName || 'gemini-2.0-flash';
    return {
        modelName,
        generateContent: (content) => geminiClient.models.generateContent({
            model: modelName,
            contents: content
        })
    };
}

module.exports = {
  geminiClient,
  getGeminiModel
};