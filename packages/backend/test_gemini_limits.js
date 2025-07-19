// Test file for Gemini API limit handling
require('dotenv').config({ path: '../../.env' });

const { handleGeminiError, createGeminiErrorLog, GEMINI_ERROR_TYPES } = require('./src/utils/geminiErrorHandler');
const { sendMessage } = require('./src/services/llm.service');

/**
 * Симулирует различные типы ошибок Gemini API для тестирования
 */
function createMockGeminiError(type) {
  const errors = {
    [GEMINI_ERROR_TYPES.RATE_LIMIT]: new Error('Rate limit exceeded. Too many requests per minute.'),
    [GEMINI_ERROR_TYPES.QUOTA_EXCEEDED]: new Error('Quota exceeded for free tier usage.'),
    [GEMINI_ERROR_TYPES.INVALID_API_KEY]: new Error('Invalid API key provided.'),
    [GEMINI_ERROR_TYPES.NETWORK_ERROR]: new Error('Network connection failed: ECONNRESET'),
    [GEMINI_ERROR_TYPES.SERVICE_ERROR]: new Error('Internal server error: Service temporarily unavailable'),
    [GEMINI_ERROR_TYPES.CONTENT_FILTER]: new Error('Content blocked by safety filter policy')
  };

  const error = errors[type] || new Error('Unknown test error');
  
  // Добавляем специфические свойства для разных типов ошибок
  switch (type) {
    case GEMINI_ERROR_TYPES.RATE_LIMIT:
      error.code = 429;
      break;
    case GEMINI_ERROR_TYPES.INVALID_API_KEY:
      error.code = 401;
      break;
    case GEMINI_ERROR_TYPES.SERVICE_ERROR:
      error.code = 503;
      break;
  }

  return error;
}

/**
 * Тестирует обработку различных типов ошибок
 */
function testErrorHandling() {
  console.log('🧪 ТЕСТИРОВАНИЕ ОБРАБОТКИ ОШИБОК GEMINI API\n');

  Object.values(GEMINI_ERROR_TYPES).forEach(errorType => {
    console.log(`\n📋 Тестируем: ${errorType}`);
    console.log('=' .repeat(50));

    const mockError = createMockGeminiError(errorType);
    const errorInfo = handleGeminiError(mockError, { 
      language: 'ru', 
      includeRetryInfo: true 
    });

    console.log('✅ Результат обработки:');
    console.log(`   Тип ошибки: ${errorInfo.errorType}`);
    console.log(`   Временная: ${errorInfo.isTemporary}`);
    console.log(`   Сообщение: ${errorInfo.userMessage}`);
    
    if (errorInfo.retryMessage) {
      console.log(`   Повтор: ${errorInfo.retryMessage}`);
    }

    // Тест логирования
    const logEntry = createGeminiErrorLog(mockError, {
      operation: 'test_operation',
      userId: 'test_user'
    });

    console.log(`\n📝 Лог (${logEntry.level.toUpperCase()}):`);
    console.log(`   ${logEntry.msg}`);
    console.log(`   Пользователю: ${logEntry.userMessage}`);
    
    if (logEntry.retryDelay > 0) {
      console.log(`   Задержка повтора: ${logEntry.retryDelay}с`);
    }
  });
}

/**
 * Тестирует реальную обработку в LLM сервисе с симуляцией ошибки
 */
async function testLLMServiceWithMockError() {
  console.log('\n\n🔧 ТЕСТИРОВАНИЕ LLM СЕРВИСА С СИМУЛЯЦИЕЙ ОШИБКИ\n');

  // Временно перезаписываем API ключ чтобы вызвать ошибку аутентификации
  const originalApiKey = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = 'invalid_test_key_12345';

  try {
    console.log('📤 Отправляем сообщение с неверным API ключом...');
    const response = await sendMessage('Привет! Как дела?');
    
    console.log('📥 Ответ LLM сервиса:');
    console.log(`   Текст: ${response.text}`);
    console.log(`   Временная ошибка: ${response.isTemporary || 'false'}`);
    console.log(`   Тип ошибки: ${response.errorType || 'не указан'}`);
    
  } catch (error) {
    console.log('❌ Неожиданная ошибка:', error.message);
  } finally {
    // Восстанавливаем оригинальный API ключ
    process.env.GEMINI_API_KEY = originalApiKey;
  }
}

/**
 * Тестирует реальную работу с валидным API ключом
 */
async function testLLMServiceNormal() {
  console.log('\n\n✅ ТЕСТИРОВАНИЕ НОРМАЛЬНОЙ РАБОТЫ LLM СЕРВИСА\n');

  try {
    console.log('📤 Отправляем обычное сообщение...');
    const response = await sendMessage('Найди товар кружка');
    
    console.log('📥 Ответ LLM сервиса:');
    console.log(`   Текст: ${response.text}`);
    console.log(`   Временная ошибка: ${response.isTemporary || 'false'}`);
    console.log(`   Тип ошибки: ${response.errorType || 'не указан'}`);
    
  } catch (error) {
    console.log('❌ Ошибка:', error.message);
  }
}

/**
 * Главная функция тестирования
 */
async function runTests() {
  try {
    // Тест 1: Обработка различных типов ошибок
    testErrorHandling();
    
    // Тест 2: Симуляция ошибки в LLM сервисе
    await testLLMServiceWithMockError();
    
    // Тест 3: Нормальная работа (если есть валидный API ключ)
    if (process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'your_api_key_here') {
      await testLLMServiceNormal();
    } else {
      console.log('\n⚠️  Пропускаем тест нормальной работы - нет валидного API ключа');
    }
    
    console.log('\n🎉 ВСЕ ТЕСТЫ ЗАВЕРШЕНЫ!');
    
  } catch (error) {
    console.error('\n💥 Критическая ошибка в тестах:', error);
  }
}

// Запускаем тесты
if (require.main === module) {
  runTests().finally(() => {
    setTimeout(() => process.exit(0), 1000); // Даем время завершиться логам
  });
}

module.exports = {
  createMockGeminiError,
  testErrorHandling,
  runTests
};