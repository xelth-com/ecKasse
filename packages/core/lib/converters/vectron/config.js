/**
 * Vectron Converter Configuration System
 * 
 * Advanced configuration management for Phase 2 features
 * See VECTRON_CONVERTER_PLAN.md section 4 for configuration details
 * 
 * @module VectronConfiguration
 */

const fs = require('fs');
const path = require('path');
const { detectAvailableLanguages } = require('./utils/multilingual');

/**
 * Configuration manager for Vectron converter
 */
class VectronConfigManager {
  constructor() {
    this.defaultConfig = this.getDefaultConfiguration();
    this.userConfig = {};
    this.mergedConfig = { ...this.defaultConfig };
  }
  
  /**
   * Get default configuration
   * @returns {Object} Default configuration object
   */
  getDefaultConfiguration() {
    return {
      // Basic settings
      kassennummer: 1,
      importMode: 'A',
      encoding: 'win1252',
      includeTimestamp: true,
      programName: 'eckasse-converter',
      
      // Validation settings
      validation: {
        strictMode: false,
        validateOutput: true,
        warningsAsErrors: false,
        maxLineLength: 250
      },
      
      // Language settings
      language: {
        defaultLanguage: 'de',
        supportedLanguages: ['de', 'en'],
        fallbackLanguage: 'en',
        autoDetectLanguages: true,
        includeMultilingualFields: true
      },
      
      // Numbering systems
      numbering: {
        plu: {
          startNumber: 1000,
          blockSize: 100,
          reserveBlocks: 10,
          autoGenerate: true
        },
        warengruppen: {
          startNumber: 900,
          useDefaults: true,
          autoGenerate: true,
          defaultMappings: {
            'SPEISEN': 941,
            'GETRÄNKE': 951,
            'GETRÄNKE_REDUZIERT': 953,
            'FOOD': 941,
            'DRINKS': 951,
            'BEVERAGES': 951
          }
        },
        auswahlfenster: {
          startNumber: 1000,
          autoGenerate: true,
          maxButtons: 256
        }
      },
      
      // Text processing
      text: {
        limits: {
          itemName: 40,
          categoryName: 30,
          buttonName: 20,
          windowName: 20,
          description: 60
        },
        sanitization: {
          removeInvalidChars: true,
          normalizeWhitespace: true,
          trimLength: true
        }
      },
      
      // Feature flags
      features: {
        includeAuswahlfenster: true,
        includeComplexFields: false,
        includePricingSchedules: false,
        includeLayoutElements: false,
        includeExtendedValidation: true,
        includeAllergenInfo: false,
        includeNutritionInfo: false
      },
      
      // Business type specific settings
      businessType: {
        type: 'restaurant', // restaurant, bar, cafe, retail
        customMainGroups: null,
        industrySpecificFields: true
      },
      
      // Display and UI settings
      display: {
        gridSize: {
          x: 120,
          y: 80
        },
        colors: {
          defaultBackground: '#F5F5F5',
          defaultText: '#000000',
          categoryButtons: '#ADD8E6',
          itemButtons: '#E6E6FA'
        },
        buttonSizes: {
          small: { width: 80, height: 60 },
          medium: { width: 120, height: 80 },
          large: { width: 160, height: 100 }
        }
      },
      
      // Advanced mapping settings
      mapping: {
        customFieldMappings: {},
        printerMappings: {
          'RECEIPT': 1,
          'KITCHEN': 2,
          'BAR': 3
        },
        paymentMethodMappings: {
          'CASH': 1,
          'CARD': 2,
          'CREDIT_CARD': 3
        },
        taxRateMappings: {
          7: 2,   // 7% → Tax rate 2
          19: 1,  // 19% → Tax rate 1
          0: 3    // 0% → Tax rate 3
        }
      },
      
      // Output formatting
      output: {
        lineEndings: '\r\n',
        fieldSeparator: ';',
        escapeQuotes: true,
        includeComments: false,
        prettyFormat: false
      },
      
      // Performance settings
      performance: {
        batchSize: 1000,
        enableCaching: true,
        parallelProcessing: false,
        memoryLimit: '256MB'
      }
    };
  }
  
