/**
 * Vectron Field Mapping System
 * 
 * Maps OOP-POS-MDF fields to Vectron field format
 * See VECTRON_CONVERTER_PLAN.md section 3.5 for details
 * 
 * @module VectronFieldMapper
 */

const { PLUNumberGenerator, WarengruppenNumberGenerator } = require('./utils/numbering');

class VectronFieldMapper {
  constructor(options = {}) {
    // Tax rate mapping: OOP-POS-MDF percentage → Vectron tax rate number
    this.taxRateMapping = new Map([
      [7, 2],    // 7% → Tax rate 2
      [19, 1],   // 19% → Tax rate 1
      [0, 3]     // 0% → Tax rate 3
    ]);
    
    // Initialize numbering generators
    this.pluGenerator = new PLUNumberGenerator(options.pluNumbering);
    this.wgGenerator = new WarengruppenNumberGenerator(options.warengruppenNumbering);
    
    // Category type to main group mapping
    this.categoryTypeMapping = new Map([
      ['drink', 1],   // Beverages → Main group 1
      ['food', 2],    // Food → Main group 2
      ['service', 3], // Services → Main group 3
      ['other', 4]    // Other → Main group 4
    ]);
  }
  
  /**
   * Map OOP-POS-MDF tax rate to Vectron tax rate number
   * @param {number} oopTaxRate - Tax rate percentage from OOP-POS-MDF
   * @returns {number} Vectron tax rate number
   */
  mapTaxRate(oopTaxRate) {
    return this.taxRateMapping.get(oopTaxRate) || 1; // Default to tax rate 1 (19%)
  }
  
  /**
   * Generate PLU number for item
   * @param {number} categoryId - Category identifier
   * @param {number} itemIndex - Item index within category
   * @returns {number} PLU number
   */
  generatePLUNumber(categoryId, itemIndex) {
    return this.pluGenerator.calculatePLUNumber(categoryId, itemIndex);
  }
  
  /**
   * Generate Warengruppe number for category
   * @param {number} categoryId - Category identifier
   * @param {string} categoryName - Category name for default mapping
   * @returns {number} Warengruppe number
   */
  generateWarengruppeNumber(categoryId, categoryName = '') {
    return this.wgGenerator.generateWarengruppeNumber(categoryId, categoryName);
  }
  
  /**
   * Map category type to main group
   * @param {string} categoryType - Category type from OOP-POS-MDF
   * @returns {number} Main group number
   */
  mapCategoryTypeToMainGroup(categoryType) {
    return this.categoryTypeMapping.get(categoryType) || 1;
  }
  
  /**
   * Extract tax rate from global definitions
   * @param {number} taxRateId - Tax rate unique identifier
   * @param {Array} globalTaxRates - Global tax rate definitions
   * @returns {number} Tax rate percentage
   */
  extractTaxRatePercentage(taxRateId, globalTaxRates) {
    const taxRate = globalTaxRates?.find(rate => rate.tax_rate_unique_identifier === taxRateId);
    return taxRate ? taxRate.rate_percentage : 19; // Default to 19%
  }
  
  /**
   * Get category by ID from categories array
   * @param {number} categoryId - Category identifier
   * @param {Array} categories - Categories array
   * @returns {Object|null} Category object or null
   */
  getCategoryById(categoryId, categories) {
    return categories?.find(cat => cat.category_unique_identifier === categoryId) || null;
  }
  
  /**
   * Reset all numbering generators
   */
  reset() {
    this.pluGenerator.reset();
    this.wgGenerator.reset();
  }
  
  /**
   * Map printer type to Vectron printer number
   * @param {string} printerType - Printer type from OOP-POS-MDF
   * @returns {number} Vectron printer number
   */
  mapPrinterType(printerType) {
    const printerMapping = new Map([
      ['RECEIPT', 1],     // Receipt printer
      ['KITCHEN', 2],     // Kitchen printer
      ['BAR', 3],         // Bar printer
      ['LABEL', 4],       // Label printer
      ['CUSTOMER_DISPLAY', 5] // Customer display
    ]);
    
    return printerMapping.get(printerType?.toUpperCase()) || 1;
  }
  
