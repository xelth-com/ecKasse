// File: /packages/backend/src/utils/geminiErrorHandler.js

/**
 * Утилита для обработки и классификации ошибок Gemini API
 */

/**
 * Типы ошибок Gemini API
 */
const GEMINI_ERROR_TYPES = {
  RATE_LIMIT: 'RATE_LIMIT',           // Превышен лимит запросов
  QUOTA_EXCEEDED: 'QUOTA_EXCEEDED',   // Превышена квота API
  INVALID_API_KEY: 'INVALID_API_KEY', // Неверный API ключ
  NETWORK_ERROR: 'NETWORK_ERROR',     // Сетевая ошибка
  SERVICE_ERROR: 'SERVICE_ERROR',     // Ошибка сервиса Google
  CONTENT_FILTER: 'CONTENT_FILTER',   // Контент заблокирован фильтром
  UNKNOWN_ERROR: 'UNKNOWN_ERROR'      // Неизвестная ошибка
};

/**
 * Паттерны для идентификации ошибок по сообщению
 */
const ERROR_PATTERNS = {
  [GEMINI_ERROR_TYPES.RATE_LIMIT]: [
    /rate limit exceeded/i,
    /too many requests/i,
    /quota exceeded.*requests per minute/i,
    /resource exhausted/i
  ],
  [GEMINI_ERROR_TYPES.QUOTA_EXCEEDED]: [
    /quota exceeded/i,
    /billing account/i,
    /usage limit/i,
    /free tier.*exceeded/i
  ],
  [GEMINI_ERROR_TYPES.INVALID_API_KEY]: [
    /invalid api key/i,
    /authentication failed/i,
    /unauthorized/i,
    /api key not valid/i
  ],
  [GEMINI_ERROR_TYPES.NETWORK_ERROR]: [
    /network error/i,
    /connection.*failed/i,
    /timeout/i,
    /econnreset/i,
    /enotfound/i
  ],
  [GEMINI_ERROR_TYPES.SERVICE_ERROR]: [
    /internal server error/i,
    /service unavailable/i,
    /bad gateway/i,
    /temporarily unavailable/i
  ],
  [GEMINI_ERROR_TYPES.CONTENT_FILTER]: [
    /content filter/i,
    /safety filter/i,
    /inappropriate content/i,
    /blocked.*policy/i
  ]
};

/**
 * Пользовательские сообщения для каждого типа ошибки
 */
const USER_MESSAGES = {
  [GEMINI_ERROR_TYPES.RATE_LIMIT]: {
    ru: "⚠️ Превышен лимит запросов к AI. Пожалуйста, подождите немного и попробуйте снова.",
    en: "⚠️ AI request limit exceeded. Please wait a moment and try again."
  },
  [GEMINI_ERROR_TYPES.QUOTA_EXCEEDED]: {
    ru: "⚠️ Исчерпана бесплатная квота AI на сегодня. Для продолжения работы рассмотрите возможность приобретения платного тарифа.",
    en: "⚠️ Daily AI quota exhausted. Consider upgrading to a paid plan to continue."
  },
  [GEMINI_ERROR_TYPES.INVALID_API_KEY]: {
    ru: "❌ Проблема с API ключом. Обратитесь к администратору системы.",
    en: "❌ API key issue. Contact system administrator."
  },
  [GEMINI_ERROR_TYPES.NETWORK_ERROR]: {
    ru: "🌐 Проблема с сетевым подключением. Проверьте интернет-соединение.",
    en: "🌐 Network connection issue. Check your internet connection."
  },
  [GEMINI_ERROR_TYPES.SERVICE_ERROR]: {
    ru: "🔧 Временная проблема с сервисом AI. Попробуйте позже.",
    en: "🔧 Temporary AI service issue. Try again later."
  },
  [GEMINI_ERROR_TYPES.CONTENT_FILTER]: {
    ru: "🛡️ Запрос заблокирован системой безопасности AI. Попробуйте перефразировать.",
    en: "🛡️ Request blocked by AI safety system. Try rephrasing."
  },
  [GEMINI_ERROR_TYPES.UNKNOWN_ERROR]: {
    ru: "❓ Неизвестная ошибка AI. Попробуйте снова или обратитесь к поддержке.",
    en: "❓ Unknown AI error. Try again or contact support."
  }
};

/**
 * Определяет тип ошибки по объекту ошибки
 * @param {Error} error - Объект ошибки
 * @returns {string} - Тип ошибки из GEMINI_ERROR_TYPES
 */
