#!/usr/bin/env node

/**
 * eckasse CLI Tool
 * Command-line utility for managing eckasse POS configurations
 *
 * Features:
 * - Validate configurations against JSON Schema (v2.0.0)
 * - Generate sample configurations (v2.0.0)
 * - Convert between formats (including Vectron from v2.0.0)
 * - Parse menus using LLM (image, PDF, text) into v2.0.0 format
 *
 * @author eckasse Development Team
 * @version 2.0.0
 */

const fs = require('fs').promises;
const path = require('path');
const { program } = require('commander');

// Load environment variables from .env file
require('dotenv').config({ path: path.resolve(__dirname, '../../../../.env') });
const Ajv = require('ajv');
const addFormats = require('ajv-formats');
const chalk = require('chalk');

// Lazy-loaded modules (loaded only when needed)
let ora = null;
let MenuParserLLM = null;
let VectronConverter = null;
let importFromOopMdf = null;
let exportToOopMdfWithFileName = null;

// Helper functions for lazy loading
function loadOra() {
  if (!ora) ora = require('ora');
  return ora;
}

function loadMenuParser() {
  if (!MenuParserLLM) MenuParserLLM = require('../lib/menu_parser_llm.js');
  return MenuParserLLM;
}

function loadVectronConverter() {
  if (!VectronConverter) VectronConverter = require('../lib/converters/vectron.js');
  return VectronConverter;
}

function loadImportService() {
  if (!importFromOopMdf) {
    const service = require('../services/import.service.js');
    importFromOopMdf = service.importFromOopMdf;
  }
  return importFromOopMdf;
}

function loadExportService() {
  if (!exportToOopMdfWithFileName) {
    const service = require('../services/export.service.js');
    exportToOopMdfWithFileName = service.exportToOopMdfWithFileName;
  }
  return exportToOopMdfWithFileName;
}

// Database cleanup function  
async function cleanupResources() {
  try {
    // Close database connections if they were opened
    if (importFromOopMdf || exportToOopMdfWithFileName) {
      const db = require('../db/knex');
      await db.destroy();
      console.log(chalk.gray('Database connections closed.'));
    }
  } catch (error) {
    console.error(chalk.yellow(`Warning: Error during cleanup: ${error.message}`));
  }
}

// Graceful exit function
async function gracefulExit(code = 0) {
  await cleanupResources();
  process.exit(code);
}

class EckasseCLI {
  constructor() {
    this.ajv = new Ajv({ allErrors: true, strict: false });
    addFormats(this.ajv);
    this.schemas = new Map();
    // this.migrations = new Map(); // УДАЛЕНО

    // this.migrations.set('1.0.0->2.0.0', Migration_1_0_0_to_2_0_0); // УДАЛЕНО

    this.initCLI();
  }

  initCLI() {
    program
      .name('eckasse')
      .description('CLI tool for managing eckasse POS configurations')
      .version('2.0.0');

    // Validate command
    program
      .command('validate <file>')
      .description('Validate a configuration file against JSON Schema (v2.0.0)')
      .option('-s, --schema <version>', 'Schema version to validate against (only 2.0.0 supported)', '2.0.0')
      .option('-v, --verbose', 'Show detailed validation results')
      .action(async (file, options) => {
        // Принудительно устанавливаем schemaVersion в 2.0.0
        if (options.schema !== '2.0.0') {
          console.warn(chalk.yellow('⚠️  Only schema v2.0.0 is supported. Validating against v2.0.0.'));
          options.schema = '2.0.0';
        }
        await this.validateConfig(file, options);
      });

    // Migrate command (УДАЛЕНО)
    /*
    program
      .command('migrate <file>')
      .description('Migrate configuration between versions')
      .option('-t, --target <version>', 'Target version', '2.0.0')
      .option('-o, --output <file>', 'Output file path')
      .option('-b, --backup', 'Create backup of original file')
      .option('--dry-run', 'Show migration preview without saving')
      .action((file, options) => {
        this.migrateConfig(file, options);
      });
    */

    // Generate command
    program
      .command('generate')
      .description('Generate a sample configuration file (v2.0.0)')
      .option('-t, --type <type>', 'Configuration type', 'restaurant')
      .option('-v, --version <version>', 'Schema version (always 2.0.0)', '2.0.0')
      .option('-o, --output <file>', 'Output file path', 'sample-config.json')
      .action(async (options) => {
        // Принудительно устанавливаем version в 2.0.0
        if (options.version !== '2.0.0') {
          console.warn(chalk.yellow('⚠️  Only schema v2.0.0 is supported for generation. Generating v2.0.0.'));
          options.version = '2.0.0';
        }
        await this.generateConfig(options);
      });

    // Convert command
    program
      .command('convert <file>')
      .description('Convert configuration (v2.0.0) to different formats')
      .option('-f, --format <format>', 'Output format (vectron, csv, xml)', 'vectron')
      .option('-o, --output <file>', 'Output file path')
      .option('-k, --kassennummer <number>', 'Cash register number', parseInt)
      .option('-m, --import-mode <mode>', 'Import mode (A=Add, O=Overwrite, R=Replace)', 'A')
      .option('-c, --config <file>', 'Configuration file path')
      .option('--preset <preset>', 'Configuration preset (minimal, standard, advanced, production)')
      .option('--business-type <type>', 'Business type (restaurant, bar, cafe, retail)')
      .option('--language <lang>', 'Primary language code')
      .option('--languages <langs>', 'Supported languages (comma-separated)')
      .option('--include-auswahlfenster', 'Include display layout conversion (Phase 2)')
      .option('--include-complex-fields', 'Include complex field mappings (Phase 2)')
      .option('--include-multilingual', 'Include multilingual text fields (Phase 2)')
      .option('--strict-mode', 'Enable strict validation mode')
      .option('--no-validation', 'Disable output validation')
      .option('--verbose', 'Show detailed conversion information')
      .action(async (file, options) => {
        await this.convertConfig(file, options);
      });

    // Info command
    program
      .command('info <file>')
      .description('Show information about a configuration file (v2.0.0)')
      .action(async (file) => {
        await this.showConfigInfo(file);
      });

    // Interactive setup
    program
      .command('setup')
      .description('Interactive setup wizard for new configuration (v2.0.0)')
      .action(async () => {
        await this.interactiveSetup();
      });

    // Parse menu command (from menu_parser_cli.js)
    program
      .command('parse-menu <input...>')
      .description('Parse restaurant menu from image, PDF, or text files using LLM into v2.0.0 format')
      .option('-o, --output <file>', 'Output configuration file (auto-generated if not specified)')
      .option('-a, --append <file>', 'Append to existing configuration file instead of creating new')
      .option('-t, --business-type <type>', 'Business type (restaurant, cafe, bar, fastfood)', 'restaurant')
      .option('-l, --language <lang>', 'Primary language', 'de')
      .option('--languages <langs>', 'Supported languages (comma-separated)', 'de,en')
      .option('--restaurant-name <name>', 'Restaurant name override')
      .option('--batch-delay <seconds>', 'Delay between files to avoid rate limits (seconds)', '5')
      .option('--raw-json-output <filepath>', 'Save raw intermediate JSON from LLM for debugging')
      .option('--vectron', 'Generate Vectron import file after parsing')
      .option('--csv', 'Generate CSV export after parsing')
      .option('--validate', 'Validate generated configuration')
      .option('--interactive', 'Interactive mode for corrections if confidence is low')
      .option('--confidence-threshold <threshold>', 'Minimum confidence threshold (0.0-1.0)', '0.7')
      .option('--llm-provider <provider>', 'LLM provider (gemini)', 'gemini')
      .action(async (inputs, options) => {
        await this.parseMenuCommand(inputs, options);
      });

    // Interactive menu wizard (from menu_parser_cli.js)
    program
      .command('menu-wizard')
      .description('Interactive wizard for menu parsing and configuration into v2.0.0 format')
      .action(async () => {
        await this.menuWizard();
      });

    // Import OOP-POS-MDF command
    program
      .command('import-mdf <filepath>')
      .description('Import a complete oop-pos-mdf JSON file into the database, overwriting existing data')
      .option('--force', 'Skip confirmation prompt and proceed with import')
      .option('--dry-run', 'Validate the JSON structure without actually importing')
      .option('--validate', 'Validate against schema before importing')
      .action(async (filepath, options) => {
        await this.importMdfCommand(filepath, options);
      });

    // Export OOP-POS-MDF command
    program
      .command('export-mdf [output]')
      .description('Export current database state to oop-pos-mdf JSON file with "_exp" suffix')
      .option('--validate', 'Validate exported configuration against schema')
      .option('--pretty', 'Format JSON output with indentation (default: true)')
      .option('--force', 'Overwrite existing output file without confirmation')
      .option('--no-embeddings', 'Exclude vector embeddings from export (reduces file size)')
      .action(async (output, options) => {
        await this.exportMdfCommand(output, options);
      });

    // Enrich MDF command
    program
      .command('enrich-mdf <inputFile>')
      .description('Enrich a parsed oop-pos-mdf file with additional AI-generated data.')
      .option('-o, --output <outputFile>', 'Output file path for the enriched data')
      .option('--validate', 'Validate input file against schema before enriching')
      .option('--skip-web-search', 'Skip web search enrichment (faster but less detailed)')
      .option('--skip-main-groups', 'Skip main groups generation (Warengruppen)')
      .option('--dry-run', 'Show what would be enriched without making changes')
      .action(async (inputFile, options) => {
        await this.enrichMdfCommand(inputFile, options);
      });

    program.parse();
  }

