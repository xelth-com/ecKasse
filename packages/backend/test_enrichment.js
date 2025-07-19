#!/usr/bin/env node

/**
 * Test script for the enrichment service
 */

require('dotenv').config({ path: '../../.env' });
const { enrichMdfData } = require('./src/services/enrichment.service.js');
const fs = require('fs').promises;

async function testEnrichment() {
    console.log('🧪 Testing enrichment service...');
    
    try {
        // Read sample MDF file
        console.log('📖 Reading sample MDF file...');
        const sampleData = await fs.readFile('./test_sample_mdf.json', 'utf8');
        const mdfData = JSON.parse(sampleData);
        
        console.log('✅ Sample data loaded successfully');
        console.log(`   Items: ${countItems(mdfData)}`);
        console.log(`   Categories: ${countCategories(mdfData)}`);
        
        // Test enrichment with web search disabled (faster test)
        console.log('\n🔬 Testing enrichment with web search disabled...');
        
        const enrichmentOptions = {
            skipWebSearch: true,  // Skip for faster testing
            skipMainGroups: false // Test main groups generation
        };
        
        const enrichedData = await enrichMdfData(mdfData, enrichmentOptions);
        
        console.log('✅ Enrichment completed successfully!');
        
        // Verify enrichment results
        console.log('\n📊 Verifying enrichment results...');
        
        // Check if main groups were created
        const mainGroups = enrichedData.company_details?.global_configurations?.main_groups_definitions || [];
        console.log(`   Main groups created: ${mainGroups.length}`);
        if (mainGroups.length > 0) {
            console.log('   Main groups:');
            mainGroups.forEach((group, index) => {
                console.log(`     ${index + 1}. ${group.main_group_names?.de || 'Unknown'} (ID: ${group.main_group_unique_identifier})`);
            });
        }
        
        // Check if categories were assigned to main groups
        let categoriesAssigned = 0;
        for (const branch of enrichedData.company_details.branches || []) {
            for (const pos of branch.point_of_sale_devices || []) {
                for (const category of pos.categories_for_this_pos || []) {
                    if (category.default_linked_main_group_unique_identifier) {
                        categoriesAssigned++;
                        console.log(`     Category "${category.category_names?.de}" assigned to main group ID ${category.default_linked_main_group_unique_identifier}`);
                    }
                }
            }
        }
        console.log(`   Categories assigned to main groups: ${categoriesAssigned}`);
        
        // Check metadata
        const metadata = enrichedData.company_details.meta_information || {};
        console.log(`   Enriched at: ${metadata.enriched_at || 'Not set'}`);
        console.log(`   Enriched by: ${metadata.enriched_by || 'Not set'}`);
        
        // Save enriched data
        const outputPath = './test_sample_mdf.enriched.json';
        await fs.writeFile(outputPath, JSON.stringify(enrichedData, null, 2));
        console.log(`\n💾 Enriched data saved to: ${outputPath}`);
        
        console.log('\n✅ Test completed successfully!');
        
        // Test with full enrichment (if user wants to test with real API calls)
        const testFullEnrichment = process.argv.includes('--full');
        if (testFullEnrichment) {
            console.log('\n🌐 Testing full enrichment with web search...');
            
            const fullOptions = {
                skipWebSearch: false,
                skipMainGroups: false
            };
            
            const fullyEnrichedData = await enrichMdfData(mdfData, fullOptions);
            
            // Check if items were enriched with web data
            let itemsEnriched = 0;
            for (const branch of fullyEnrichedData.company_details.branches || []) {
                for (const pos of branch.point_of_sale_devices || []) {
                    for (const item of pos.items_for_this_pos || []) {
                        if (item.additional_item_attributes?.ai_enrichment) {
                            itemsEnriched++;
                            console.log(`     Item "${item.display_names?.menu?.de}" enriched with cuisine: ${item.additional_item_attributes.ai_enrichment.cuisine}`);
                        }
                    }
                }
            }
            console.log(`   Items enriched with web data: ${itemsEnriched}`);
            
            // Save fully enriched data
            const fullOutputPath = './test_sample_mdf.fully_enriched.json';
            await fs.writeFile(fullOutputPath, JSON.stringify(fullyEnrichedData, null, 2));
            console.log(`💾 Fully enriched data saved to: ${fullOutputPath}`);
        }
        
    } catch (error) {
        console.error('❌ Test failed:', error.message);
        console.error('Stack:', error.stack);
        process.exit(1);
    }
}

// Helper functions
function countItems(mdfData) {
    let count = 0;
    for (const branch of mdfData.company_details?.branches || []) {
        for (const pos of branch.point_of_sale_devices || []) {
            count += pos.items_for_this_pos?.length || 0;
        }
    }
    return count;
}

function countCategories(mdfData) {
    let count = 0;
    for (const branch of mdfData.company_details?.branches || []) {
        for (const pos of branch.point_of_sale_devices || []) {
            count += pos.categories_for_this_pos?.length || 0;
        }
    }
    return count;
}

// Run the test
testEnrichment();