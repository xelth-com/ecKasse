/**
 * Multilingual Support Utilities for Vectron Converter
 * 
 * Handles multiple language support and text localization
 * See VECTRON_CONVERTER_PLAN.md for multilingual details
 * 
 * @module VectronMultilingualUtils
 */

const { sanitizeText } = require('./encoding');

/**
 * Multilingual text manager for Vectron conversion
 */
class MultilingualTextManager {
  constructor(options = {}) {
    this.defaultLanguage = options.defaultLanguage || 'de';
    this.supportedLanguages = options.supportedLanguages || ['de', 'en'];
    this.fallbackLanguage = options.fallbackLanguage || 'en';
    this.textLimits = options.textLimits || {
      itemName: 40,
      categoryName: 30,
      buttonName: 20,
      description: 60
    };
  }
  
  /**
   * Extract localized text with fallback logic
   * @param {Object} textObj - Multilingual text object
   * @param {string} fieldType - Type of field (for length limits)
   * @param {string} language - Preferred language (optional)
   * @returns {string} Localized text
   */
  getLocalizedText(textObj, fieldType = 'default', language = null) {
    if (!textObj || typeof textObj !== 'object') {
      return '';
    }
    
    const targetLanguage = language || this.defaultLanguage;
    const maxLength = this.textLimits[fieldType] || 40;
    
    // Try target language first
    let text = textObj[targetLanguage];
    
    // Fallback to default language
    if (!text) {
      text = textObj[this.defaultLanguage];
    }
    
    // Fallback to fallback language
    if (!text) {
      text = textObj[this.fallbackLanguage];
    }
    
    // Fallback to first available language
    if (!text) {
      const availableKeys = Object.keys(textObj);
      if (availableKeys.length > 0) {
        text = textObj[availableKeys[0]];
      }
    }
    
    if (!text) {
      return '';
    }
    
    return sanitizeText(text, maxLength);
  }
  
  /**
   * Get all available language variants for Vectron multi-language fields
   * @param {Object} textObj - Multilingual text object
   * @param {string} fieldType - Type of field (for length limits)
   * @returns {Array} Array of language variants
   */
  getAllLanguageVariants(textObj, fieldType = 'default') {
    if (!textObj || typeof textObj !== 'object') {
      return [];
    }
    
    const maxLength = this.textLimits[fieldType] || 40;
    const variants = [];
    
    // Process supported languages in order
    this.supportedLanguages.forEach(lang => {
      if (textObj[lang]) {
        variants.push({
          language: lang,
          text: sanitizeText(textObj[lang], maxLength),
          isPrimary: lang === this.defaultLanguage
        });
      }
    });
    
    // Add any additional languages not in supported list
    Object.keys(textObj).forEach(lang => {
      if (!this.supportedLanguages.includes(lang) && textObj[lang]) {
        variants.push({
          language: lang,
          text: sanitizeText(textObj[lang], maxLength),
          isPrimary: false
        });
      }
    });
    
    return variants;
  }
  
  /**
   * Generate Vectron multilingual field mappings
   * @param {Object} textObj - Multilingual text object
   * @param {string} fieldType - Type of field
   * @param {number} baseFieldId - Base field ID (e.g., 101 for Name 1)
   * @returns {Array} Array of field mappings
   */
  generateMultilingualFields(textObj, fieldType, baseFieldId) {
    const variants = this.getAllLanguageVariants(textObj, fieldType);
    const fields = [];
    
    variants.forEach((variant, index) => {
      if (index < 4) { // Vectron typically supports up to 4 language variants
        fields.push({
          id: baseFieldId + index,
          type: 'TX',
          value: variant.text,
          language: variant.language,
          isPrimary: variant.isPrimary
        });
      }
    });
    
    return fields;
  }
  
  /**
   * Detect primary language from multilingual object
   * @param {Object} textObj - Multilingual text object
   * @returns {string} Detected primary language
   */
  detectPrimaryLanguage(textObj) {
    if (!textObj || typeof textObj !== 'object') {
      return this.defaultLanguage;
    }
    
    // Check if default language is available
    if (textObj[this.defaultLanguage]) {
      return this.defaultLanguage;
    }
    
    // Check supported languages in order
    for (const lang of this.supportedLanguages) {
      if (textObj[lang]) {
        return lang;
      }
    }
    
    // Return first available language
    const availableKeys = Object.keys(textObj);
    return availableKeys.length > 0 ? availableKeys[0] : this.defaultLanguage;
  }
  
  /**
   * Validate multilingual text object
   * @param {Object} textObj - Multilingual text object
   * @param {string} fieldName - Field name for error reporting
   * @returns {Array} Array of validation errors
   */
  validateMultilingualText(textObj, fieldName) {
    const errors = [];
    
    if (!textObj) {
      errors.push(`${fieldName}: Multilingual text object is required`);
      return errors;
    }
    
    if (typeof textObj !== 'object') {
      errors.push(`${fieldName}: Must be an object with language keys`);
      return errors;
    }
    
    const availableKeys = Object.keys(textObj);
    if (availableKeys.length === 0) {
      errors.push(`${fieldName}: At least one language variant is required`);
      return errors;
    }
    
    // Check if at least one supported language is present
    const hasSupported = this.supportedLanguages.some(lang => textObj[lang]);
    if (!hasSupported) {
      errors.push(`${fieldName}: Should contain at least one supported language (${this.supportedLanguages.join(', ')})`);
    }
    
    // Validate individual language entries
    availableKeys.forEach(lang => {
      const text = textObj[lang];
      if (typeof text !== 'string') {
        errors.push(`${fieldName}.${lang}: Must be a string`);
      } else if (text.trim().length === 0) {
        errors.push(`${fieldName}.${lang}: Cannot be empty`);
      }
    });
    
    return errors;
  }
  
