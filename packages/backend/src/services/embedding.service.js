// File: /packages/backend/src/services/embedding.service.js

const { GoogleGenerativeAI } = require('@google/generative-ai');
const { handleGeminiError, createGeminiErrorLog } = require('../utils/geminiErrorHandler');

const USE_MOCK_EMBEDDINGS = !process.env.GEMINI_API_KEY || process.env.USE_MOCK_EMBEDDINGS === 'true';

let genAI, model;
if (!USE_MOCK_EMBEDDINGS) {
  genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  model = genAI.getGenerativeModel({ model: "text-embedding-004" });
}

/**
 * Generate a deterministic mock embedding for testing
 * @param {string} text - Text to generate embedding for
 * @returns {number[]} - Array of 768 float values
 */
function generateMockEmbedding(text) {
  const embedding = new Array(768);
  
  // Create a simple hash of the text to ensure deterministic results
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    const char = text.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  
  // Generate deterministic pseudo-random values based on text hash
  for (let i = 0; i < 768; i++) {
    const seed = hash + i;
    const x = Math.sin(seed) * 10000;
    embedding[i] = (x - Math.floor(x)) * 2 - 1; // Values between -1 and 1
  }
  
  return embedding;
}

/**
 * Generate embedding vector for text using Google's text-embedding-004 model
 * @param {string} text - Text to generate embedding for
 * @returns {Promise<number[]>} - Array of 768 float values representing the embedding
 */
async function generateEmbedding(text) {
  if (USE_MOCK_EMBEDDINGS) {
    console.log(`Generating mock embedding for: "${text}"`);
    return generateMockEmbedding(text);
  }
  
  try {
    const result = await model.embedContent(text);
    return result.embedding.values;
  } catch (error) {
    // Обработка специфических ошибок Gemini API
    const geminiErrorInfo = handleGeminiError(error, { 
      language: 'ru', 
      includeRetryInfo: true 
    });
    
    // Создаем структурированный лог
    const errorLog = createGeminiErrorLog(error, {
      operation: 'embedding_generation',
      text: text.substring(0, 50), // Первые 50 символов текста
      isTemporary: geminiErrorInfo.isTemporary
    });
    
    // Выводим лог в консоль с соответствующим уровнем
    if (errorLog.level === 'warn') {
      console.warn('🚦 GEMINI EMBEDDING LIMIT:', errorLog.userMessage);
      console.warn('   Retry in:', errorLog.retryDelay + 's');
    } else {
      console.error('❌ GEMINI EMBEDDING ERROR:', errorLog.userMessage);
    }
    
    // Для временных ошибок возвращаем mock embedding как fallback
    if (geminiErrorInfo.isTemporary) {
      console.log('🔄 Falling back to mock embedding due to API limit');
      return generateMockEmbedding(text);
    }
    
    throw error;
  }
}

/**
 * Convert embedding array to Float32Array buffer for sqlite-vec
 * @param {number[]} embedding - Array of float values
 * @returns {Buffer} - Buffer suitable for sqlite-vec
 */
function embeddingToBuffer(embedding) {
  const float32Array = new Float32Array(embedding);
  return Buffer.from(float32Array.buffer);
}

/**
 * Convert Buffer back to regular array
 * @param {Buffer} buffer - Buffer from sqlite-vec
 * @returns {number[]} - Array of float values
 */
function bufferToEmbedding(buffer) {
  const float32Array = new Float32Array(buffer.buffer, buffer.byteOffset, buffer.length / 4);
  return Array.from(float32Array);
}

/**
 * Convert embedding array to JSON string (deprecated - for compatibility)
 * @param {number[]} embedding - Array of float values
 * @returns {string} - JSON string
 */
function embeddingToJson(embedding) {
  return JSON.stringify(embedding);
}

/**
 * Convert JSON string back to regular array (deprecated - for compatibility)
 * @param {string} jsonString - JSON string
 * @returns {number[]} - Array of float values
 */
function jsonToEmbedding(jsonString) {
  return JSON.parse(jsonString);
}

module.exports = {
  generateEmbedding,
  embeddingToBuffer,
  bufferToEmbedding,
  embeddingToJson,
  jsonToEmbedding
};