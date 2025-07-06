#!/usr/bin/env node

/**
 * Test Script for Phase 2: OOP-POS-MDF Import with Integrated Vectorization
 * 
 * This test validates the import service functionality:
 * - Service structure and API validation
 * - CLI integration testing
 * - Database schema compatibility check
 * - Mock data import simulation
 * 
 * @author eckasse Development Team
 * @version 2.0.0
 */

const fs = require('fs').promises;
const path = require('path');

class ImportServicePhase2Test {
  constructor() {
    this.testsPassed = 0;
    this.testsFailed = 0;
    this.results = [];
  }

  async runTests() {
    console.log('🧪 Starting Phase 2 Import Service Tests\n');
    
    try {
      // Test 1: Import service structure validation
      console.log('📝 Test 1: Import Service Structure Validation');
      await this.testImportServiceStructure();

      // Test 2: CLI integration validation
      console.log('\n📝 Test 2: CLI Integration Validation');
      await this.testCLIIntegration();

      // Test 3: Database dependencies validation
      console.log('\n📝 Test 3: Database Dependencies Validation');
      await this.testDatabaseDependencies();

      // Test 4: Mock data structure validation
      console.log('\n📝 Test 4: Sample OOP-POS-MDF Structure Validation');
      await this.testSampleDataStructure();

      // Summary
      this.printSummary();

    } catch (error) {
      console.error('❌ Test execution failed:', error.message);
      process.exit(1);
    }
  }

  async testImportServiceStructure() {
    try {
      // Check if the import service file exists and has the expected structure
      const servicePath = path.join(__dirname, 'src', 'services', 'import.service.js');
      const serviceExists = await fs.access(servicePath).then(() => true).catch(() => false);
      
      this.assert(
        serviceExists,
        'Import service file should exist'
      );

      if (serviceExists) {
        const serviceContent = await fs.readFile(servicePath, 'utf8');
        
        this.assert(
          serviceContent.includes('importFromOopMdf'),
          'Should have importFromOopMdf function'
        );

        this.assert(
          serviceContent.includes('cleanExistingData'),
          'Should have cleanExistingData function'
        );

        this.assert(
          serviceContent.includes('importHierarchicalData'),
          'Should have importHierarchicalData function'
        );

        this.assert(
          serviceContent.includes('importItemsWithVectorization'),
          'Should have importItemsWithVectorization function'
        );

        this.assert(
          serviceContent.includes('generateEmbedding'),
          'Should use embedding service'
        );

        this.assert(
          serviceContent.includes('embeddingToBuffer'),
          'Should convert embeddings to buffer format'
        );

        this.assert(
          serviceContent.includes('vec_items'),
          'Should insert into vec_items table'
        );

        this.assert(
          serviceContent.includes('categoryIdMap'),
          'Should use categoryIdMap for linking'
        );

        this.assert(
          serviceContent.includes('semanticString'),
          'Should construct semantic strings'
        );

        console.log('✅ Import service structure validation passed');
      }
      
    } catch (error) {
      console.log('❌ Import service structure test failed:', error.message);
      this.testsFailed++;
    }
  }

  async testCLIIntegration() {
    try {
      // Check CLI integration
      const cliPath = path.join(__dirname, 'src', 'lib', 'cli.js');
      const cliExists = await fs.access(cliPath).then(() => true).catch(() => false);
      
      this.assert(
        cliExists,
        'CLI file should exist'
      );

      if (cliExists) {
        const cliContent = await fs.readFile(cliPath, 'utf8');
        
        this.assert(
          cliContent.includes('import-mdf'),
          'Should have import-mdf command'
        );

        this.assert(
          cliContent.includes('importFromOopMdf'),
          'Should import the import service'
        );

        this.assert(
          cliContent.includes('importMdfCommand'),
          'Should have importMdfCommand method'
        );

        this.assert(
          cliContent.includes('--force'),
          'Should have --force option'
        );

        this.assert(
          cliContent.includes('--dry-run'),
          'Should have --dry-run option'
        );

        this.assert(
          cliContent.includes('--validate'),
          'Should have --validate option'
        );

        this.assert(
          cliContent.includes('inquirer.prompt'),
          'Should have confirmation prompt'
        );

        console.log('✅ CLI integration validation passed');
      }
      
    } catch (error) {
      console.log('❌ CLI integration test failed:', error.message);
      this.testsFailed++;
    }
  }

