/**
 * Vectron Converter - Updated Implementation
 * 
 * Updated to use the new modular Vectron converter system
 * Legacy implementation backed up to vectron-legacy.js
 * 
 * @module VectronConverter
 */

const NewVectronConverter = require('./vectron/index');

class VectronConverter {
  /**
   * Convert OOP-POS-MDF v2.0.0 configuration to Vectron import format
   * @param {Object} oopPosMdfJson - OOP-POS-MDF v2.0.0 configuration
   * @param {Object} options - Conversion options
   * @returns {Buffer} Vectron import data in Windows-1252 encoding
   */
  convert(oopPosMdfJson, options = {}) {
    try {
      // Use new converter with default options
      const conversionOptions = {
        encoding: 'win1252',
        validateOutput: true,
        strictMode: false,
        ...options
      };
      
      const result = NewVectronConverter.convertToVectron(oopPosMdfJson, conversionOptions);
      
      if (!result.success) {
        throw new Error(result.error || 'Conversion failed');
      }
      
      // Return buffer for compatibility with existing CLI
      if (result.outputBuffer) {
        return result.outputBuffer;
      } else {
        // Fallback to encoding the string output
        const iconv = require('iconv-lite');
        return iconv.encode(result.output, 'win1252');
      }
      
    } catch (error) {
      console.error('Vectron conversion error:', error.message);
      throw error;
    }
  }
  
  /**
   * Convert with additional result information
   * @param {Object} oopPosMdfJson - OOP-POS-MDF v2.0.0 configuration
   * @param {Object} options - Conversion options
   * @returns {Object} Detailed conversion result
   */
  convertWithDetails(oopPosMdfJson, options = {}) {
    const conversionOptions = {
      encoding: 'win1252',
      validateOutput: true,
      strictMode: false,
      ...options
    };
    
    return NewVectronConverter.convertToVectron(oopPosMdfJson, conversionOptions);
  }
  
  /**
   * Convert and save to file
   * @param {Object} oopPosMdfJson - OOP-POS-MDF v2.0.0 configuration
   * @param {string} outputPath - Output file path
   * @param {Object} options - Conversion options
   * @returns {Object} Conversion result
   */
  convertToFile(oopPosMdfJson, outputPath, options = {}) {
    return NewVectronConverter.convertToVectronFile(oopPosMdfJson, outputPath, options);
  }
}

module.exports = VectronConverter;