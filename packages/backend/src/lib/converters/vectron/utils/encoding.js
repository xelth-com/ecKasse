/**
 * Vectron Encoding Utilities
 * 
 * Windows-1252 encoding and text sanitization for Vectron format
 * See VECTRON_CONVERTER_PLAN.md section 3.6 for details
 * 
 * @module VectronEncodingUtils
 */

const iconv = require('iconv-lite');

/**
 * Convert UTF-8 text to Windows-1252 encoding
 * @param {string} text - Text to encode
 * @returns {Buffer} Windows-1252 encoded buffer
 */
function encodeToWindows1252(text) {
  return iconv.encode(text, 'win1252');
}

/**
 * Clean and truncate text for Vectron compatibility
 * @param {string} text - Text to sanitize
 * @param {number} maxLength - Maximum length (default: 40)
 * @returns {string} Sanitized text
 */
function sanitizeText(text, maxLength = 40) {
  if (!text || typeof text !== 'string') {
    return '';
  }
  
  return text
    .replace(/[^\x20-\xFF]/g, '') // Remove invalid characters for Windows-1252
    .replace(/[\r\n\t]/g, ' ')    // Replace line breaks with spaces
    .replace(/\s+/g, ' ')        // Normalize whitespace
    .substring(0, maxLength)
    .trim();
}

/**
 * Escape quotes for TX field values in Vectron format
 * @param {string} text - Text to escape
 * @returns {string} Escaped text
 */
function escapeVectronText(text) {
  if (!text || typeof text !== 'string') {
    return '';
  }
  
  // Escape double quotes by doubling them
  return text.replace(/"/g, '""');
}

/**
 * Validate text for Vectron compatibility
 * @param {string} text - Text to validate
 * @returns {boolean} True if valid
 */
function isValidVectronText(text) {
  if (!text || typeof text !== 'string') {
    return true; // Empty text is valid
  }
  
  try {
    // Check if text can be encoded to Windows-1252
    iconv.encode(text, 'win1252');
    return true;
  } catch (error) {
    return false;
  }
}

module.exports = {
  encodeToWindows1252,
  sanitizeText,
  escapeVectronText,
  isValidVectronText
};