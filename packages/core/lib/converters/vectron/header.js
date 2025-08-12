/**
 * Vectron Header Line Generator (LineType 100)
 * 
 * Generates header lines for Vectron Commander import files
 * See VECTRON_CONVERTER_PLAN.md section 3.1 for details
 * 
 * @module VectronHeaderGenerator
 */

const VectronLineFormatter = require('./utils/formatter');
const { sanitizeText } = require('./utils/encoding');

/**
 * Generate header line for Vectron import
 * @param {Object} company - Company details from OOP-POS-MDF
 * @param {Object} branch - Branch details from OOP-POS-MDF
 * @param {Object} options - Additional options
 * @returns {string} Formatted header line
 */
function generateHeader(company, branch, options = {}) {
  const formatter = new VectronLineFormatter();
  
  // Extract cash register number from first POS device
  const posDevice = branch.point_of_sale_devices?.[0];
  if (!posDevice) {
    throw new Error('No POS devices found in branch');
  }
  
  const kassennummer = options.kassennummer || posDevice.pos_device_external_number || 1;
  const importMode = options.importMode || 'A';
  
  // Prepare optional header fields
  const headerOptions = {};
  
  if (options.includeTimestamp !== false) {
    const now = new Date();
    headerOptions.date = now.toISOString().split('T')[0].replace(/-/g, '');
    headerOptions.time = now.toTimeString().split(' ')[0].replace(/:/g, '');
  }
  
  if (options.programName) {
    headerOptions.programName = sanitizeText(options.programName, 20);
  } else {
    headerOptions.programName = 'eckasse-converter';
  }
  
  if (posDevice.pos_device_names) {
    const defaultLanguage = company.meta_information?.default_language || 'de';
    const kasseName = posDevice.pos_device_names[defaultLanguage] || 
                     posDevice.pos_device_names[Object.keys(posDevice.pos_device_names)[0]];
    if (kasseName) {
      headerOptions.kasseName = sanitizeText(kasseName, 30);
    }
  }
  
  return formatter.formatHeaderLine(kassennummer, importMode, headerOptions);
}

/**
 * Validate header generation parameters
 * @param {Object} company - Company details
 * @param {Object} branch - Branch details
 * @returns {Array} Array of validation errors
 */
function validateHeaderParams(company, branch) {
  const errors = [];
  
  if (!company) {
    errors.push('Company details are required');
  }
  
  if (!branch) {
    errors.push('Branch details are required');
  }
  
  if (branch && (!branch.point_of_sale_devices || branch.point_of_sale_devices.length === 0)) {
    errors.push('At least one POS device is required in branch');
  }
  
  return errors;
}

module.exports = {
  generateHeader,
  validateHeaderParams
};