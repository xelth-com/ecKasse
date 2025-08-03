// packages/backend/src/services/llm.provider.js
const { GoogleGenAI } = require('@google/genai');

if (!process.env.GEMINI_API_KEY) {
  console.error('❌ FATAL: GEMINI_API_KEY is not configured. The application cannot function.');
  throw new Error('GEMINI_API_KEY is missing from environment variables.');
}

const genAI = new GoogleGenAI(process.env.GEMINI_API_KEY);

/**
 * A shared, singleton instance of the Google AI client.
 */
const geminiClient = genAI;

/**
 * A helper to get a specific model from the shared client.
 * @param {object} options - Model options like modelName.
 * @returns {object} - Model interface for @google/genai SDK
 */
function getGeminiModel(options = {}) {
    const modelName = options.modelName || 'gemini-2.0-flash';
    // For @google/genai SDK, we return an object with methods that wrap the client
    return {
        modelName: modelName,
        generateContent: (request) => {
            return genAI.models.generateContent({
                model: modelName,
                ...request
            });
        },
        startChat: (config) => {
            // Create a chat interface that uses the new SDK structure
            return {
                sendMessage: async (message) => {
                    const contents = [
                        ...(config.history || []),
                        typeof message === 'string' 
                            ? { role: 'user', parts: [{ text: message }] }
                            : message
                    ];
                    
                    return genAI.models.generateContent({
                        model: modelName,
                        contents: contents,
                        tools: config.tools,
                        systemInstruction: config.systemInstruction,
                        generationConfig: config.generationConfig
                    });
                }
            };
        }
    };
}

module.exports = {
  geminiClient,
  getGeminiModel
};