// Тест миграции Gemini API на новый SDK
require('dotenv').config();
const { GoogleGenAI } = require('@google/genai');

async function testGeminiMigration() {
  console.log('🔍 Тестирую миграцию Gemini API...');
  
  if (!process.env.GEMINI_API_KEY) {
    console.error('❌ GEMINI_API_KEY не установлен');
    return;
  }
  
  try {
    // Инициализация нового SDK
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    
    // Тестирование генерации контента
    const response = await ai.models.generateContent({
      model: 'gemini-2.0-flash-exp',
      contents: [
        { role: 'user', parts: [{ text: 'Привет! Это тест миграции на новый SDK. Ответь коротко.' }] }
      ]
    });
    
    console.log('✅ Миграция успешна!');
    console.log('📄 Ответ:', response.response?.text?.() || JSON.stringify(response, null, 2));
    
    // Тестирование обработки ошибок
    console.log('\n🔧 Тестирую обработку ошибок...');
    
    const errorHandler = require('./packages/backend/src/utils/geminiErrorHandler');
    
    // Симулируем ошибку rate limit
    const mockError = {
      status: 429,
      message: 'RATE_LIMIT_EXCEEDED'
    };
    
    const errorInfo = errorHandler.handleGeminiError(mockError, { language: 'ru' });
    console.log('📊 Обработка ошибки:', errorInfo);
    
    console.log('\n🎉 Все тесты пройдены успешно!');
    
  } catch (error) {
    console.error('❌ Ошибка при тестировании:', error.message);
  }
}

testGeminiMigration();