function classifyGeminiError(error) {
  if (!error) return GEMINI_ERROR_TYPES.UNKNOWN_ERROR;

  const errorMessage = error.message || '';
  const errorCode = error.code || error.status || '';
  
  // Проверяем по HTTP статус коду
  if (errorCode === 429 || errorCode === '429') {
    return GEMINI_ERROR_TYPES.RATE_LIMIT;
  }
  if (errorCode === 401 || errorCode === '401' || errorCode === 403 || errorCode === '403') {
    return GEMINI_ERROR_TYPES.INVALID_API_KEY;
  }
  if (errorCode >= 500 && errorCode < 600) {
    return GEMINI_ERROR_TYPES.SERVICE_ERROR;
  }

  // Проверяем по паттернам в сообщении об ошибке
  for (const [errorType, patterns] of Object.entries(ERROR_PATTERNS)) {
    for (const pattern of patterns) {
      if (pattern.test(errorMessage)) {
        return errorType;
      }
    }
  }

  return GEMINI_ERROR_TYPES.UNKNOWN_ERROR;
}

/**
 * Получает пользовательское сообщение для типа ошибки
 * @param {string} errorType - Тип ошибки
 * @param {string} language - Язык ('ru' или 'en')
 * @returns {string} - Пользовательское сообщение
 */
function getUserMessage(errorType, language = 'ru') {
  const messages = USER_MESSAGES[errorType];
  if (!messages) {
    return USER_MESSAGES[GEMINI_ERROR_TYPES.UNKNOWN_ERROR][language];
  }
  return messages[language] || messages.ru;
}

/**
 * Проверяет, является ли ошибка временной (требует повтора)
 * @param {string} errorType - Тип ошибки
 * @returns {boolean} - true если ошибка временная
 */
function isTemporaryError(errorType) {
  return [
    GEMINI_ERROR_TYPES.RATE_LIMIT,
    GEMINI_ERROR_TYPES.NETWORK_ERROR,
    GEMINI_ERROR_TYPES.SERVICE_ERROR
  ].includes(errorType);
}

/**
 * Определяет время ожидания перед повтором (в секундах)
 * @param {string} errorType - Тип ошибки
 * @returns {number} - Время ожидания в секундах
 */
function getRetryDelay(errorType) {
  switch (errorType) {
    case GEMINI_ERROR_TYPES.RATE_LIMIT:
      return 60; // 1 минута
    case GEMINI_ERROR_TYPES.NETWORK_ERROR:
      return 10; // 10 секунд
    case GEMINI_ERROR_TYPES.SERVICE_ERROR:
      return 30; // 30 секунд
    default:
      return 0; // Не повторять
  }
}

/**
 * Основная функция обработки ошибок Gemini API
 * @param {Error} error - Объект ошибки
 * @param {Object} options - Опции обработки
 * @returns {Object} - Результат обработки ошибки
 */
function handleGeminiError(error, options = {}) {
  const { language = 'ru', includeRetryInfo = false } = options;
  
  const errorType = classifyGeminiError(error);
  const userMessage = getUserMessage(errorType, language);
  const isTemporary = isTemporaryError(errorType);
  const retryDelay = getRetryDelay(errorType);

  const result = {
    errorType,
    isTemporary,
    userMessage,
    originalError: error.message || 'Unknown error'
  };

  if (includeRetryInfo && isTemporary) {
    result.retryDelay = retryDelay;
    result.retryMessage = language === 'ru' 
      ? `Попробуйте снова через ${retryDelay} секунд.`
      : `Try again in ${retryDelay} seconds.`;
  }

  return result;
}

/**
 * Создает структурированный лог для ошибки Gemini API
 * @param {Error} error - Объект ошибки
 * @param {Object} context - Контекст (operation, userId и т.д.)
 * @returns {Object} - Объект для логирования
 */
function createGeminiErrorLog(error, context = {}) {
  const errorType = classifyGeminiError(error);
  const isTemporary = isTemporaryError(errorType);

  return {
    level: isTemporary ? 'warn' : 'error',
    msg: isTemporary 
      ? '🚦 Gemini API временная ошибка'
      : '❌ Gemini API критическая ошибка',
    geminiErrorType: errorType,
    isTemporary,
    userMessage: getUserMessage(errorType, 'ru'),
    originalError: error.message,
    retryDelay: getRetryDelay(errorType),
    ...context
  };
}

module.exports = {
  GEMINI_ERROR_TYPES,
  classifyGeminiError,
  getUserMessage,
  isTemporaryError,
  getRetryDelay,
  handleGeminiError,
  createGeminiErrorLog
};