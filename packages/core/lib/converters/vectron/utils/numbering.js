/**
 * Vectron Numbering System Utilities
 * 
 * PLU and Warengruppen numbering system for Vectron format
 * See VECTRON_CONVERTER_PLAN.md for numbering details
 * 
 * @module VectronNumberingUtils
 */

class PLUNumberGenerator {
  constructor(options = {}) {
    this.startNumber = options.startNumber || 1000;
    this.blockSize = options.blockSize || 100;
    this.reserveBlocks = options.reserveBlocks || 10;
    this.categoryIndexMap = new Map();
    this.usedNumbers = new Set();
  }
  
  /**
   * Calculate PLU number for item
   * @param {number} categoryId - Category identifier
   * @param {number} itemIndex - Item index within category
   * @returns {number} PLU number
   */
  calculatePLUNumber(categoryId, itemIndex) {
    let categoryIndex;
    
    if (this.categoryIndexMap.has(categoryId)) {
      categoryIndex = this.categoryIndexMap.get(categoryId);
    } else {
      categoryIndex = this.categoryIndexMap.size;
      this.categoryIndexMap.set(categoryId, categoryIndex);
    }
    
    const pluNumber = this.startNumber + (categoryIndex * this.blockSize) + itemIndex + 1;
    this.usedNumbers.add(pluNumber);
    
    return pluNumber;
  }
  
  /**
   * Get next available PLU number
   * @returns {number} Next available PLU number
   */
  getNextAvailablePLU() {
    let candidate = this.startNumber;
    while (this.usedNumbers.has(candidate)) {
      candidate++;
    }
    this.usedNumbers.add(candidate);
    return candidate;
  }
  
  /**
   * Reset numbering system
   */
  reset() {
    this.categoryIndexMap.clear();
    this.usedNumbers.clear();
  }
}

class WarengruppenNumberGenerator {
  constructor(options = {}) {
    this.startNumber = options.startNumber || 900;
    this.useDefaults = options.useDefaults !== false;
    this.defaultMappings = options.defaultMappings || {
      'SPEISEN': 941,
      'GETRÄNKE': 951,
      'GETRÄNKE_REDUZIERT': 953,
      'FOOD': 941,
      'DRINKS': 951,
      'BEVERAGES': 951
    };
    this.categoryNumberMap = new Map();
    this.usedNumbers = new Set();
    
    // Reserve default numbers
    if (this.useDefaults) {
      Object.values(this.defaultMappings).forEach(num => {
        this.usedNumbers.add(num);
      });
    }
  }
  
  /**
   * Generate Warengruppe number for category
   * @param {number} categoryId - Category identifier
   * @param {string} categoryName - Category name for default mapping
   * @returns {number} Warengruppe number
   */
  generateWarengruppeNumber(categoryId, categoryName = '') {
    if (this.categoryNumberMap.has(categoryId)) {
      return this.categoryNumberMap.get(categoryId);
    }
    
    let wgNumber;
    
    // Try default mapping based on name
    if (this.useDefaults && categoryName) {
      const normalizedName = categoryName.toUpperCase();
      for (const [key, value] of Object.entries(this.defaultMappings)) {
        if (normalizedName.includes(key)) {
          wgNumber = value;
          break;
        }
      }
    }
    
    // If no default mapping found, use next available number
    if (!wgNumber) {
      wgNumber = this.getNextAvailableNumber();
    }
    
    this.categoryNumberMap.set(categoryId, wgNumber);
    this.usedNumbers.add(wgNumber);
    
    return wgNumber;
  }
  
  /**
   * Get next available Warengruppe number
   * @returns {number} Next available number
   */
  getNextAvailableNumber() {
    let candidate = this.startNumber;
    while (this.usedNumbers.has(candidate)) {
      candidate++;
    }
    return candidate;
  }
  
  /**
   * Reset numbering system
   */
  reset() {
    this.categoryNumberMap.clear();
    this.usedNumbers.clear();
    
    // Re-reserve default numbers
    if (this.useDefaults) {
      Object.values(this.defaultMappings).forEach(num => {
        this.usedNumbers.add(num);
      });
    }
  }
}

// Standard Warengruppen numbers from Vectron defaults
const STANDARD_WARENGRUPPEN = {
  941: "SPEISEN 19% FESTPREIS",
  951: "GETRÄNKE 19% FESTPREIS", 
  953: "GETRÄNKE 7% FESTPREIS",
  940: "SPEISEN OFFEN",
  950: "GETRÄNKE OFFEN"
};

module.exports = {
  PLUNumberGenerator,
  WarengruppenNumberGenerator,
  STANDARD_WARENGRUPPEN
};