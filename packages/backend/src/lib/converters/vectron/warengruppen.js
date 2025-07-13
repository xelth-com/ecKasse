/**
 * Vectron Warengruppen Converter (LineType 102)
 * 
 * Converts OOP-POS-MDF categories to Vectron Warengruppen format
 * See VECTRON_CONVERTER_PLAN.md section 3.3 for details
 * 
 * @module VectronWarengruppenConverter
 */

const VectronLineFormatter = require('./utils/formatter');
const { sanitizeText } = require('./utils/encoding');
const VectronFieldMapper = require('./mapping');

/**
 * Convert OOP-POS-MDF categories to Vectron Warengruppen lines
 * @param {Array} categories - Categories from OOP-POS-MDF
 * @param {Object} globalConfig - Global configuration
 * @param {Object} options - Conversion options
 * @returns {Array} Array of Warengruppen lines
 */
function convertCategoriesToWarengruppen(categories, globalConfig, options = {}) {
  if (!categories || !Array.isArray(categories)) {
    return [];
  }
  
  const formatter = new VectronLineFormatter();
  const mapper = new VectronFieldMapper(options);
  const defaultLanguage = options.defaultLanguage || 'de';
  const wgLines = [];
  
  categories.forEach(category => {
    try {
      const wgLine = convertSingleCategoryToWarengruppe(
        category,
        globalConfig,
        mapper,
        formatter,
        defaultLanguage
      );
      if (wgLine) {
        wgLines.push(wgLine);
      }
    } catch (error) {
      console.error(`Error converting category ${category.category_unique_identifier}: ${error.message}`);
      if (options.strictMode) {
        throw error;
      }
    }
  });
  
  return wgLines;
}

/**
 * Convert single category to Warengruppe line
 * @param {Object} category - Category from OOP-POS-MDF
 * @param {Object} globalConfig - Global configuration
 * @param {VectronFieldMapper} mapper - Field mapper
 * @param {VectronLineFormatter} formatter - Line formatter
 * @param {string} defaultLanguage - Default language
 * @returns {string} Warengruppe line
 */
function convertSingleCategoryToWarengruppe(category, globalConfig, mapper, formatter, defaultLanguage) {
  // Generate Warengruppe number
  const categoryName = getLocalizedText(category.category_names, defaultLanguage);
  const wgNumber = mapper.generateWarengruppeNumber(
    category.category_unique_identifier,
    categoryName
  );
  
  // Prepare field array
  const fields = [];
  
  // Names (101-199)
  if (categoryName) {
    fields.push({
      id: 101,
      type: 'TX',
      value: sanitizeText(categoryName, 30)
    });
  }
  
  // Alternative name if available
  const alternativeLanguages = Object.keys(category.category_names || {});
  const altLanguage = alternativeLanguages.find(lang => lang !== defaultLanguage);
  if (altLanguage) {
    const altName = category.category_names[altLanguage];
    if (altName && altName !== categoryName) {
      fields.push({
        id: 102,
        type: 'TX',
        value: sanitizeText(altName, 30)
      });
    }
  }
  
  // Main group (201)
  const mainGroup = category.default_linked_main_group_unique_identifier || 
                   mapper.mapCategoryTypeToMainGroup(category.category_type);
  fields.push({
    id: 201,
    type: 'NR',
    value: mainGroup
  });
  
  // Default tax rate (401)
  const taxRateId = getDefaultTaxRateForCategory(category, globalConfig);
  const taxRatePercentage = mapper.extractTaxRatePercentage(taxRateId, globalConfig.tax_rates_definitions);
  const vectronTaxRate = mapper.mapTaxRate(taxRatePercentage);
  fields.push({
    id: 401,
    type: 'NR',
    value: vectronTaxRate
  });
  
  // Printer assignment (501) - optional
  if (category.default_printer_id) {
    fields.push({
      id: 501,
      type: 'NR',
      value: category.default_printer_id
    });
  }
  
  // Active flag (9001)
  const isActive = category.is_active !== false;
  fields.push({
    id: 9001,
    type: 'NR',
    value: isActive ? 0 : 1
  });
  
  return formatter.formatWarengruppenLine(wgNumber, fields);
}

/**
 * Get localized text from multilingual object
 * @param {Object} textObj - Multilingual text object
 * @param {string} defaultLanguage - Default language
 * @returns {string} Localized text
 */
function getLocalizedText(textObj, defaultLanguage) {
  if (!textObj || typeof textObj !== 'object') {
    return '';
  }
  
  return textObj[defaultLanguage] || 
         textObj[Object.keys(textObj)[0]] || 
         '';
}

/**
 * Get default tax rate for category
 * @param {Object} category - Category object
 * @param {Object} globalConfig - Global configuration
 * @returns {number} Tax rate identifier
 */
function getDefaultTaxRateForCategory(category, globalConfig) {
  // For drinks, use drink tax rate; for food, use food tax rate
  if (category.category_type === 'drink') {
    return globalConfig.default_linked_drink_tax_rate_unique_identifier || 1;
  } else if (category.category_type === 'food') {
    return globalConfig.default_linked_food_tax_rate_unique_identifier || 2;
  }
  
  // Default to first available tax rate
  return globalConfig.tax_rates_definitions?.[0]?.tax_rate_unique_identifier || 1;
}

/**
 * Validate categories for Warengruppen conversion
 * @param {Array} categories - Categories to validate
 * @returns {Array} Array of validation errors
 */
function validateCategoriesForWarengruppen(categories) {
  const errors = [];
  
  if (!categories || !Array.isArray(categories)) {
    errors.push('Categories must be an array');
    return errors;
  }
  
  categories.forEach((category, index) => {
    if (!category.category_unique_identifier) {
      errors.push(`Category ${index}: Missing category_unique_identifier`);
    }
    
    if (!category.category_names || typeof category.category_names !== 'object') {
      errors.push(`Category ${index}: Missing or invalid category_names`);
    } else {
      const hasValidName = Object.values(category.category_names).some(
        name => name && typeof name === 'string' && name.trim().length > 0
      );
      if (!hasValidName) {
        errors.push(`Category ${index}: No valid category names found`);
      }
    }
    
    if (category.category_type && !['drink', 'food', 'service', 'other'].includes(category.category_type)) {
      errors.push(`Category ${index}: Invalid category_type '${category.category_type}'`);
    }
  });
  
  return errors;
}

/**
 * Get categories that are actually used by items
 * @param {Array} categories - All categories
 * @param {Array} items - All items
 * @returns {Array} Used categories
 */
function getUsedCategories(categories, items) {
  if (!items || !Array.isArray(items)) {
    return categories || [];
  }
  
  const usedCategoryIds = new Set(
    items.map(item => item.associated_category_unique_identifier)
  );
  
  return (categories || []).filter(
    category => usedCategoryIds.has(category.category_unique_identifier)
  );
}

module.exports = {
  convertCategoriesToWarengruppen,
  validateCategoriesForWarengruppen,
  getUsedCategories
};