/**
 * Main Vectron Converter Module
 * 
 * Converts OOP-POS-MDF v2.0.0 format to Vectron Commander import format
 * See VECTRON_CONVERTER_PLAN.md for detailed implementation plan
 * 
 * @module VectronConverter
 */

const { generateHeader } = require('./header');
const { convertItemsToPLUs } = require('./plu');
const { convertCategoriesToWarengruppen, getUsedCategories } = require('./warengruppen');
const { convertDisplayLayoutsToAuswahlfenster } = require('./auswahlfenster');
const { validateOOPInput, validateVectronOutput } = require('./validation');
const { encodeToWindows1252 } = require('./utils/encoding');
const { createMultilingualManager } = require('./utils/multilingual');
const { VectronConfigManager } = require('./config');

/**
 * Convert OOP-POS-MDF v2.0.0 to Vectron Commander import format
 * @param {Object} oopPosMdfData - OOP-POS-MDF v2.0.0 data
 * @param {Object} options - Conversion options
 * @returns {Object} Conversion result
 */
function convertToVectron(oopPosMdfData, options = {}) {
  // Initialize configuration manager
  const configManager = new VectronConfigManager();
  const conversionOptions = configManager.applyConfiguration({
    inputData: oopPosMdfData,
    ...options
  });
  
  // Validate configuration
  const configErrors = configManager.validateConfiguration(conversionOptions);
  if (configErrors.length > 0 && conversionOptions.validation.strictMode) {
    throw new Error(`Configuration validation failed: ${configErrors.join(', ')}`);
  }
  
  // Initialize multilingual manager
  const textManager = createMultilingualManager({
    defaultLanguage: conversionOptions.language.defaultLanguage,
    supportedLanguages: conversionOptions.language.supportedLanguages,
    fallbackLanguage: conversionOptions.language.fallbackLanguage,
    textLimits: conversionOptions.text.limits
  });
  
  // Validate input
  const inputValidation = validateOOPInput(oopPosMdfData);
  if (!inputValidation.isValid) {
    throw new Error(`Input validation failed: ${inputValidation.errors.join(', ')}`);
  }
  
  try {
    // Extract data structures
    const company = oopPosMdfData.company_details;
    const branch = company.branches[0];
    const posDevice = branch.point_of_sale_devices[0];
    const globalConfig = {
      ...company.global_configurations,
      default_linked_drink_tax_rate_unique_identifier: posDevice.pos_device_settings?.default_linked_drink_tax_rate_unique_identifier,
      default_linked_food_tax_rate_unique_identifier: posDevice.pos_device_settings?.default_linked_food_tax_rate_unique_identifier
    };
    
    const allCategories = posDevice.categories_for_this_pos || [];
    const allItems = posDevice.items_for_this_pos || [];
    const displays = posDevice.built_in_displays || [];
    
    // Only convert categories that are actually used by items
    const usedCategories = getUsedCategories(allCategories, allItems);
    
    // Generate Vectron lines
    const lines = [];
    const stats = {
      headerLines: 0,
      warengruppenLines: 0,
      pluLines: 0,
      auswahlfensterLines: 0
    };
    
    // 1. Header line (LineType 100)
    const headerLine = generateHeader(company, branch, conversionOptions);
    lines.push(headerLine);
    stats.headerLines++;
    
    // 2. Warengruppen lines (LineType 102)
    if (usedCategories.length > 0) {
      const wgLines = convertCategoriesToWarengruppen(
        usedCategories, 
        globalConfig, 
        conversionOptions
      );
      lines.push(...wgLines);
      stats.warengruppenLines = wgLines.length;
    }
    
    // 3. PLU lines (LineType 101)
    if (allItems.length > 0) {
      const pluLines = convertItemsToPLUs(
        allItems, 
        allCategories, 
        globalConfig, 
        conversionOptions
      );
      lines.push(...pluLines);
      stats.pluLines = pluLines.length;
    }
    
    // 4. Auswahlfenster lines (LineType 152) - Phase 2 feature
    if (conversionOptions.features.includeAuswahlfenster && displays.length > 0) {
      const awLines = convertDisplayLayoutsToAuswahlfenster(
        displays,
        allCategories,
        allItems,
        conversionOptions
      );
      lines.push(...awLines);
      stats.auswahlfensterLines = awLines.length;
    }
    
    // Join all lines
    const vectronContent = lines.join('');
    
    // Validate output if requested
    let validation = null;
    if (conversionOptions.validateOutput) {
      validation = validateVectronOutput(vectronContent, conversionOptions);
      if (!validation.isValid && conversionOptions.strictMode) {
        throw new Error(`Output validation failed: ${validation.errors.join(', ')}`);
      }
    }
    
    // Encode to Windows-1252 if requested
    let output = vectronContent;
    let outputBuffer = null;
    if (conversionOptions.encoding === 'win1252') {
      outputBuffer = encodeToWindows1252(vectronContent);
    }
    
    return {
      success: true,
      output: output,
      outputBuffer: outputBuffer,
      validation: validation,
      stats: {
        totalLines: lines.length,
        headerLines: stats.headerLines,
        warengruppenLines: stats.warengruppenLines,
        pluLines: stats.pluLines,
        auswahlfensterLines: stats.auswahlfensterLines,
        categoriesProcessed: usedCategories.length,
        itemsProcessed: allItems.length,
        displaysProcessed: displays.length,
        featuresUsed: {
          auswahlfenster: conversionOptions.features.includeAuswahlfenster,
          complexFields: conversionOptions.features.includeComplexFields,
          multiLanguage: conversionOptions.language.includeMultilingualFields,
          extendedValidation: conversionOptions.features.includeExtendedValidation
        }
      },
      metadata: {
        kassennummer: conversionOptions.kassennummer || posDevice.pos_device_external_number || 1,
        importMode: conversionOptions.importMode,
        generatedAt: new Date().toISOString(),
        sourceFormat: 'OOP-POS-MDF-v2.0.0',
        targetFormat: 'Vectron-Commander-Import',
        converterVersion: '2.0.0-phase2',
        configuration: {
          businessType: conversionOptions.businessType.type,
          primaryLanguage: conversionOptions.language.defaultLanguage,
          supportedLanguages: conversionOptions.language.supportedLanguages,
          featuresEnabled: Object.entries(conversionOptions.features)
            .filter(([key, value]) => value)
            .map(([key]) => key)
        }
      }
    };
    
  } catch (error) {
    return {
      success: false,
      error: error.message,
      output: null,
      validation: null,
      stats: null
    };
  }
}