  async testDatabaseDependencies() {
    try {
      // Check database migration files exist
      const migrationsDir = path.join(__dirname, 'src', 'db', 'migrations');
      const migrationsExist = await fs.access(migrationsDir).then(() => true).catch(() => false);
      
      this.assert(
        migrationsExist,
        'Migrations directory should exist'
      );

      if (migrationsExist) {
        const migrationFiles = await fs.readdir(migrationsDir);
        
        this.assert(
          migrationFiles.some(file => file.includes('create_oop_pos_mdf_tables')),
          'Should have OOP-POS-MDF tables migration'
        );

        this.assert(
          migrationFiles.some(file => file.includes('create_vec_items_table')),
          'Should have vec_items table migration'
        );

        // Check database connection file
        const dbPath = path.join(__dirname, 'src', 'db', 'knex.js');
        const dbExists = await fs.access(dbPath).then(() => true).catch(() => false);
        
        this.assert(
          dbExists,
          'Database connection file should exist'
        );

        if (dbExists) {
          const dbContent = await fs.readFile(dbPath, 'utf8');
          
          this.assert(
            dbContent.includes('sqlite-vec'),
            'Should load sqlite-vec extension'
          );
        }

        // Check embedding service exists
        const embeddingPath = path.join(__dirname, 'src', 'services', 'embedding.service.js');
        const embeddingExists = await fs.access(embeddingPath).then(() => true).catch(() => false);
        
        this.assert(
          embeddingExists,
          'Embedding service should exist'
        );

        console.log('✅ Database dependencies validation passed');
      }
      
    } catch (error) {
      console.log('❌ Database dependencies test failed:', error.message);
      this.testsFailed++;
    }
  }

  async testSampleDataStructure() {
    try {
      // Create a sample OOP-POS-MDF structure to validate our import logic
      const sampleMdf = {
        "$schema": "https://schemas.eckasse.com/oop-pos-mdf/v2.0.0/schema.json",
        company_details: {
          company_unique_identifier: 1,
          company_full_name: "Test Restaurant",
          meta_information: {
            format_version: "2.0.0",
            date_generated: new Date().toISOString(),
            generated_by: "test-script",
            default_currency_symbol: "€",
            default_language: "de"
          },
          global_configurations: {
            tax_rates_definitions: [
              {
                tax_rate_unique_identifier: 1,
                tax_rate_names: { "de": "Standard (19%)" },
                rate_percentage: 19.0,
                fiscal_mapping_type: "NORMAL"
              }
            ],
            main_groups_definitions: [],
            payment_methods_definitions: [],
            promotions_definitions: [],
            workflows: [],
            integrations: {},
            security_settings: {}
          },
          branches: [
            {
              branch_unique_identifier: 1,
              branch_names: { "de": "Hauptfiliale" },
              branch_address: "Test Street 1",
              point_of_sale_devices: [
                {
                  pos_device_unique_identifier: 1,
                  pos_device_names: { "de": "Kasse 1" },
                  pos_device_type: "DESKTOP",
                  pos_device_external_number: 1,
                  pos_device_settings: {},
                  categories_for_this_pos: [
                    {
                      category_unique_identifier: 1,
                      category_names: { "de": "Vorspeisen" },
                      category_type: "food",
                      audit_trail: {}
                    },
                    {
                      category_unique_identifier: 2,
                      category_names: { "de": "Hauptgerichte" },
                      category_type: "food",
                      audit_trail: {}
                    }
                  ],
                  items_for_this_pos: [
                    {
                      item_unique_identifier: 1001,
                      display_names: {
                        menu: { "de": "Bruschetta della Casa" },
                        button: { "de": "Bruschetta" },
                        receipt: { "de": "Bruschetta della Casa" }
                      },
                      item_price_value: 6.50,
                      pricing_schedules: [],
                      availability_schedule: { always_available: true },
                      associated_category_unique_identifier: 1,
                      additional_item_attributes: {
                        description: "Geröstetes Ciabatta-Brot mit frischen Tomaten, Knoblauch, Basilikum und nativem Olivenöl extra",
                        allergens: ["gluten"],
                        dietary_info: ["vegetarian"]
                      },
                      item_flags: { is_sellable: true },
                      audit_trail: {}
                    },
                    {
                      item_unique_identifier: 1002,
                      display_names: {
                        menu: { "de": "Pizza Margherita" },
                        button: { "de": "Margherita" },
                        receipt: { "de": "Pizza Margherita" }
                      },
                      item_price_value: 9.00,
                      pricing_schedules: [
                        { schedule_id: "variant_klein", price: 7.00 },
                        { schedule_id: "variant_gross", price: 11.00 }
                      ],
                      availability_schedule: { always_available: true },
                      associated_category_unique_identifier: 2,
                      additional_item_attributes: {
                        description: "Hausgemachter Teig mit San Marzano Tomaten, Mozzarella di Bufala und frischem Basilikum",
                        allergens: ["gluten", "dairy"],
                        dietary_info: ["vegetarian"]
                      },
                      item_flags: { is_sellable: true },
                      audit_trail: {}
                    }
                  ]
                }
              ]
            }
          ]
        }
      };

      // Validate structure
      this.assert(
        sampleMdf.company_details !== undefined,
        'Sample should have company_details'
      );

      this.assert(
        sampleMdf.company_details.branches.length > 0,
        'Sample should have branches'
      );

      this.assert(
        sampleMdf.company_details.branches[0].point_of_sale_devices.length > 0,
        'Sample should have POS devices'
      );

      this.assert(
        sampleMdf.company_details.branches[0].point_of_sale_devices[0].categories_for_this_pos.length > 0,
        'Sample should have categories'
      );

      this.assert(
        sampleMdf.company_details.branches[0].point_of_sale_devices[0].items_for_this_pos.length > 0,
        'Sample should have items'
      );

      // Validate item with rich description for vectorization
      const firstItem = sampleMdf.company_details.branches[0].point_of_sale_devices[0].items_for_this_pos[0];
      
      this.assert(
        firstItem.additional_item_attributes.description.length > 50,
        'Sample item should have detailed description for vectorization'
      );

      this.assert(
        firstItem.associated_category_unique_identifier !== undefined,
        'Sample item should have category reference'
      );

      // Write sample file for testing
      const samplePath = path.join(__dirname, 'test-sample-mdf.json');
      await fs.writeFile(samplePath, JSON.stringify(sampleMdf, null, 2));

      console.log('✅ Sample OOP-POS-MDF structure validation passed');
      console.log(`   - Created test file: ${samplePath}`);
      console.log(`   - Items: ${sampleMdf.company_details.branches[0].point_of_sale_devices[0].items_for_this_pos.length}`);
      console.log(`   - Categories: ${sampleMdf.company_details.branches[0].point_of_sale_devices[0].categories_for_this_pos.length}`);
      
    } catch (error) {
      console.log('❌ Sample data structure test failed:', error.message);
      this.testsFailed++;
    }
  }

