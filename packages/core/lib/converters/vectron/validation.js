/**
 * Vectron Output Validation
 * 
 * Validates Vectron import format compliance
 * See VECTRON_CONVERTER_PLAN.md section 5 for details
 * 
 * @module VectronValidation
 */

const { isValidVectronText, encodeToWindows1252 } = require('./utils/encoding');

/**
 * Validate complete Vectron output
 * @param {string} vectronOutput - Complete Vectron import content
 * @param {Object} options - Validation options
 * @returns {Object} Validation result
 */
function validateVectronOutput(vectronOutput, options = {}) {
  const errors = [];
  const warnings = [];
  const lines = vectronOutput.split('\r\n').filter(line => line.length > 0);
  
  if (lines.length === 0) {
    errors.push('Output is empty');
    return { isValid: false, errors, warnings };
  }
  
  // Validate header line
  const headerValidation = validateHeaderLine(lines[0]);
  errors.push(...headerValidation.errors);
  warnings.push(...headerValidation.warnings);
  
  // Validate all lines
  lines.forEach((line, index) => {
    const lineValidation = validateSingleLine(line, index + 1, options);
    errors.push(...lineValidation.errors);
    warnings.push(...lineValidation.warnings);
  });
  
  // Check for structural issues
  const structuralValidation = validateStructure(lines);
  errors.push(...structuralValidation.errors);
  warnings.push(...structuralValidation.warnings);
  
  const isValid = errors.length === 0 && (options.warningsAsErrors ? warnings.length === 0 : true);
  
  return {
    isValid,
    errors,
    warnings,
    lineCount: lines.length,
    stats: generateStats(lines)
  };
}

/**
 * Validate header line (LineType 100)
 * @param {string} headerLine - Header line
 * @returns {Object} Validation result
 */
function validateHeaderLine(headerLine) {
  const errors = [];
  const warnings = [];
  
  if (!headerLine.startsWith('100,0,')) {
    errors.push('Header line must start with "100,0,"');
    return { errors, warnings };
  }
  
  // Parse header fields
  const parts = headerLine.split(',');
  if (parts.length < 3) {
    errors.push('Header line has insufficient parts');
    return { errors, warnings };
  }
  
  // Check for required fields
  const fieldString = headerLine.substring(6); // Remove "100,0,"
  const fields = fieldString.split(';').filter(f => f.length > 0);
  
  const requiredFields = ['1', '10', '24', '51'];
  const foundFields = new Set();
  
  fields.forEach(field => {
    const [fieldId] = field.split(',');
    foundFields.add(fieldId);
  });
  
  requiredFields.forEach(reqField => {
    if (!foundFields.has(reqField)) {
      errors.push(`Header missing required field ${reqField}`);
    }
  });
  
  return { errors, warnings };
}

/**
 * Validate single line
 * @param {string} line - Line to validate
 * @param {number} lineNumber - Line number
 * @param {Object} options - Validation options
 * @returns {Object} Validation result
 */
function validateSingleLine(line, lineNumber, options = {}) {
  const errors = [];
  const warnings = [];
  const maxLength = options.maxLineLength || 250;
  
  // Check line length
  if (line.length > maxLength) {
    errors.push(`Line ${lineNumber}: Exceeds maximum length of ${maxLength} characters (${line.length})`);
  }
  
  // Check line ending
  if (!line.endsWith('\\r\\n') && lineNumber > 1) {
    warnings.push(`Line ${lineNumber}: Should end with \\r\\n`);
  }
  
  // Check basic format
  if (!line.match(/^\d+,/)) {
    errors.push(`Line ${lineNumber}: Must start with LineType number followed by comma`);
  }
  
  // Check encoding compatibility
  try {
    encodeToWindows1252(line);
  } catch (error) {
    errors.push(`Line ${lineNumber}: Contains characters not compatible with Windows-1252`);
  }
  
  // Validate specific line types
  const lineType = line.split(',')[0];
  switch (lineType) {
    case '100':
      // Header validation already done
      break;
    case '101':
      const pluValidation = validatePLULine(line, lineNumber);
      errors.push(...pluValidation.errors);
      warnings.push(...pluValidation.warnings);
      break;
    case '102':
      const wgValidation = validateWarengruppenLine(line, lineNumber);
      errors.push(...wgValidation.errors);
      warnings.push(...wgValidation.warnings);
      break;
    case '152':
      const awValidation = validateAuswahlfensterLine(line, lineNumber);
      errors.push(...awValidation.errors);
      warnings.push(...awValidation.warnings);
      break;
    default:
      warnings.push(`Line ${lineNumber}: Unknown LineType ${lineType}`);
  }
  
  return { errors, warnings };
}

/**
 * Validate PLU line (LineType 101)
 * @param {string} line - PLU line
 * @param {number} lineNumber - Line number
 * @returns {Object} Validation result
 */
function validatePLULine(line, lineNumber) {
  const errors = [];
  const warnings = [];
  
  const parts = line.split(',');
  if (parts.length < 3) {
    errors.push(`Line ${lineNumber}: PLU line must have at least LineType, RecordId, and fields`);
    return { errors, warnings };
  }
  
  const pluNumber = parseInt(parts[1]);
  if (isNaN(pluNumber) || pluNumber < 1) {
    errors.push(`Line ${lineNumber}: Invalid PLU number '${parts[1]}'`);
  }
  
  // Check for required PLU fields
  const fieldString = parts.slice(2).join(',');
  const hasName = fieldString.includes('101,TX:');
  const hasPrice = fieldString.includes('201,VA:');
  
  if (!hasName) {
    warnings.push(`Line ${lineNumber}: PLU missing name field (101,TX:)`);
  }
  
  if (!hasPrice) {
    warnings.push(`Line ${lineNumber}: PLU missing price field (201,VA:)`);
  }
  
  return { errors, warnings };
}