  /**
   * Load configuration from file
   * @param {string} configPath - Path to configuration file
   * @returns {Object} Loaded configuration
   */
  loadConfigFromFile(configPath) {
    try {
      if (!fs.existsSync(configPath)) {
        console.warn(`Configuration file not found: ${configPath}`);
        return {};
      }
      
      const content = fs.readFileSync(configPath, 'utf8');
      
      if (configPath.endsWith('.json')) {
        return JSON.parse(content);
      } else if (configPath.endsWith('.js')) {
        // For .js config files, use require
        delete require.cache[require.resolve(path.resolve(configPath))];
        return require(path.resolve(configPath));
      }
      
      throw new Error(`Unsupported configuration file format: ${configPath}`);
    } catch (error) {
      console.error(`Error loading configuration: ${error.message}`);
      return {};
    }
  }
  
  /**
   * Save configuration to file
   * @param {string} configPath - Path to save configuration
   * @param {Object} config - Configuration to save
   */
  saveConfigToFile(configPath, config = null) {
    const configToSave = config || this.mergedConfig;
    
    try {
      const content = JSON.stringify(configToSave, null, 2);
      fs.writeFileSync(configPath, content, 'utf8');
      console.log(`Configuration saved to: ${configPath}`);
    } catch (error) {
      console.error(`Error saving configuration: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Apply configuration from various sources
   * @param {Object} options - Configuration options
   * @returns {Object} Applied configuration
   */
  applyConfiguration(options = {}) {
    // Start with default config
    let config = { ...this.defaultConfig };
    
    // Apply user config if exists
    if (Object.keys(this.userConfig).length > 0) {
      config = this.deepMerge(config, this.userConfig);
    }
    
    // Apply runtime options
    if (options.configFile) {
      const fileConfig = this.loadConfigFromFile(options.configFile);
      config = this.deepMerge(config, fileConfig);
    }
    
    // Apply command line options
    if (options.kassennummer) config.kassennummer = options.kassennummer;
    if (options.importMode) config.importMode = options.importMode;
    if (options.defaultLanguage) config.language.defaultLanguage = options.defaultLanguage;
    if (options.strictMode !== undefined) config.validation.strictMode = options.strictMode;
    if (options.includeAuswahlfenster !== undefined) config.features.includeAuswahlfenster = options.includeAuswahlfenster;
    
    // Auto-detect settings from input data
    if (options.inputData && config.language.autoDetectLanguages) {
      const detectedLanguages = detectAvailableLanguages(options.inputData);
      if (detectedLanguages.length > 0) {
        config.language.supportedLanguages = detectedLanguages;
        if (!detectedLanguages.includes(config.language.defaultLanguage)) {
          config.language.defaultLanguage = detectedLanguages[0];
        }
      }
    }
    
    // Business type specific configuration
    if (options.businessType) {
      config.businessType.type = options.businessType;
      this.applyBusinessTypeDefaults(config);
    }
    
    this.mergedConfig = config;
    return config;
  }
  
  /**
   * Apply business type specific defaults
   * @param {Object} config - Configuration object to modify
   */
  applyBusinessTypeDefaults(config) {
    const businessDefaults = {
      restaurant: {
        features: {
          includeAllergenInfo: true,
          includeNutritionInfo: true,
          includePricingSchedules: true
        },
        numbering: {
          warengruppen: {
            defaultMappings: {
              'VORSPEISEN': 940,
              'HAUPTSPEISEN': 941,
              'NACHSPEISEN': 942,
              'GETRÄNKE': 951,
              'ALKOHOLISCHE_GETRÄNKE': 952
            }
          }
        }
      },
      bar: {
        features: {
          includeAllergenInfo: false,
          includeNutritionInfo: false,
          includePricingSchedules: true
        },
        numbering: {
          warengruppen: {
            defaultMappings: {
              'BIER': 950,
              'WEIN': 951,
              'SPIRITS': 952,
              'COCKTAILS': 953,
              'ALKOHOLFREI': 954
            }
          }
        }
      },
      cafe: {
        features: {
          includeAllergenInfo: true,
          includeNutritionInfo: false,
          includePricingSchedules: false
        },
        numbering: {
          warengruppen: {
            defaultMappings: {
              'KAFFEE': 950,
              'TEE': 951,
              'KALTGETRÄNKE': 952,
              'GEBÄCK': 941,
              'SNACKS': 942
            }
          }
        }
      },
      retail: {
        features: {
          includeAllergenInfo: false,
          includeNutritionInfo: false,
          includePricingSchedules: false
        },
        numbering: {
          plu: {
            startNumber: 2000,
            blockSize: 1000
          }
        }
      }
    };
    
    const businessConfig = businessDefaults[config.businessType.type];
    if (businessConfig) {
      config = this.deepMerge(config, businessConfig);
    }
  }
  
  /**
   * Validate configuration
   * @param {Object} config - Configuration to validate
   * @returns {Array} Array of validation errors
   */
  validateConfiguration(config) {
    const errors = [];
    
    // Basic validation
    if (!config.kassennummer || config.kassennummer < 1) {
      errors.push('kassennummer must be a positive number');
    }
    
    if (!['A', 'O', 'R'].includes(config.importMode)) {
      errors.push('importMode must be A, O, or R');
    }
    
    // Language validation
    if (!config.language.defaultLanguage) {
      errors.push('defaultLanguage is required');
    }
    
    if (!Array.isArray(config.language.supportedLanguages) || config.language.supportedLanguages.length === 0) {
      errors.push('supportedLanguages must be a non-empty array');
    }
    
    // Numbering validation
    if (config.numbering.plu.startNumber < 1) {
      errors.push('PLU startNumber must be positive');
    }
    
    if (config.numbering.plu.blockSize < 1) {
      errors.push('PLU blockSize must be positive');
    }
    
    // Text limits validation
    Object.entries(config.text.limits).forEach(([key, value]) => {
      if (typeof value !== 'number' || value < 1) {
        errors.push(`text.limits.${key} must be a positive number`);
      }
    });
    
    return errors;
  }
  
  /**
   * Deep merge configuration objects
   * @param {Object} target - Target object
   * @param {Object} source - Source object
   * @returns {Object} Merged object
   */
  deepMerge(target, source) {
    const result = { ...target };
    
    for (const key in source) {
      if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
        result[key] = this.deepMerge(target[key] || {}, source[key]);
      } else {
        result[key] = source[key];
      }
    }
    
    return result;
  }
  
  /**
   * Get configuration template for specific business type
   * @param {string} businessType - Business type
   * @returns {Object} Configuration template
   */
  getBusinessTypeTemplate(businessType) {
    const template = { ...this.defaultConfig };
    template.businessType.type = businessType;
    this.applyBusinessTypeDefaults(template);
    return template;
  }
  
  /**
   * Export current configuration
   * @returns {Object} Current configuration
   */
  exportConfiguration() {
    return { ...this.mergedConfig };
  }
  
  /**
   * Reset to default configuration
   */
  resetToDefaults() {
    this.userConfig = {};
    this.mergedConfig = { ...this.defaultConfig };
  }
  
  /**
   * Update user configuration
   * @param {Object} newConfig - New configuration to merge
   */
  updateUserConfig(newConfig) {
    this.userConfig = this.deepMerge(this.userConfig, newConfig);
    this.mergedConfig = this.deepMerge(this.defaultConfig, this.userConfig);
  }
}

/**
 * Create configuration preset for common scenarios
 * @param {string} preset - Preset name
 * @returns {Object} Preset configuration
 */
function createConfigurationPreset(preset) {
  const manager = new VectronConfigManager();
  
  const presets = {
    'minimal': {
      features: {
        includeAuswahlfenster: false,
        includeComplexFields: false,
        includePricingSchedules: false,
        includeExtendedValidation: false
      },
      validation: {
        strictMode: false,
        warningsAsErrors: false
      }
    },
    
    'standard': {
      features: {
        includeAuswahlfenster: true,
        includeComplexFields: false,
        includePricingSchedules: false,
        includeExtendedValidation: true
      }
    },
    
    'advanced': {
      features: {
        includeAuswahlfenster: true,
        includeComplexFields: true,
        includePricingSchedules: true,
        includeExtendedValidation: true,
        includeAllergenInfo: true,
        includeNutritionInfo: true
      },
      validation: {
        strictMode: true,
        warningsAsErrors: false
      }
    },
    
    'production': {
      features: {
        includeAuswahlfenster: true,
        includeComplexFields: true,
        includePricingSchedules: true,
        includeExtendedValidation: true
      },
      validation: {
        strictMode: true,
        warningsAsErrors: true
      },
      performance: {
        batchSize: 500,
        enableCaching: true,
        parallelProcessing: true
      }
    }
  };
  
  const presetConfig = presets[preset];
  if (presetConfig) {
    return manager.deepMerge(manager.getDefaultConfiguration(), presetConfig);
  }
  
  throw new Error(`Unknown preset: ${preset}`);
}

module.exports = {
  VectronConfigManager,
  createConfigurationPreset
};