  /**
   * Load and cache JSON schema
   * (Simplified to always load v2.0.0)
   */
  async loadSchema(version = '2.0.0') { // Принудительно устанавливаем версию
    if (version !== '2.0.0') {
      throw new Error(`Only schema v2.0.0 is supported. Attempted to load v${version}.`);
    }

    if (this.schemas.has(version)) {
      return this.schemas.get(version);
    }

    const schemaPath = path.join(__dirname, '..', 'schemas', `v${version}`, 'schema.json');
    try {
      const schemaContent = await fs.readFile(schemaPath, 'utf8');
      const schema = JSON.parse(schemaContent);
      this.schemas.set(version, schema);
      return schema;
    } catch (error) {
      console.error(chalk.red(`❌ Failed to load schema v${version}: ${error.message}`));
      process.exit(1);
    }
  }

  /**
   * Validate configuration file
   * (Always validates against v2.0.0)
   */
  async validateConfig(filePath, options) {
    // options.schema уже принудительно установлен в 2.0.0 в cli.js
    console.log(chalk.blue(`🔍 Validating ${filePath} against schema v${options.schema}...`));
    try {
      const configContent = await fs.readFile(filePath, 'utf8');
      const config = JSON.parse(configContent);

      const schema = await this.loadSchema(options.schema); // Будет загружена только v2.0.0
      const validate = this.ajv.compile(schema);

      const valid = validate(config);
      if (valid) {
        console.log(chalk.green('✅ Configuration is valid!'));
        if (options.verbose) {
          this.showConfigStats(config);
        }
      } else {
        console.log(chalk.red('❌ Configuration validation failed:'));
        validate.errors.forEach((error, index) => {
          console.log(chalk.red(`  ${index + 1}. ${error.instancePath || 'root'}: ${error.message}`));
          if (error.allowedValues) {
            console.log(chalk.gray(`     Allowed values: ${error.allowedValues.join(', ')}`));
          }
        });
        process.exit(1);
      }
    } catch (error) {
      console.error(chalk.red(`❌ Error: ${error.message}`));
      process.exit(1);
    }
  }

  /**
   * Validate configuration object directly (not from file)
   */
  async validateConfiguration(config, version = '2.0.0') {
    console.log(chalk.blue(`🔍 Validating configuration object against schema v${version}...`));
    try {
      const schema = await this.loadSchema(version);
      const validate = this.ajv.compile(schema);

      const valid = validate(config);
      if (valid) {
        console.log(chalk.green('✅ Configuration is valid!'));
        this.showConfigStats(config);
      } else {
        console.log(chalk.red('❌ Configuration validation failed:'));
        validate.errors.forEach((error, index) => {
          console.log(chalk.red(`  ${index + 1}. ${error.instancePath || 'root'}: ${error.message}`));
          if (error.allowedValues) {
            console.log(chalk.gray(`     Allowed values: ${error.allowedValues.join(', ')}`));
          }
        });
        throw new Error('Configuration validation failed');
      }
    } catch (error) {
      console.error(chalk.red(`❌ Validation error: ${error.message}`));
      throw error;
    }
  }

  /**
   * Show configuration statistics
   */
  showConfigStats(config) {
    console.log(chalk.cyan('\n📊 Configuration Statistics:'));

    try {
      const companyName = config.company_details?.company_full_name || 'N/A';
      const branchCount = config.company_details?.branches?.length || 0;
      let totalPosDevices = 0;
      let totalItems = 0;
      let totalCategories = 0;

      if (config.company_details?.branches) {
        for (const branch of config.company_details.branches) {
          if (branch.point_of_sale_devices) {
            totalPosDevices += branch.point_of_sale_devices.length;
            for (const pos of branch.point_of_sale_devices) {
              totalItems += pos.items_for_this_pos?.length || 0;
              totalCategories += pos.categories_for_this_pos?.length || 0;
            }
          }
        }
      }

      console.log(`   Company: ${chalk.bold(companyName)}`);
      console.log(`   Branches: ${chalk.bold(branchCount)}`);
      console.log(`   POS Devices: ${chalk.bold(totalPosDevices)}`);
      console.log(`   Categories: ${chalk.bold(totalCategories)}`);
      console.log(`   Items: ${chalk.bold(totalItems)}`);

      const formatVersion = config.company_details?.meta_information?.format_version || 'N/A';
      console.log(`   Format Version: ${chalk.bold(formatVersion)}`);

    } catch (error) {
      console.log(chalk.yellow(`   Unable to parse configuration statistics: ${error.message}`));
    }
  }

  /**
   * Migrate configuration (УДАЛЕНО из класса)
   */

