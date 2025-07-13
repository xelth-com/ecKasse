/**
 * Vectron PLU Converter (LineType 101)
 * 
 * Converts OOP-POS-MDF items to Vectron PLU format
 * See VECTRON_CONVERTER_PLAN.md section 3.2 for details
 * 
 * @module VectronPLUConverter
 */

const VectronLineFormatter = require('./utils/formatter');
const { sanitizeText } = require('./utils/encoding');
const VectronFieldMapper = require('./mapping');

/**
 * Convert OOP-POS-MDF items to Vectron PLU lines
 * @param {Array} items - Items from OOP-POS-MDF
 * @param {Array} categories - Categories from OOP-POS-MDF
 * @param {Object} globalConfig - Global configuration (tax rates, etc.)
 * @param {Object} options - Conversion options
 * @returns {Array} Array of PLU lines
 */
function convertItemsToPLUs(items, categories, globalConfig, options = {}) {
  if (!items || !Array.isArray(items)) {
    return [];
  }
  
  const formatter = new VectronLineFormatter();
  const mapper = new VectronFieldMapper(options);
  const defaultLanguage = options.defaultLanguage || 'de';
  const pluLines = [];
  
  // Group items by category for proper numbering
  const itemsByCategory = new Map();
  items.forEach(item => {
    const categoryId = item.associated_category_unique_identifier;
    if (!itemsByCategory.has(categoryId)) {
      itemsByCategory.set(categoryId, []);
    }
    itemsByCategory.get(categoryId).push(item);
  });
  
  // Convert each item to PLU
  for (const [categoryId, categoryItems] of itemsByCategory) {
    const category = mapper.getCategoryById(categoryId, categories);
    if (!category) {
      console.warn(`Warning: Category ${categoryId} not found, skipping items`);
      continue;
    }
    
    categoryItems.forEach((item, itemIndex) => {
      try {
        const pluLine = convertSingleItemToPLU(
          item, 
          category, 
          itemIndex, 
          globalConfig, 
          mapper, 
          formatter, 
          defaultLanguage
        );
        if (pluLine) {
          pluLines.push(pluLine);
        }
      } catch (error) {
        console.error(`Error converting item ${item.item_unique_identifier}: ${error.message}`);
        if (options.strictMode) {
          throw error;
        }
      }
    });
  }
  
  return pluLines;
}

/**
 * Convert single item to PLU line
 * @param {Object} item - Item from OOP-POS-MDF
 * @param {Object} category - Category from OOP-POS-MDF
 * @param {number} itemIndex - Item index within category
 * @param {Object} globalConfig - Global configuration
 * @param {VectronFieldMapper} mapper - Field mapper
 * @param {VectronLineFormatter} formatter - Line formatter
 * @param {string} defaultLanguage - Default language
 * @returns {string} PLU line
 */
function convertSingleItemToPLU(item, category, itemIndex, globalConfig, mapper, formatter, defaultLanguage) {
  // Generate PLU number
  const pluNumber = mapper.generatePLUNumber(
    category.category_unique_identifier, 
    itemIndex
  );
  
  // Prepare field array
  const fields = [];
  
  // Names (101-199)
  const menuName = getLocalizedText(item.display_names?.menu, defaultLanguage);
  const buttonName = getLocalizedText(item.display_names?.button, defaultLanguage);
  
  if (menuName) {
    fields.push({
      id: 101,
      type: 'TX',
      value: sanitizeText(menuName, 40)
    });
  }
  
  if (buttonName && buttonName !== menuName) {
    fields.push({
      id: 102,
      type: 'TX',
      value: sanitizeText(buttonName, 20)
    });
  }
  
  // Price (201-299)
  if (item.item_price_value !== undefined) {
    fields.push({
      id: 201,
      type: 'VA',
      value: item.item_price_value
    });
  }
  
  // Category link (301)
  const warengruppe = mapper.generateWarengruppeNumber(
    category.category_unique_identifier,
    getLocalizedText(category.category_names, defaultLanguage)
  );
  fields.push({
    id: 301,
    type: 'NR',
    value: warengruppe
  });
  
  // Main group (311)
  const mainGroup = category.default_linked_main_group_unique_identifier || 
                   mapper.mapCategoryTypeToMainGroup(category.category_type);
  fields.push({
    id: 311,
    type: 'NR',
    value: mainGroup
  });
  
  // Tax rate (401)
  const taxRateId = getTaxRateForCategory(category, globalConfig);
  const taxRatePercentage = mapper.extractTaxRatePercentage(taxRateId, globalConfig.tax_rates_definitions);
  const vectronTaxRate = mapper.mapTaxRate(taxRatePercentage);
  fields.push({
    id: 401,
    type: 'NR',
    value: vectronTaxRate
  });
  
  // Flags
  // No sale flag (1003)
  const canSell = item.item_flags?.is_sellable !== false;
  fields.push({
    id: 1003,
    type: 'NR',
    value: canSell ? 0 : 1
  });
  
  // Active flag (9001)
  fields.push({
    id: 9001,
    type: 'NR',
    value: 0  // Always active
  });
  
  // Negative flag (901)
  const isNegative = item.item_flags?.has_negative_price === true;
  fields.push({
    id: 901,
    type: 'NR',
    value: isNegative ? 1 : 0
  });
  
  return formatter.formatPLULine(pluNumber, fields);
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
 * Get tax rate for category
 * @param {Object} category - Category object
 * @param {Object} globalConfig - Global configuration
 * @returns {number} Tax rate identifier
 */
function getTaxRateForCategory(category, globalConfig) {
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
 * Validate items for PLU conversion
 * @param {Array} items - Items to validate
 * @param {Array} categories - Categories to validate against
 * @returns {Array} Array of validation errors
 */
function validateItemsForPLU(items, categories) {
  const errors = [];
  
  if (!items || !Array.isArray(items)) {
    errors.push('Items must be an array');
    return errors;
  }
  
  if (!categories || !Array.isArray(categories)) {
    errors.push('Categories must be an array');
    return errors;
  }
  
  items.forEach((item, index) => {
    if (!item.item_unique_identifier) {
      errors.push(`Item ${index}: Missing item_unique_identifier`);
    }
    
    if (!item.associated_category_unique_identifier) {
      errors.push(`Item ${index}: Missing associated_category_unique_identifier`);
    }
    
    if (item.item_price_value === undefined || item.item_price_value < 0) {
      errors.push(`Item ${index}: Invalid item_price_value`);
    }
    
    // Check if category exists
    const categoryExists = categories.find(
      cat => cat.category_unique_identifier === item.associated_category_unique_identifier
    );
    if (!categoryExists) {
      errors.push(`Item ${index}: Referenced category ${item.associated_category_unique_identifier} not found`);
    }
  });
  
  return errors;
}

module.exports = {
  convertItemsToPLUs,
  validateItemsForPLU
};