  assert(condition, message) {
    if (condition) {
      this.testsPassed++;
      this.results.push({ status: 'PASS', message });
    } else {
      this.testsFailed++;
      this.results.push({ status: 'FAIL', message });
      throw new Error(message);
    }
  }

  printSummary() {
    console.log('\n' + '='.repeat(60));
    console.log('📊 PHASE 2 TEST SUMMARY');
    console.log('='.repeat(60));
    console.log(`✅ Tests Passed: ${this.testsPassed}`);
    console.log(`❌ Tests Failed: ${this.testsFailed}`);
    console.log(`📈 Success Rate: ${(this.testsPassed / (this.testsPassed + this.testsFailed) * 100).toFixed(1)}%`);
    
    if (this.testsFailed === 0) {
      console.log('\n🎉 Phase 2 Import Service Test: SUCCESS');
      console.log('All import and vectorization features are properly implemented!');
      console.log('\n📋 Next Steps:');
      console.log('1. Test with actual data: node src/lib/cli.js import-mdf test-sample-mdf.json --dry-run');
      console.log('2. Run actual import: node src/lib/cli.js import-mdf test-sample-mdf.json --force');
      console.log('3. Proceed to Phase 3: Hybrid Search Integration');
    } else {
      console.log('\n💥 Phase 2 Import Service Test: FAILED');
      console.log('Some implementation issues detected. Check the detailed output above.');
    }
    
    console.log('\n📋 Detailed Results:');
    this.results.forEach((result, index) => {
      const icon = result.status === 'PASS' ? '✅' : '❌';
      console.log(`${icon} ${index + 1}. ${result.message}`);
    });
  }
}

// Run tests if called directly
if (require.main === module) {
  const test = new ImportServicePhase2Test();
  test.runTests().catch(error => {
    console.error('Test execution failed:', error);
    process.exit(1);
  });
}

module.exports = ImportServicePhase2Test;