/**
 * Validate Warengruppen line (LineType 102)
 * @param {string} line - Warengruppen line
 * @param {number} lineNumber - Line number
 * @returns {Object} Validation result
 */
function validateWarengruppenLine(line, lineNumber) {
  const errors = [];
  const warnings = [];
  
  const parts = line.split(',');
  if (parts.length < 3) {
    errors.push(`Line ${lineNumber}: Warengruppen line must have at least LineType, RecordId, and fields`);
    return { errors, warnings };
  }
  
  const wgNumber = parseInt(parts[1]);
  if (isNaN(wgNumber) || wgNumber < 1) {
    errors.push(`Line ${lineNumber}: Invalid Warengruppe number '${parts[1]}'`);
  }
  
  // Check for required WG fields
  const fieldString = parts.slice(2).join(',');
  const hasName = fieldString.includes('101,TX:');
  
  if (!hasName) {
    warnings.push(`Line ${lineNumber}: Warengruppe missing name field (101,TX:)`);
  }
  
  return { errors, warnings };
}

/**
 * Validate Auswahlfenster line (LineType 152)
 * @param {string} line - Auswahlfenster line
 * @param {number} lineNumber - Line number
 * @returns {Object} Validation result
 */
function validateAuswahlfensterLine(line, lineNumber) {
  const errors = [];
  const warnings = [];
  
  const parts = line.split(',');
  if (parts.length < 3) {
    errors.push(`Line ${lineNumber}: Auswahlfenster line must have at least LineType, RecordId, and fields`);
    return { errors, warnings };
  }
  
  const awNumber = parseInt(parts[1]);
  if (isNaN(awNumber) || awNumber < 1) {
    errors.push(`Line ${lineNumber}: Invalid Auswahlfenster number '${parts[1]}'`);
  }
  
  return { errors, warnings };
}

/**
 * Validate overall structure
 * @param {Array} lines - All lines
 * @returns {Object} Validation result
 */
function validateStructure(lines) {
  const errors = [];
  const warnings = [];
  
  // Must start with header
  if (!lines[0]?.startsWith('100,')) {
    errors.push('File must start with header line (LineType 100)');
  }
  
  // Check for duplicate PLU numbers
  const pluNumbers = new Set();
  const wgNumbers = new Set();
  
  lines.forEach((line, index) => {
    const parts = line.split(',');
    const lineType = parts[0];
    const recordId = parts[1];
    
    if (lineType === '101') {
      if (pluNumbers.has(recordId)) {
        errors.push(`Duplicate PLU number ${recordId} found`);
      }
      pluNumbers.add(recordId);
    } else if (lineType === '102') {
      if (wgNumbers.has(recordId)) {
        errors.push(`Duplicate Warengruppe number ${recordId} found`);
      }
      wgNumbers.add(recordId);
    }
  });
  
  return { errors, warnings };
}

/**
 * Generate statistics about the output
 * @param {Array} lines - All lines
 * @returns {Object} Statistics
 */
function generateStats(lines) {
  const stats = {
    totalLines: lines.length,
    headerLines: 0,
    pluLines: 0,
    warengruppenLines: 0,
    auswahlfensterLines: 0,
    otherLines: 0,
    maxLineLength: 0,
    avgLineLength: 0
  };
  
  let totalLength = 0;
  
  lines.forEach(line => {
    const lineType = line.split(',')[0];
    const length = line.length;
    
    totalLength += length;
    stats.maxLineLength = Math.max(stats.maxLineLength, length);
    
    switch (lineType) {
      case '100':
        stats.headerLines++;
        break;
      case '101':
        stats.pluLines++;
        break;
      case '102':
        stats.warengruppenLines++;
        break;
      case '152':
        stats.auswahlfensterLines++;
        break;
      default:
        stats.otherLines++;
    }
  });
  
  stats.avgLineLength = Math.round(totalLength / lines.length);
  
  return stats;
}

/**
 * Validate OOP-POS-MDF input before conversion
 * @param {Object} oopData - OOP-POS-MDF data
 * @returns {Object} Validation result
 */
function validateOOPInput(oopData) {
  const errors = [];
  const warnings = [];
  
  if (!oopData) {
    errors.push('Input data is required');
    return { isValid: false, errors, warnings };
  }
  
  if (!oopData.company_details) {
    errors.push('Missing company_details');
  }
  
  if (!oopData.company_details?.branches?.length) {
    errors.push('No branches defined');
  }
  
  const branch = oopData.company_details?.branches?.[0];
  if (branch && !branch.point_of_sale_devices?.length) {
    errors.push('No POS devices defined in first branch');
  }
  
  const posDevice = branch?.point_of_sale_devices?.[0];
  if (posDevice) {
    if (!posDevice.categories_for_this_pos?.length) {
      warnings.push('No categories defined for POS device');
    }
    
    if (!posDevice.items_for_this_pos?.length) {
      warnings.push('No items defined for POS device');
    }
  }
  
  const isValid = errors.length === 0;
  
  return { isValid, errors, warnings };
}

module.exports = {
  validateVectronOutput,
  validateOOPInput,
  validateSingleLine,
  generateStats
};