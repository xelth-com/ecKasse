/**
 * Vectron Line Formatting Utilities
 * 
 * Formats data into Vectron import line format
 * See VECTRON_CONVERTER_PLAN.md section 3.7 for details
 * 
 * @module VectronLineFormatter
 */

const { escapeVectronText } = require('./encoding');

class VectronLineFormatter {
  /**
   * Format header line (LineType 100)
   * @param {number} kassennummer - Cash register number
   * @param {string} mode - Import mode (A=Add, O=Overwrite, R=Replace)
   * @param {Object} options - Additional options
   * @returns {string} Formatted header line
   */
  formatHeaderLine(kassennummer, mode = 'A', options = {}) {
    const fields = [
      '1,1',                    // Interface version
      `10,${kassennummer}`,     // Cash register number
      `24,${mode}`,             // Import mode
      '51,1'                    // Character encoding (ANSI)
    ];
    
    // Add optional fields if provided
    if (options.date) {
      fields.push(`2,${options.date}`);
    }
    if (options.time) {
      fields.push(`3,${options.time}`);
    }
    if (options.programName) {
      fields.push(`5,TX:"${escapeVectronText(options.programName)}"`);
    }
    if (options.kasseName) {
      fields.push(`11,TX:"${escapeVectronText(options.kasseName)}"`);
    }
    
    return `100,0,${fields.join(';')};\r\n`;
  }
  
  /**
   * Format PLU line (LineType 101)
   * @param {number} pluNumber - PLU number
   * @param {Array} fields - Field definitions
   * @returns {string} Formatted PLU line
   */
  formatPLULine(pluNumber, fields) {
    const fieldStrings = fields.map(field => {
      if (field.type === 'TX') {
        return `${field.id},TX:"${escapeVectronText(field.value)}"`;
      } else if (field.type === 'VA') {
        return `${field.id},VA:${parseFloat(field.value).toFixed(2)}`;
      } else if (field.type === 'NR') {
        return `${field.id},NR:${field.value}`;
      } else if (field.type === 'INT') {
        return `${field.id},INT:${field.value}`;
      } else {
        return `${field.id},${field.type}:${field.value}`;
      }
    }).join(';');
    
    return `101,${pluNumber},${fieldStrings};\r\n`;
  }
  
  /**
   * Format Warengruppen line (LineType 102)
   * @param {number} wgNumber - Warengruppe number
   * @param {Array} fields - Field definitions
   * @returns {string} Formatted Warengruppen line
   */
  formatWarengruppenLine(wgNumber, fields) {
    const fieldStrings = fields.map(field => {
      if (field.type === 'TX') {
        return `${field.id},TX:"${escapeVectronText(field.value)}"`;
      } else if (field.type === 'NR') {
        return `${field.id},NR:${field.value}`;
      } else {
        return `${field.id},${field.type}:${field.value}`;
      }
    }).join(';');
    
    return `102,${wgNumber},${fieldStrings};\r\n`;
  }
  
  /**
   * Format Auswahlfenster line (LineType 152)
   * @param {number} windowNumber - Window number
   * @param {Array} fields - Field definitions
   * @returns {string} Formatted Auswahlfenster line
   */
  formatAuswahlfensterLine(windowNumber, fields) {
    const fieldStrings = fields.map(field => {
      if (field.type === 'TX') {
        return `${field.id},TX:"${escapeVectronText(field.value)}"`;
      } else if (field.type === 'NR') {
        return `${field.id},NR:${field.value}`;
      } else if (field.type === 'INT') {
        return `${field.id},INT:${field.value}`;
      } else {
        return `${field.id},${field.type}:${field.value}`;
      }
    }).join(';');
    
    return `152,${windowNumber},${fieldStrings};\r\n`;
  }
  
  /**
   * Validate line length
   * @param {string} line - Line to validate
   * @param {number} maxLength - Maximum allowed length
   * @returns {boolean} True if valid
   */
  validateLineLength(line, maxLength = 250) {
    return line.length <= maxLength;
  }
}

module.exports = VectronLineFormatter;