  /**
   * Generate sample configuration
   * (Always generates v2.0.0)
   */
  async generateConfig(options) {
    console.log(chalk.blue(`✨ Generating sample ${options.type} configuration (v${options.version})...`));
    try {
      const sampleConfig = this.createSampleConfig(options.type, options.version);
      await fs.writeFile(options.output, JSON.stringify(sampleConfig, null, 2));
      console.log(chalk.green(`✅ Sample configuration saved to: ${options.output}`));
    } catch (error) {
      console.error(chalk.red(`❌ Error generating sample configuration: ${error.message}`));
      process.exit(1);
    }
  }

  createSampleConfig(type, version = '2.0.0') { // Принудительно устанавливаем версию
    const timestamp = new Date().toISOString();
    return {
      "$schema": `https://schemas.eckasse.com/oop-pos-mdf/v${version}/schema.json`,
      company_details: {
        company_unique_identifier: 1,
        company_full_name: `Sample ${type} Configuration`,
        meta_information: {
          format_version: version,
          date_generated: timestamp,
          generated_by: "eckasse-cli-v2.0.0",
          default_currency_symbol: "€",
          default_language: "de",
          supported_languages: ["de", "en"],
          audit_trail: {
            created_at: timestamp,
            created_by: "cli@eckasse.com",
            last_modified_at: timestamp,
            last_modified_by: "cli@eckasse.com",
            version: 1,
            change_log: []
          }
        },
        global_configurations: {
          tax_rates_definitions: [
            {
              tax_rate_unique_identifier: 1,
              tax_rate_names: { "de": "Standard (19%)", "en": "Standard (19%)" },
              rate_percentage: 19.0,
              fiscal_mapping_type: "NORMAL"
            }
          ],
          main_groups_definitions: [
            {
              main_group_unique_identifier: 1,
              main_group_names: { "de": "Hauptgruppe 1", "en": "Main Group 1" }
            }
          ],
          payment_methods_definitions: [
            {
              payment_method_unique_identifier: 1,
              payment_method_names: { "de": "Bar", "en": "Cash" },
              payment_method_type: "CASH"
            }
          ],
          promotions_definitions: [],
          workflows: [],
          integrations: {},
          security_settings: {
            encryption: { at_rest: true, in_transit: true, algorithm: "AES-256" },
            access_control: { session_timeout: 3600, max_failed_attempts: 3, lockout_duration: 900, require_2fa: false },
            data_privacy: { gdpr_compliance: true, data_retention_days: 2555, anonymization_rules: [] }
          }
        },
        branches: [
          {
            branch_unique_identifier: 1,
            branch_names: { "de": "Hauptfiliale", "en": "Main Branch" },
            branch_address: "Sample Street 1, 12345 Sample City",
            point_of_sale_devices: [
              {
                pos_device_unique_identifier: 1,
                pos_device_names: { "de": "Kasse 1", "en": "POS 1" },
                pos_device_type: "DESKTOP",
                pos_device_external_number: 1,
                pos_device_settings: {
                  default_currency_identifier: "€",
                  default_linked_drink_tax_rate_unique_identifier: 1,
                  default_linked_food_tax_rate_unique_identifier: 1
                },
                categories_for_this_pos: [],
                items_for_this_pos: []
              }
            ]
          }
        ]
      }
    };
  }

  /**
   * Convert configuration to a different format.
   */
  async convertConfig(file, options) {
    console.log(chalk.blue(`🔄 Converting ${file} to ${options.format}...`));
    try {
      const configContent = await fs.readFile(file, 'utf8');
      const config = JSON.parse(configContent);

      let outputContent;
      let outputPath = options.output;
      let conversionResult;

      switch (options.format.toLowerCase()) {
        case 'vectron':
          const VectronClass = loadVectronConverter();
          const vectronConverter = new VectronClass();

          // Build conversion options from CLI arguments
          const conversionOptions = {};

          // Basic options
          if (options.kassennummer) conversionOptions.kassennummer = options.kassennummer;
          if (options.importMode) conversionOptions.importMode = options.importMode;
          if (options.businessType) conversionOptions.businessType = options.businessType;
          if (options.language) conversionOptions.defaultLanguage = options.language;
          if (options.languages) {
            conversionOptions.supportedLanguages = options.languages.split(',').map(l => l.trim());
          }

          // Phase 2 features
          if (options.includeAuswahlfenster) {
            conversionOptions.features = { ...conversionOptions.features, includeAuswahlfenster: true };
          }
          if (options.includeComplexFields) {
            conversionOptions.features = { ...conversionOptions.features, includeComplexFields: true };
          }
          if (options.includeMultilingual) {
            conversionOptions.language = { ...conversionOptions.language, includeMultilingualFields: true };
          }

          // Validation options
          if (options.strictMode) {
            conversionOptions.validation = { ...conversionOptions.validation, strictMode: true };
          }
          if (options.noValidation) {
            conversionOptions.validateOutput = false;
          }

          // Configuration file or preset
          if (options.config) {
            conversionOptions.configFile = options.config;
          }
          if (options.preset) {
            const { createConfigurationPreset } = require('./converters/vectron/config');
            const presetConfig = createConfigurationPreset(options.preset);
            Object.assign(conversionOptions, presetConfig);
          }

          // Use detailed conversion for Phase 2 features
          conversionResult = vectronConverter.convertWithDetails(config, conversionOptions);

          if (!conversionResult.success) {
            throw new Error(conversionResult.error);
          }

          outputContent = conversionResult.outputBuffer || conversionResult.output;

          if (!outputPath) {
            outputPath = file.replace(/\.json$/i, '-vectron.txt');
          }

          // Show detailed information if verbose
          if (options.verbose) {
            console.log(chalk.cyan('\n📊 Conversion Statistics:'));
            console.log(`  Total lines: ${chalk.bold(conversionResult.stats.totalLines)}`);
            console.log(`  Header lines: ${chalk.bold(conversionResult.stats.headerLines)}`);
            console.log(`  Warengruppen lines: ${chalk.bold(conversionResult.stats.warengruppenLines)}`);
            console.log(`  PLU lines: ${chalk.bold(conversionResult.stats.pluLines)}`);
            if (conversionResult.stats.auswahlfensterLines > 0) {
              console.log(`  Auswahlfenster lines: ${chalk.bold(conversionResult.stats.auswahlfensterLines)}`);
            }

            console.log(chalk.cyan('\n🔧 Features Used:'));
            Object.entries(conversionResult.stats.featuresUsed || {}).forEach(([feature, enabled]) => {
              if (enabled) {
                console.log(`  ${chalk.green('✓')} ${feature}`);
              }
            });

            if (conversionResult.validation && conversionResult.validation.warnings.length > 0) {
              console.log(chalk.yellow('\n⚠️  Warnings:'));
              conversionResult.validation.warnings.forEach(warning => {
                console.log(`  ${chalk.yellow('•')} ${warning}`);
              });
            }
          }

          break;
        // Add other formats like CSV or XML here if needed in the future
        default:
          console.error(chalk.red(`❌ Unsupported format: ${options.format}`));
          process.exit(1);
      }

      await fs.writeFile(outputPath, outputContent);
      console.log(chalk.green(`✅ Conversion successful! Output saved to: ${outputPath}`));

      // Show metadata if available
      if (conversionResult && conversionResult.metadata && options.verbose) {
        console.log(chalk.cyan('\n📋 Conversion Metadata:'));
        console.log(`  Converter version: ${conversionResult.metadata.converterVersion}`);
        console.log(`  Business type: ${conversionResult.metadata.configuration.businessType}`);
        console.log(`  Primary language: ${conversionResult.metadata.configuration.primaryLanguage}`);
        console.log(`  Supported languages: ${conversionResult.metadata.configuration.supportedLanguages.join(', ')}`);
      }

    } catch (error) {
      console.error(chalk.red(`❌ Error during conversion: ${error.message}`));
      if (options.verbose) {
        console.error(chalk.gray(error.stack));
      }
      process.exit(1);
    }
  }