/**
 * Convert and save to file
 * @param {Object} oopPosMdfData - OOP-POS-MDF v2.0.0 data
 * @param {string} outputPath - Output file path
 * @param {Object} options - Conversion options
 * @returns {Object} Conversion result
 */
function convertToVectronFile(oopPosMdfData, outputPath, options = {}) {
  const fs = require('fs');
  
  const result = convertToVectron(oopPosMdfData, options);
  
  if (result.success) {
    try {
      if (result.outputBuffer) {
        // Write binary (Windows-1252 encoded)
        fs.writeFileSync(outputPath, result.outputBuffer, 'binary');
      } else {
        // Write as UTF-8 text
        fs.writeFileSync(outputPath, result.output, 'utf8');
      }
      
      result.outputPath = outputPath;
    } catch (writeError) {
      result.success = false;
      result.error = `Failed to write file: ${writeError.message}`;
    }
  }
  
  return result;
}

/**
 * Get default configuration for converter
 * @returns {Object} Default configuration
 */
function getDefaultConfig() {
  return {
    kassennummer: 1,
    importMode: 'A',
    includeTimestamp: true,
    programName: 'eckasse-converter',
    strictMode: false,
    validateOutput: true,
    encoding: 'win1252',
    defaultLanguage: 'de',
    pluNumbering: {
      startNumber: 1000,
      blockSize: 100,
      reserveBlocks: 10
    },
    warengruppenNumbering: {
      startNumber: 900,
      useDefaults: true,
      defaultMappings: {
        'SPEISEN': 941,
        'GETRÄNKE': 951,
        'GETRÄNKE_REDUZIERT': 953,
        'FOOD': 941,
        'DRINKS': 951,
        'BEVERAGES': 951
      }
    },
    textLimits: {
      itemName: 40,
      categoryName: 30,
      windowName: 20
    },
    validation: {
      maxLineLength: 250,
      warningsAsErrors: false
    }
  };
}

module.exports = {
  convertToVectron,
  convertToVectronFile,
  getDefaultConfig,
  
  // Phase 2 exports
  VectronConfigManager: require('./config').VectronConfigManager,
  createConfigurationPreset: require('./config').createConfigurationPreset,
  createMultilingualManager: require('./utils/multilingual').createMultilingualManager,
  // Export individual components for advanced usage
  components: {
    generateHeader,
    convertItemsToPLUs,
    convertCategoriesToWarengruppen,
    validateOOPInput,
    validateVectronOutput
  }
};