  /**
   * Create multilingual text object from single text
   * @param {string} text - Single language text
   * @param {string} language - Language code
   * @returns {Object} Multilingual text object
   */
  createMultilingualText(text, language = null) {
    const lang = language || this.defaultLanguage;
    const multilingualObj = {};
    multilingualObj[lang] = text;
    return multilingualObj;
  }
  
  /**
   * Merge multiple multilingual text objects
   * @param {...Object} textObjects - Multilingual text objects to merge
   * @returns {Object} Merged multilingual text object
   */
  mergeMultilingualTexts(...textObjects) {
    const merged = {};
    
    textObjects.forEach(textObj => {
      if (textObj && typeof textObj === 'object') {
        Object.assign(merged, textObj);
      }
    });
    
    return merged;
  }
  
  /**
   * Convert old-style single language text to multilingual
   * @param {string|Object} text - Text to convert
   * @param {string} defaultLang - Default language if text is string
   * @returns {Object} Multilingual text object
   */
  normalizeToMultilingual(text, defaultLang = null) {
    const lang = defaultLang || this.defaultLanguage;
    
    if (typeof text === 'string') {
      return this.createMultilingualText(text, lang);
    }
    
    if (typeof text === 'object' && text !== null) {
      return text;
    }
    
    return {};
  }
  
  /**
   * Get language-specific field mapping for Vectron
   * @param {string} language - Language code
   * @returns {Object} Language field mapping
   */
  getLanguageFieldMapping(language) {
    // Vectron language field mappings
    const languageMappings = {
      'de': { code: 1, name: 'Deutsch' },
      'en': { code: 2, name: 'English' },
      'fr': { code: 3, name: 'Français' },
      'es': { code: 4, name: 'Español' },
      'it': { code: 5, name: 'Italiano' },
      'nl': { code: 6, name: 'Nederlands' },
      'pt': { code: 7, name: 'Português' },
      'ru': { code: 8, name: 'Русский' }
    };
    
    return languageMappings[language.toLowerCase()] || { code: 1, name: language };
  }
  
  /**
   * Generate language configuration for Vectron header
   * @returns {Array} Language configuration fields
   */
  generateLanguageConfig() {
    const fields = [];
    
    // Primary language
    const primaryMapping = this.getLanguageFieldMapping(this.defaultLanguage);
    fields.push({
      id: 15, // Primary language field
      type: 'NR',
      value: primaryMapping.code
    });
    
    // Secondary languages
    this.supportedLanguages.slice(1, 4).forEach((lang, index) => {
      const mapping = this.getLanguageFieldMapping(lang);
      fields.push({
        id: 16 + index, // Secondary language fields (16, 17, 18)
        type: 'NR',
        value: mapping.code
      });
    });
    
    return fields;
  }
}

/**
 * Create language-aware field generator
 * @param {Object} options - Configuration options
 * @returns {MultilingualTextManager} Text manager instance
 */
function createMultilingualManager(options = {}) {
  return new MultilingualTextManager(options);
}

/**
 * Helper function to extract text with fallback
 * @param {Object} textObj - Multilingual text object
 * @param {string} defaultLanguage - Default language
 * @param {string} fallbackLanguage - Fallback language
 * @returns {string} Extracted text
 */
function extractTextWithFallback(textObj, defaultLanguage = 'de', fallbackLanguage = 'en') {
  if (!textObj || typeof textObj !== 'object') {
    return '';
  }
  
  return textObj[defaultLanguage] || 
         textObj[fallbackLanguage] || 
         textObj[Object.keys(textObj)[0]] || 
         '';
}

/**
 * Helper function to detect available languages in data
 * @param {Object} data - OOP-POS-MDF data
 * @returns {Array} Array of detected languages
 */
function detectAvailableLanguages(data) {
  const languages = new Set();
  
  // Check company meta information
  if (data.company_details?.meta_information) {
    const meta = data.company_details.meta_information;
    if (meta.default_language) {
      languages.add(meta.default_language);
    }
    if (meta.supported_languages) {
      meta.supported_languages.forEach(lang => languages.add(lang));
    }
  }
  
  // Check category names
  const categories = data.company_details?.branches?.[0]?.point_of_sale_devices?.[0]?.categories_for_this_pos || [];
  categories.forEach(category => {
    if (category.category_names) {
      Object.keys(category.category_names).forEach(lang => languages.add(lang));
    }
  });
  
  // Check item names
  const items = data.company_details?.branches?.[0]?.point_of_sale_devices?.[0]?.items_for_this_pos || [];
  items.forEach(item => {
    if (item.display_names) {
      Object.values(item.display_names).forEach(nameObj => {
        if (nameObj && typeof nameObj === 'object') {
          Object.keys(nameObj).forEach(lang => languages.add(lang));
        }
      });
    }
  });
  
  return Array.from(languages).sort();
}

module.exports = {
  MultilingualTextManager,
  createMultilingualManager,
  extractTextWithFallback,
  detectAvailableLanguages
};