  /**
   * Map payment method type to Vectron payment type
   * @param {string} paymentType - Payment method type from OOP-POS-MDF
   * @returns {number} Vectron payment type
   */
  mapPaymentMethodType(paymentType) {
    const paymentMapping = new Map([
      ['CASH', 1],
      ['CARD', 2],
      ['CREDIT_CARD', 3],
      ['DEBIT_CARD', 4],
      ['MOBILE_PAYMENT', 5],
      ['VOUCHER', 6],
      ['LOYALTY_POINTS', 7]
    ]);
    
    return paymentMapping.get(paymentType?.toUpperCase()) || 1;
  }
  
  /**
   * Generate complex field mapping for advanced features
   * @param {string} fieldPath - Dot notation field path
   * @param {*} value - Field value
   * @param {Object} context - Additional context
   * @returns {Object} Field mapping result
   */
  mapComplexField(fieldPath, value, context = {}) {
    const fieldMappings = {
      // Item specific mappings
      'item.allergens': {
        vectronField: 801,
        transform: (allergens) => this.encodeAllergens(allergens)
      },
      'item.nutrition.calories': {
        vectronField: 802,
        transform: (calories) => parseInt(calories) || 0
      },
      'item.volume_ml': {
        vectronField: 803,
        transform: (volume) => parseFloat(volume) || 0
      }
    };
    
    const mapping = fieldMappings[fieldPath];
    if (mapping) {
      return {
        fieldId: mapping.vectronField,
        value: mapping.transform(value),
        type: this.inferFieldType(mapping.vectronField, value)
      };
    }
    
    return null;
  }
  
  /**
   * Encode allergens as bit field
   * @param {Array} allergens - Array of allergen strings
   * @returns {number} Encoded allergen bit field
   */
  encodeAllergens(allergens) {
    if (!Array.isArray(allergens)) return 0;
    
    const allergenMap = {
      'gluten': 1,
      'dairy': 2,
      'eggs': 4,
      'nuts': 8,
      'soy': 16,
      'fish': 32,
      'shellfish': 64,
      'sesame': 128
    };
    
    let encoded = 0;
    allergens.forEach(allergen => {
      const bit = allergenMap[allergen.toLowerCase()];
      if (bit) encoded |= bit;
    });
    
    return encoded;
  }
  
  /**
   * Infer Vectron field type from field ID and value
   * @param {number} fieldId - Vectron field ID
   * @param {*} value - Field value
   * @returns {string} Field type (TX, NR, VA, INT)
   */
  inferFieldType(fieldId, value) {
    // Text fields (100-199)
    if (fieldId >= 100 && fieldId <= 199) {
      return 'TX';
    }
    
    // Price/value fields (200-299)
    if (fieldId >= 200 && fieldId <= 299) {
      return typeof value === 'number' && value % 1 !== 0 ? 'VA' : 'NR';
    }
    
    // Default to number
    return 'NR';
  }
  
  /**
   * Get statistics about generated numbers
   * @returns {Object} Statistics object
   */
  getStats() {
    return {
      pluCount: this.pluGenerator.usedNumbers.size,
      categoryCount: this.wgGenerator.categoryNumberMap.size,
      usedPLUNumbers: Array.from(this.pluGenerator.usedNumbers).sort((a, b) => a - b),
      usedWGNumbers: Array.from(this.wgGenerator.usedNumbers).sort((a, b) => a - b),
      mappingCapabilities: {
        taxRates: this.taxRateMapping.size,
        categoryTypes: this.categoryTypeMapping.size,
        supportedBusinessTypes: ['restaurant', 'bar', 'cafe', 'retail'],
        complexFields: 3, // Number of complex field mappings supported
        extendedFeatures: ['allergens', 'nutrition', 'volume']
      }
    };
  }
}

module.exports = VectronFieldMapper;