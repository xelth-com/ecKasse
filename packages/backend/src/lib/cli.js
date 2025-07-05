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

const fs = require('fs');
const path = require('path');
const { program } = require('commander');
const Ajv = require('ajv');
const addFormats = require('ajv-formats');
const chalk = require('chalk');
const inquirer = require('inquirer');
const ora = require('ora');

// Import Menu Parser LLM
const MenuParserLLM = require('../lib/menu_parser_llm.js');

// Import your new Vectron Converter
const VectronConverter = require('../lib/converters/vectron.js');

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
      .action((file, options) => {
        // Принудительно устанавливаем schemaVersion в 2.0.0
        if (options.schema !== '2.0.0') {
            console.warn(chalk.yellow('⚠️  Only schema v2.0.0 is supported. Validating against v2.0.0.'));
            options.schema = '2.0.0';
        }
        this.validateConfig(file, options);
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
      .action((options) => {
          // Принудительно устанавливаем version в 2.0.0
        if (options.version !== '2.0.0') {
            console.warn(chalk.yellow('⚠️  Only schema v2.0.0 is supported for generation. Generating v2.0.0.'));
            options.version = '2.0.0';
        }
        this.generateConfig(options);
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
      .action((file, options) => {
        this.convertConfig(file, options);
      });

    // Info command
    program
      .command('info <file>')
      .description('Show information about a configuration file (v2.0.0)')
      .action((file) => {
        this.showConfigInfo(file);
      });

    // Interactive setup
    program
      .command('setup')
      .description('Interactive setup wizard for new configuration (v2.0.0)')
      .action(() => {
        this.interactiveSetup();
      });

    // Parse menu command (from menu_parser_cli.js)
    program
      .command('parse-menu <input>')
      .description('Parse restaurant menu from image, PDF, or text file using LLM into v2.0.0 format')
      .option('-o, --output <file>', 'Output configuration file', 'parsed-menu.json')
      .option('-t, --business-type <type>', 'Business type (restaurant, cafe, bar, fastfood)', 'restaurant')
      .option('-l, --language <lang>', 'Primary language', 'de')
      .option('--languages <langs>', 'Supported languages (comma-separated)', 'de,en')
      .option('--restaurant-name <name>', 'Restaurant name override')
      .option('--vectron', 'Generate Vectron import file after parsing')
      .option('--csv', 'Generate CSV export after parsing')
      .option('--validate', 'Validate generated configuration')
      .option('--interactive', 'Interactive mode for corrections if confidence is low')
      .option('--confidence-threshold <threshold>', 'Minimum confidence threshold (0.0-1.0)', '0.7')
      .option('--llm-provider <provider>', 'Preferred LLM provider (gemini, openai, anthropic)', 'gemini')
      .action(async (input, options) => {
        await this.parseMenuCommand(input, options);
      });

    // Interactive menu wizard (from menu_parser_cli.js)
    program
      .command('menu-wizard')
      .description('Interactive wizard for menu parsing and configuration into v2.0.0 format')
      .action(async () => {
        await this.menuWizard();
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
      const schemaContent = fs.readFileSync(schemaPath, 'utf8');
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
      const configContent = fs.readFileSync(filePath, 'utf8');
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
   * Migrate configuration (УДАЛЕНО из класса)
   */

  /**
   * Generate sample configuration
   * (Always generates v2.0.0)
   */
  generateConfig(options) {
    console.log(chalk.blue(`✨ Generating sample ${options.type} configuration (v${options.version})...`));
    try {
      const sampleConfig = this.createSampleConfig(options.type, options.version);
      fs.writeFileSync(options.output, JSON.stringify(sampleConfig, null, 2));
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
            created_by: "eckasse-cli-v2.0.0",
            last_modified_at: timestamp,
            last_modified_by: "eckasse-cli-v2.0.0",
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
  convertConfig(file, options) {
    console.log(chalk.blue(`🔄 Converting ${file} to ${options.format}...`));
    try {
      const configContent = fs.readFileSync(file, 'utf8');
      const config = JSON.parse(configContent);

      let outputContent;
      let outputPath = options.output;
      let conversionResult;

      switch (options.format.toLowerCase()) {
        case 'vectron':
          const vectronConverter = new VectronConverter();
          
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

      fs.writeFileSync(outputPath, outputContent);
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
  async parseMenuCommand(input, options) {
    console.log(chalk.blue('🍽️  eckasse Menu Parser v2.0.0\n'));
    const spinner = ora('Initializing menu parser...').start();

    try {
      if (typeof input === 'string') {
        await fs.access(input);
      }

      const parser = new MenuParserLLM({
        businessType: options.businessType,
        defaultLanguage: options.language,
        supportedLanguages: options.languages.split(','),
        enableValidation: options.validate,
        llmProvider: options.llmProvider
      });
      spinner.text = 'Extracting text from menu...';

      const parseOptions = {
        businessType: options.businessType,
        language: options.language,
        restaurantName: options.restaurantName
      };
      const result = await parser.parseMenu(input, parseOptions);

      spinner.succeed('Menu parsed successfully!');

      console.log(chalk.green('\n📊 Parsing Results:'));
      console.log(`   Items found: ${chalk.bold(result.metadata.itemsFound)}`);
      console.log(`   Categories: ${chalk.bold(result.metadata.categoriesFound)}`);
      console.log(`   Confidence: ${chalk.bold((result.metadata.confidence * 100).toFixed(1))}%`);
      console.log(`   Language: ${chalk.bold(result.metadata.language)}`);

      if (result.metadata.confidence < parseFloat(options.confidenceThreshold)) {
        console.log(chalk.yellow(`\n⚠️  Warning: Confidence below threshold (${options.confidenceThreshold})`));
        if (options.interactive) {
          const { proceed } = await inquirer.prompt([{
            type: 'confirm',
            name: 'proceed',
            message: 'Confidence is low. Do you want to review and correct the results?',
            default: true
          }]);
          if (proceed) {
            await this.interactiveCorrection(result.configuration);
          }
        }
      }

      await fs.writeFile(options.output, JSON.stringify(result.configuration, null, 2));
      console.log(chalk.green(`\n💾 Configuration saved: ${options.output}`));

      if (options.vectron) {
        await this.generateVectronExport(result.configuration, options.output);
      }

      if (options.csv) {
        await this.generateCSVExport(result.configuration, options.output);
      }

      if (options.validate) {
        await this.validateConfiguration(result.configuration);
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

  // ... (остальные методы menuWizard, interactiveCorrection, generateVectronExport, generateCSVExport, validateConfiguration остаются такими же, как в предыдущем ответе)
}

// Initialize CLI if this file is run directly
if (require.main === module) {
  new EckasseCLI();
}

module.exports = EckasseCLI;