  /**
   * Main menu parsing command
   *
   */
  async parseMenuCommand(inputs, options) {
    console.log(chalk.blue('🍽️  eckasse Menu Parser v2.0.0\n'));
    const spinner = loadOra()('Initializing menu parser...').start();

    try {
      // Handle multiple input files
      const inputFiles = Array.isArray(inputs) ? inputs : [inputs];

      // Verify all files exist
      for (const inputFile of inputFiles) {
        await fs.access(inputFile);
        console.log('✓ Input file exists:', inputFile);
      }

      // Load existing configuration if appending
      let existingConfig = null;
      if (options.append) {
        try {
          const existingData = await fs.readFile(options.append, 'utf8');
          existingConfig = JSON.parse(existingData);
          console.log(`✓ Loaded existing configuration: ${options.append}`);
          console.log(`  Existing items: ${this.countItemsInConfig(existingConfig)}`);
          console.log(`  Existing categories: ${this.countCategoriesInConfig(existingConfig)}`);
        } catch (error) {
          console.log(chalk.yellow(`⚠️  Could not load existing config: ${error.message}`));
          console.log('   Creating new configuration instead...');
        }
      }

      console.log('📝 Creating parser with options:', {
        businessType: options.businessType,
        defaultLanguage: options.language,
        supportedLanguages: options.languages.split(','),
        enableValidation: options.validate,
        llmProvider: options.llmProvider,
        fileCount: inputFiles.length,
        appendMode: !!options.append,
        batchDelay: `${options.batchDelay}s`
      });

      const MenuParserClass = loadMenuParser();
      const parser = new MenuParserClass({
        businessType: options.businessType,
        defaultLanguage: options.language,
        supportedLanguages: options.languages.split(','),
        enableValidation: options.validate,
        llmProvider: options.llmProvider
      });

      console.log('✓ Parser created successfully');

      const parseOptions = {
        businessType: options.businessType,
        language: options.language,
        restaurantName: options.restaurantName
      };

      let finalResult;

      if (inputFiles.length === 1) {
        // Single file processing
        spinner.text = 'Processing menu file...';
        finalResult = await parser.parseMenu(inputFiles[0], parseOptions);
      } else {
        // Batch processing with delays
        spinner.text = `Processing ${inputFiles.length} files with ${options.batchDelay}s delay...`;
        finalResult = await this.processBatchFiles(parser, inputFiles, parseOptions, options, spinner);
      }

      // Merge with existing config if appending
      if (existingConfig) {
        finalResult = await this.mergeConfigurations(existingConfig, finalResult, options);
      }

      spinner.succeed('Menu parsed successfully!');

      console.log(chalk.green('\n📊 Parsing Results:'));
      console.log(`   Items found: ${chalk.bold(finalResult.metadata.itemsFound)}`);
      console.log(`   Categories: ${chalk.bold(finalResult.metadata.categoriesFound)}`);
      console.log(`   Confidence: ${chalk.bold((finalResult.metadata.confidence * 100).toFixed(1))}%`);
      console.log(`   Language: ${chalk.bold(finalResult.metadata.language)}`);
      if (existingConfig) {
        console.log(chalk.blue(`   Mode: Appended to existing configuration`));
      }

      // Save raw JSON output for debugging if requested
      if (options.rawJsonOutput && finalResult.rawData) {
        try {
          await fs.writeFile(options.rawJsonOutput, JSON.stringify(finalResult.rawData.parsedData, null, 2));
          console.log(chalk.blue(`\n🔍 Raw JSON output saved: ${options.rawJsonOutput}`));
        } catch (error) {
          console.log(chalk.yellow(`\n⚠️  Warning: Could not save raw JSON output: ${error.message}`));
        }
      }

      if (finalResult.metadata.confidence < parseFloat(options.confidenceThreshold)) {
        console.log(chalk.yellow(`\n⚠️  Warning: Confidence below threshold (${options.confidenceThreshold})`));
        if (options.interactive) {
          const inquirer = (await import('inquirer')).default;
          const { proceed } = await inquirer.prompt([{
            type: 'confirm',
            name: 'proceed',
            message: 'Confidence is low. Do you want to review and correct the results?',
            default: true
          }]);
          if (proceed) {
            await this.interactiveCorrection(finalResult.configuration);
          }
        }
      }

      // Generate smart output filename if not specified
      let outputPath = options.output;
      if (!outputPath) {
        const restaurantName = options.restaurantName || 'Restaurant';
        const sanitizedName = restaurantName.replace(/[^a-zA-Z0-9]/g, '_');
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 16);
        const fileCount = inputFiles.length > 1 ? `_${inputFiles.length}files` : '';
        outputPath = `menu_outputs/${sanitizedName}_${timestamp}${fileCount}.json`;
      }

      await fs.writeFile(outputPath, JSON.stringify(finalResult.configuration, null, 2));
      console.log(chalk.green(`\n💾 Configuration saved: ${outputPath}`));

      if (options.vectron) {
        await this.generateVectronExport(finalResult.configuration, outputPath);
      }

      if (options.csv) {
        await this.generateCSVExport(finalResult.configuration, outputPath);
      }

      if (options.validate) {
        await this.validateConfiguration(finalResult.configuration);
      }

      console.log(chalk.green('\n✅ Menu parsing completed successfully!'));
      console.log(chalk.gray('Next steps:'));
      console.log(chalk.gray('  1. Review the generated configuration'));
      console.log(chalk.gray('  2. Make any necessary adjustments'));
      console.log(chalk.gray('  3. Deploy to your POS system'));

    } catch (error) {
      spinner.fail('Menu parsing failed');
      console.error(chalk.red(`\n❌ Error: ${error.message}`));

      if (error.message.includes('API key')) {
        console.log(chalk.yellow('\n💡 Tip: Make sure to set your LLM API keys:'));
        console.log(chalk.gray('   export GEMINI_API_KEY=your_api_key'));
        console.log(chalk.gray('   export OPENAI_API_KEY=your_api_key'));
        console.log(chalk.gray('   export ANTHROPIC_API_KEY=your_api_key'));
      }

      process.exit(1);
    }
  }

  /**
   * Show configuration file information
   */
  async showConfigInfo(filePath) {
    console.log(chalk.blue(`ℹ️  Configuration Information for: ${filePath}`));
    try {
      const configContent = await fs.readFile(filePath, 'utf8');
      const config = JSON.parse(configContent);

      // Show basic info
      this.showConfigStats(config);

      // Validate against schema
      try {
        await this.validateConfiguration(config);
      } catch (error) {
        console.log(chalk.yellow('\n⚠️  Note: Configuration has validation issues'));
      }

    } catch (error) {
      console.error(chalk.red(`❌ Error reading configuration: ${error.message}`));
      process.exit(1);
    }
  }

  /**
   * Interactive setup wizard (placeholder)
   */
  async interactiveSetup() {
    console.log(chalk.blue('🔧 Interactive Setup Wizard'));
    console.log(chalk.yellow('⚠️  This feature is not yet implemented'));
    console.log(chalk.gray('Use the generate command to create a sample configuration instead:'));
    console.log(chalk.gray('  eckasse generate --output config.json'));
  }

  /**
   * Interactive correction wizard (placeholder)
   */
  async interactiveCorrection(configuration) {
    console.log(chalk.blue('🔧 Interactive Correction Wizard'));
    console.log(chalk.yellow('⚠️  This feature is not yet implemented'));
    console.log(chalk.gray('Please review the configuration manually'));
  }

  /**
   * Generate Vectron export (placeholder)
   */
  async generateVectronExport(configuration, outputPath) {
    console.log(chalk.blue('📄 Generating Vectron export...'));
    try {
      const vectronPath = outputPath.replace(/\.json$/i, '-vectron.txt');
      await this.convertConfig(outputPath, { format: 'vectron', output: vectronPath });
      console.log(chalk.green(`✅ Vectron export saved: ${vectronPath}`));
    } catch (error) {
      console.log(chalk.yellow(`⚠️  Could not generate Vectron export: ${error.message}`));
    }
  }

  /**
   * Generate CSV export (placeholder)
   */
  async generateCSVExport(configuration, outputPath) {
    console.log(chalk.blue('📄 Generating CSV export...'));
    console.log(chalk.yellow('⚠️  CSV export is not yet implemented'));
    console.log(chalk.gray('Use the convert command with --format csv when available'));
  }

  /**
   * Import OOP-POS-MDF command implementation
   */
  async importMdfCommand(filepath, options) {
    console.log(chalk.blue('📥 eckasse OOP-POS-MDF Import Tool v2.0.0\n'));

    try {
      // Check if file exists
      try {
        await fs.access(filepath);
      } catch (error) {
        console.error(chalk.red(`❌ File not found: ${filepath}`));
        process.exit(1);
      }

      // Read and parse JSON file
      console.log(chalk.blue(`📖 Reading configuration file: ${filepath}`));
      const fileContent = await fs.readFile(filepath, 'utf8');

      let jsonData;
      try {
        jsonData = JSON.parse(fileContent);
      } catch (parseError) {
        console.error(chalk.red(`❌ Invalid JSON format: ${parseError.message}`));
        process.exit(1);
      }

      // Validate schema if requested
      if (options.validate) {
        console.log(chalk.blue('🔍 Validating against schema...'));
        try {
          const schema = await this.loadSchema('2.0.0');
          const validate = this.ajv.compile(schema);
          const valid = validate(jsonData);

          if (!valid) {
            console.log(chalk.red('❌ Schema validation failed:'));
            validate.errors.slice(0, 5).forEach((error, index) => {
              console.log(chalk.red(`  ${index + 1}. ${error.instancePath || 'root'}: ${error.message}`));
            });
            if (validate.errors.length > 5) {
              console.log(chalk.gray(`  ... and ${validate.errors.length - 5} more errors`));
            }
            process.exit(1);
          }
          console.log(chalk.green('✅ Schema validation passed'));
        } catch (validationError) {
          console.error(chalk.red(`❌ Validation error: ${validationError.message}`));
          process.exit(1);
        }
      }

      // Show preview information
      const companyName = jsonData.company_details?.company_full_name || 'Unknown Company';
      const branchCount = jsonData.company_details?.branches?.length || 0;
      let totalItems = 0;
      let totalCategories = 0;

      if (jsonData.company_details?.branches) {
        for (const branch of jsonData.company_details.branches) {
          if (branch.point_of_sale_devices) {
            for (const pos of branch.point_of_sale_devices) {
              totalItems += pos.items_for_this_pos?.length || 0;
              totalCategories += pos.categories_for_this_pos?.length || 0;
            }
          }
        }
      }

      console.log(chalk.cyan('\n📋 Import Preview:'));
      console.log(`   Company: ${chalk.bold(companyName)}`);
      console.log(`   Branches: ${chalk.bold(branchCount)}`);
      console.log(`   Categories: ${chalk.bold(totalCategories)}`);
      console.log(`   Items: ${chalk.bold(totalItems)}`);

      // Check for open transactions before proceeding
      console.log(chalk.blue('\n🔍 Checking for open transactions...'));
      try {
        const db = require('../db/knex');
        const openTransactions = await db('active_transactions')
          .whereIn('status', ['active', 'parked'])
          .count('* as count')
          .first();
        
        const openCount = openTransactions ? openTransactions.count : 0;
        
        if (openCount > 0) {
          console.error(chalk.red('\n❌ Cannot proceed with import: Open transactions found'));
          console.error(chalk.red(`   Found ${openCount} open transaction(s) with status 'active' or 'parked'`));
          console.error(chalk.yellow('\n💡 Please complete or cancel all open transactions before importing:'));
          console.error(chalk.gray('   1. In the POS interface, finalize all active orders'));
          console.error(chalk.gray('   2. Complete or cancel all parked orders'));
          console.error(chalk.gray('   3. Ensure no transactions remain in active or parked status'));
          console.error(chalk.gray('   4. Then retry the import operation'));
          await gracefulExit(1);
        }
        
        console.log(chalk.green('✅ No open transactions found - safe to proceed'));
      } catch (dbError) {
        console.error(chalk.red(`\n❌ Error checking transactions: ${dbError.message}`));
        console.error(chalk.yellow('💡 If the database is not initialized, this check will be skipped'));
        console.log(chalk.yellow('⚠️  Proceeding without transaction check...'));
      }

      // Dry run mode
      if (options.dryRun) {
        console.log(chalk.green('\n✅ Dry run completed - JSON structure is valid'));
        console.log(chalk.gray('Use --validate flag to also check schema compliance'));
        return;
      }

      // Confirmation prompt (unless --force)
      if (!options.force) {
        console.log(chalk.yellow('\n⚠️  WARNING: This operation will:'));
        console.log(chalk.yellow('   • Delete ALL existing data in the database'));
        console.log(chalk.yellow('   • Import the new configuration'));
        console.log(chalk.yellow('   • Generate vector embeddings for all items'));
        console.log(chalk.yellow('   • This action cannot be undone!'));

        const inquirer = (await import('inquirer')).default;
        const { confirmed } = await inquirer.prompt([{
          type: 'confirm',
          name: 'confirmed',
          message: 'Are you sure you want to proceed?',
          default: false
        }]);

        if (!confirmed) {
          console.log(chalk.gray('\nImport cancelled by user'));
          return;
        }
      }

      // Perform the import
      const spinner = loadOra()('Importing data and generating embeddings...').start();

      try {
        const importFn = loadImportService();
        const result = await importFn(jsonData);

        spinner.succeed('Import completed successfully!');

        console.log(chalk.green('\n📊 Import Results:'));
        console.log(`   Companies: ${chalk.bold(result.stats.companies)}`);
        console.log(`   Branches: ${chalk.bold(result.stats.branches)}`);
        console.log(`   POS Devices: ${chalk.bold(result.stats.posDevices)}`);
        console.log(`   Categories: ${chalk.bold(result.stats.categories)}`);
        console.log(`   Items: ${chalk.bold(result.stats.items)}`);
        console.log(`   Embeddings: ${chalk.bold(result.stats.embeddings)}`);
        console.log(`   Duration: ${chalk.bold(result.duration)}ms`);

        if (result.stats.errors && result.stats.errors.length > 0) {
          console.log(chalk.yellow(`\n⚠️  Warnings (${result.stats.errors.length}):`));
          result.stats.errors.slice(0, 3).forEach((error, index) => {
            console.log(chalk.yellow(`   ${index + 1}. ${error}`));
          });
          if (result.stats.errors.length > 3) {
            console.log(chalk.gray(`   ... and ${result.stats.errors.length - 3} more warnings`));
          }
        }

        console.log(chalk.green('\n✅ Import completed successfully!'));
        console.log(chalk.gray('The database is now ready for hybrid search operations.'));
        
        // Graceful exit for successful import
        await gracefulExit(0);

      } catch (importError) {
        spinner.fail('Import failed');
        console.error(chalk.red(`\n❌ Import error: ${importError.message}`));

        if (importError.message.includes('GEMINI_API_KEY')) {
          console.log(chalk.yellow('\n💡 Tip: Make sure your Gemini API key is configured:'));
          console.log(chalk.gray('   export GEMINI_API_KEY=your_api_key'));
          console.log(chalk.gray('   Or add it to your .env file'));
        }

        await gracefulExit(1);
      }

    } catch (error) {
      console.error(chalk.red(`\n❌ Command failed: ${error.message}`));
      await gracefulExit(1);
    }
  }

  /**
   * Process multiple files in batch with delays to avoid rate limits
   */
  async processBatchFiles(parser, files, parseOptions, options, spinner) {
    const results = [];
    const batchDelay = parseInt(options.batchDelay) * 1000;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const fileNum = i + 1;

      try {
        spinner.text = `Processing file ${fileNum}/${files.length}: ${path.basename(file)}`;
        console.log(`\n🔄 Processing ${fileNum}/${files.length}: ${file}`);

        const result = await parser.parseMenu(file, parseOptions);
        results.push(result);

        console.log(`✅ File ${fileNum} completed: ${result.metadata.itemsFound} items, ${result.metadata.categoriesFound} categories`);

        // Add delay between files (except for last file)
        if (i < files.length - 1) {
          console.log(`⏳ Waiting ${options.batchDelay}s before next file...`);
          await new Promise(resolve => setTimeout(resolve, batchDelay));
        }

      } catch (error) {
        console.log(chalk.red(`❌ Failed to process file ${fileNum}: ${error.message}`));

        if (error.message.includes('quota') || error.message.includes('limit') || error.message.includes('429')) {
          console.log(chalk.yellow('\n⚠️  Rate limit detected! Options:'));
          console.log(chalk.yellow('   1. Wait and run again with --append to continue'));
          console.log(chalk.yellow('   2. Increase --batch-delay'));
          console.log(chalk.yellow(`   3. Use this command to continue: --append menu_outputs/[generated_file].json`));

          // Save partial results if we have any
          if (results.length > 0) {
            const partialResult = await this.combineResults(results, parseOptions);
            const partialPath = this.generatePartialPath(options, results.length);
            await fs.writeFile(partialPath, JSON.stringify(partialResult.configuration, null, 2));
            console.log(chalk.blue(`💾 Partial results saved: ${partialPath}`));
          }
        }

        throw error;
      }
    }

    // Combine all results
    return await this.combineResults(results, parseOptions);
  }

  /**
   * Combine multiple parsing results into one configuration
   */
  async combineResults(results, parseOptions) {
    if (results.length === 1) {
      return results[0];
    }

    // Merge all categories and items
    const allCategories = [];
    const allItems = [];
    let totalConfidence = 0;

    for (const result of results) {
      if (result.rawData && result.rawData.parsedData) {
        if (result.rawData.parsedData.categories) {
          allCategories.push(...result.rawData.parsedData.categories);
        }
        if (result.rawData.parsedData.items) {
          allItems.push(...result.rawData.parsedData.items);
        }
        totalConfidence += result.metadata.confidence || 0;
      }
    }

    // Create combined parsed data
    const combinedParsedData = {
      restaurant_info: results[0].rawData?.parsedData?.restaurant_info || { name: parseOptions.restaurantName },
      categories: allCategories,
      items: allItems,
      confidence: totalConfidence / results.length
    };

    // Use the parser to convert combined data to OOP-POS-MDF
    const MenuParserClass = loadMenuParser();
    const parser = new MenuParserClass({});
    const configuration = await parser.convertToOOPPOSMDF(combinedParsedData, parseOptions);

    return {
      success: true,
      requestId: results[0].requestId,
      configuration,
      metadata: {
        itemsFound: allItems.length,
        categoriesFound: allCategories.length,
        confidence: totalConfidence / results.length,
        language: parseOptions.language,
        processingTime: Date.now(),
        batchFiles: results.length
      },
      rawData: {
        inputType: 'batch',
        parsedData: combinedParsedData,
        individualResults: results.map(r => ({
          items: r.metadata.itemsFound,
          categories: r.metadata.categoriesFound,
          confidence: r.metadata.confidence
        }))
      }
    };
  }

  /**
   * Merge new results with existing configuration
   */
  async mergeConfigurations(existingConfig, newResult, options) {
    // Extract existing items and categories
    const existingItems = [];
    const existingCategories = [];

    if (existingConfig.company_details?.branches) {
      for (const branch of existingConfig.company_details.branches) {
        if (branch.pos_devices) {
          for (const device of branch.pos_devices) {
            if (device.categories) existingCategories.push(...device.categories);
            if (device.items) existingItems.push(...device.items);
          }
        }
      }
    }

    // Combine with new data
    const newCategories = [];
    const newItems = [];

    if (newResult.configuration.company_details?.branches) {
      for (const branch of newResult.configuration.company_details.branches) {
        if (branch.pos_devices) {
          for (const device of branch.pos_devices) {
            if (device.categories) newCategories.push(...device.categories);
            if (device.items) newItems.push(...device.items);
          }
        }
      }
    }

    // Merge categories (avoid duplicates by name)
    const mergedCategories = [...existingCategories];
    for (const newCat of newCategories) {
      const exists = existingCategories.find(cat =>
        cat.multilingual_object?.de?.name === newCat.multilingual_object?.de?.name
      );
      if (!exists) {
        mergedCategories.push(newCat);
      }
    }

    // Merge items (avoid duplicates by name)
    const mergedItems = [...existingItems];
    for (const newItem of newItems) {
      const exists = existingItems.find(item =>
        item.multilingual_object?.de?.name === newItem.multilingual_object?.de?.name
      );
      if (!exists) {
        mergedItems.push(newItem);
      }
    }

    // Update the configuration
    const mergedConfig = JSON.parse(JSON.stringify(newResult.configuration));
    if (mergedConfig.company_details?.branches?.[0]?.pos_devices?.[0]) {
      mergedConfig.company_details.branches[0].pos_devices[0].categories = mergedCategories;
      mergedConfig.company_details.branches[0].pos_devices[0].items = mergedItems;
    }

    // Update metadata
    const mergedResult = {
      ...newResult,
      configuration: mergedConfig,
      metadata: {
        ...newResult.metadata,
        itemsFound: mergedItems.length,
        categoriesFound: mergedCategories.length,
        merged: true,
        previousItems: existingItems.length,
        newItems: newItems.length
      }
    };

    return mergedResult;
  }

  /**
   * Count items in configuration
   */
  countItemsInConfig(config) {
    let count = 0;
    if (config.company_details?.branches) {
      for (const branch of config.company_details.branches) {
        if (branch.point_of_sale_devices) {
          for (const device of branch.point_of_sale_devices) {
            count += device.items_for_this_pos?.length || 0;
          }
        }
      }
    }
    return count;
  }

  /**
   * Count categories in configuration
   */
  countCategoriesInConfig(config) {
    let count = 0;
    if (config.company_details?.branches) {
      for (const branch of config.company_details.branches) {
        if (branch.point_of_sale_devices) {
          for (const device of branch.point_of_sale_devices) {
            count += device.categories_for_this_pos?.length || 0;
          }
        }
      }
    }
    return count;
  }

  /**
   * Count enriched items in configuration
   * An item is considered enriched if it has AI-generated enrichment data
   */
  countEnrichedItemsInConfig(config) {
    let count = 0;
    if (config.company_details?.branches) {
      for (const branch of config.company_details.branches) {
        if (branch.point_of_sale_devices) {
          for (const device of branch.point_of_sale_devices) {
            if (device.items_for_this_pos) {
              for (const item of device.items_for_this_pos) {
                // Check if item has enrichment data
                if (item.additional_item_attributes?.ai_enrichment) {
                  count++;
                }
              }
            }
          }
        }
      }
    }
    return count;
  }

  /**
   * Check if an item has enrichment data
   * An item is considered enriched if it has AI-generated data like:
   * - Extended descriptions
   * - Allergen information
   * - Nutritional data
   * - Enhanced metadata
   */
  isItemEnriched(item) {
    // Check for enrichment indicators
    if (item.enrichment_metadata) {
      return true;
    }
    
    // Check for AI-generated extended descriptions
    if (item.multilingual_object) {
      for (const lang in item.multilingual_object) {
        const langObj = item.multilingual_object[lang];
        if (langObj.extended_description || langObj.ai_generated_description) {
          return true;
        }
      }
    }
    
    // Check for allergen information (often AI-generated)
    if (item.allergen_information && item.allergen_information.length > 0) {
      return true;
    }
    
    // Check for nutritional information (often AI-generated)
    if (item.nutritional_information && 
        (item.nutritional_information.calories || 
         item.nutritional_information.protein || 
         item.nutritional_information.carbs || 
         item.nutritional_information.fat)) {
      return true;
    }
    
    // Check for enhanced metadata fields
    if (item.meta_information && 
        (item.meta_information.ai_confidence || 
         item.meta_information.enrichment_source || 
         item.meta_information.enrichment_timestamp)) {
      return true;
    }
    
    return false;
  }

  /**
   * Generate path for partial results
   */
  generatePartialPath(options, processedCount) {
    const restaurantName = options.restaurantName || 'Restaurant';
    const sanitizedName = restaurantName.replace(/[^a-zA-Z0-9]/g, '_');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 16);
    return `menu_outputs/${sanitizedName}_partial_${processedCount}files_${timestamp}.json`;
  }

  /**
   * Export OOP-POS-MDF command implementation
   */
  async exportMdfCommand(outputPath, options) {
    console.log(chalk.blue('📤 eckasse OOP-POS-MDF Export Tool v2.0.0\n'));

    try {
      // Check if database has data to export
      console.log(chalk.blue('🔍 Checking database content...'));
      
      // Perform the export
      const spinner = loadOra()('Exporting database state to oop-pos-mdf format...').start();

      try {
        const exportFn = loadExportService();
        const result = await exportFn({ includeEmbeddings: options.embeddings !== false });

        spinner.succeed('Export completed successfully!');

        // Use provided output path or suggested filename
        const finalOutputPath = outputPath || `menu_outputs/${result.suggestedFilename}`;

        // Check if file exists and handle overwrite
        if (!options.force) {
          try {
            await fs.access(finalOutputPath);
            console.log(chalk.yellow(`\n⚠️  WARNING: File already exists: ${finalOutputPath}`));
            
            const inquirer = (await import('inquirer')).default;
            const { confirmed } = await inquirer.prompt([{
              type: 'confirm',
              name: 'confirmed',
              message: 'Do you want to overwrite the existing file?',
              default: false
            }]);

            if (!confirmed) {
              console.log(chalk.gray('\nExport cancelled by user'));
              return;
            }
          } catch (error) {
            // File doesn't exist, continue with export
          }
        }

        // Create output directory if it doesn't exist
        const outputDir = path.dirname(finalOutputPath);
        await fs.mkdir(outputDir, { recursive: true });

        // Write the exported configuration
        const jsonOutput = options.pretty !== false 
          ? JSON.stringify(result.configuration, null, 2)
          : JSON.stringify(result.configuration);

        await fs.writeFile(finalOutputPath, jsonOutput);

        console.log(chalk.green('\n📊 Export Results:'));
        console.log(`   Companies: ${chalk.bold(result.metadata.stats.companies)}`);
        console.log(`   Branches: ${chalk.bold(result.metadata.stats.branches)}`);
        console.log(`   POS Devices: ${chalk.bold(result.metadata.stats.posDevices)}`);
        console.log(`   Categories: ${chalk.bold(result.metadata.stats.categories)}`);
        console.log(`   Items: ${chalk.bold(result.metadata.stats.items)}`);
        console.log(`   Duration: ${chalk.bold(result.metadata.duration)}ms`);

        console.log(chalk.green(`\n💾 Configuration exported: ${finalOutputPath}`));

        // Validate exported configuration if requested
        if (options.validate) {
          console.log(chalk.blue('\n🔍 Validating exported configuration...'));
          try {
            await this.validateConfiguration(result.configuration);
            console.log(chalk.green('✅ Exported configuration is valid!'));
          } catch (validationError) {
            console.log(chalk.yellow('\n⚠️  Warning: Exported configuration has validation issues'));
            console.log(chalk.gray('This may indicate data inconsistencies in the database'));
          }
        }

        console.log(chalk.green('\n✅ Export completed successfully!'));
        console.log(chalk.gray('Next steps:'));
        console.log(chalk.gray('  1. Review the exported configuration'));
        console.log(chalk.gray('  2. Use for backup or transfer to another system'));
        console.log(chalk.gray('  3. Re-import with: eckasse import-mdf ' + finalOutputPath));
        
        // Graceful exit for successful export
        await gracefulExit(0);

      } catch (exportError) {
        spinner.fail('Export failed');
        console.error(chalk.red(`\n❌ Export error: ${exportError.message}`));

        if (exportError.message.includes('No companies found')) {
          console.log(chalk.yellow('\n💡 Tip: Make sure you have imported data first:'));
          console.log(chalk.gray('   eckasse import-mdf your_config.json'));
        }

        await gracefulExit(1);
      }

    } catch (error) {
      console.error(chalk.red(`\n❌ Command failed: ${error.message}`));
      await gracefulExit(1);
    }
  }

  /**
   * Enrich MDF command implementation
   */
  async enrichMdfCommand(inputFile, options) {
    console.log(chalk.blue('🔬 eckasse MDF Enrichment Tool v2.0.0\n'));

    try {
      // Check if input file exists
      try {
        await fs.access(inputFile);
      } catch (error) {
        console.error(chalk.red(`❌ Input file not found: ${inputFile}`));
        process.exit(1);
      }

      // Read and parse input file
      console.log(chalk.blue(`📖 Reading input file: ${inputFile}`));
      const fileContent = await fs.readFile(inputFile, 'utf8');

      let mdfData;
      try {
        mdfData = JSON.parse(fileContent);
      } catch (parseError) {
        console.error(chalk.red(`❌ Invalid JSON format: ${parseError.message}`));
        process.exit(1);
      }

      // Validate input file if requested
      if (options.validate) {
        console.log(chalk.blue('🔍 Validating input file against schema...'));
        try {
          await this.validateConfiguration(mdfData);
          console.log(chalk.green('✅ Input file validation passed'));
        } catch (validationError) {
          console.log(chalk.yellow('⚠️  Input file has validation issues but proceeding...'));
        }
      }

      // Show preview of what will be enriched
      const itemsCount = this.countItemsInConfig(mdfData);
      const enrichedItemsCount = this.countEnrichedItemsInConfig(mdfData);
      const categoriesCount = this.countCategoriesInConfig(mdfData);
      
      console.log(chalk.cyan('\n📋 Enrichment Preview:'));
      console.log(`   Total items: ${chalk.bold(itemsCount)}`);
      console.log(`   Already enriched: ${chalk.bold(enrichedItemsCount)}`);
      console.log(`   Items to enrich: ${chalk.bold(itemsCount - enrichedItemsCount)}`);
      console.log(`   Categories to process: ${chalk.bold(categoriesCount)}`);
      console.log(`   Web search: ${options.skipWebSearch ? chalk.gray('Disabled') : chalk.green('Enabled')}`);
      console.log(`   Main groups: ${options.skipMainGroups ? chalk.gray('Disabled') : chalk.green('Enabled')}`);

      // Dry run mode
      if (options.dryRun) {
        console.log(chalk.green('\n✅ Dry run completed - ready for enrichment'));
        console.log(chalk.gray('Remove --dry-run flag to perform actual enrichment'));
        return;
      }

      // Load enrichment service
      const { enrichMdfData } = require('../services/enrichment.service.js');

      // Perform enrichment
      const spinner = loadOra()('Starting multi-pass enrichment process...').start();

      try {
        const enrichmentOptions = {
          skipWebSearch: options.skipWebSearch,
          skipMainGroups: options.skipMainGroups
        };

        const enrichedData = await enrichMdfData(mdfData, enrichmentOptions);
        
        spinner.succeed('Enrichment completed successfully!');

        // Generate output filename if not specified
        let outputPath = options.output;
        if (!outputPath) {
          const inputBasename = path.basename(inputFile, '.json');
          const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 16);
          outputPath = path.join(path.dirname(inputFile), `${inputBasename}_enriched_${timestamp}.json`);
        }

        // Write enriched data to output file
        await fs.writeFile(outputPath, JSON.stringify(enrichedData, null, 2));

        console.log(chalk.green('\n📊 Enrichment Results:'));
        console.log(`   Total items: ${chalk.bold(this.countItemsInConfig(enrichedData))}`);
        console.log(`   Enriched items: ${chalk.bold(this.countEnrichedItemsInConfig(enrichedData))}`);
        console.log(`   Categories processed: ${chalk.bold(this.countCategoriesInConfig(enrichedData))}`);
        
        // Show main groups if generated
        if (!options.skipMainGroups && enrichedData.company_details?.global_configurations?.main_groups_definitions) {
          const mainGroups = enrichedData.company_details.global_configurations.main_groups_definitions;
          console.log(`   Main groups created: ${chalk.bold(mainGroups.length)}`);
          mainGroups.forEach((group, index) => {
            console.log(`     ${index + 1}. ${chalk.gray(group.main_group_names?.de || 'Unknown')}`);
          });
        }

        console.log(chalk.green(`\n💾 Enriched data saved: ${outputPath}`));

        console.log(chalk.green('\n✅ Enrichment completed successfully!'));
        console.log(chalk.gray('Next steps:'));
        console.log(chalk.gray('  1. Review the enriched configuration'));
        console.log(chalk.gray('  2. Import with: eckasse import-mdf ' + outputPath));
        console.log(chalk.gray('  3. Convert to other formats if needed'));
        
        // Graceful exit for successful enrichment
        await gracefulExit(0);

      } catch (enrichmentError) {
        spinner.fail('Enrichment failed');
        console.error(chalk.red(`\n❌ Enrichment error: ${enrichmentError.message}`));

        if (enrichmentError.message.includes('GEMINI_API_KEY') || enrichmentError.message.includes('API key')) {
          console.log(chalk.yellow('\n💡 Tip: Make sure your LLM API key is configured:'));
          console.log(chalk.gray('   export GEMINI_API_KEY=your_api_key'));
          console.log(chalk.gray('   Or add it to your .env file'));
        }

        await gracefulExit(1);
      }

    } catch (error) {
      console.error(chalk.red(`\n❌ Command failed: ${error.message}`));
      await gracefulExit(1);
    }
  }

  // Additional methods like menuWizard, interactiveCorrection, generateVectronExport, generateCSVExport would be implemented here
}

// Signal handlers for graceful shutdown
process.on('SIGINT', async () => {
  console.log(chalk.yellow('\n⚠️  Received interrupt signal. Cleaning up...'));
  await gracefulExit(130); // 128 + 2 (SIGINT)
});

process.on('SIGTERM', async () => {
  console.log(chalk.yellow('\n⚠️  Received termination signal. Cleaning up...'));
  await gracefulExit(143); // 128 + 15 (SIGTERM)
});

// Handle uncaught exceptions
process.on('uncaughtException', async (error) => {
  console.error(chalk.red('\n💥 Uncaught Exception:'), error);
  await gracefulExit(1);
});

process.on('unhandledRejection', async (reason, promise) => {
  console.error(chalk.red('\n💥 Unhandled Promise Rejection:'), reason);
  await gracefulExit(1);
});

// Initialize CLI if this file is run directly
if (require.main === module) {
  new EckasseCLI();
}

module.exports = EckasseCLI;