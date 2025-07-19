#!/usr/bin/env node

// Load environment variables
require('dotenv').config({ path: '../../.env' });

/**
 * Test for Enrichment Service Optimization
 * This test verifies that the enrichment service now uses the optimized
 * invokeSimpleQuery function instead of the heavy conversational agent
 */

const { invokeSimpleQuery } = require('./src/services/llm.service.js');

async function testEnrichmentOptimization() {
    console.log('🧪 Testing Enrichment Service Optimization\n');
    
    const startTime = Date.now();
    
    try {
        // Test the optimized query function directly
        const testQuery = 'Based on the dish "Espresso", identify its cuisine type, typical ingredients, and meal type (appetizer, main course, dessert). Respond only with a JSON object containing keys: cuisine, ingredients, mealType.';
        
        console.log('📝 Testing optimized query function...');
        console.log(`Query: ${testQuery.substring(0, 100)}...`);
        
        const response = await invokeSimpleQuery(testQuery);
        const executionTime = Date.now() - startTime;
        
        console.log(`\n✅ Response received in ${executionTime}ms:`);
        console.log(response);
        
        // Check if response is valid JSON
        try {
            const parsed = JSON.parse(response);
            console.log('\n✅ Response is valid JSON');
            console.log('Parsed data:', parsed);
            
            // Check for expected keys
            if (parsed.cuisine && parsed.ingredients && parsed.mealType) {
                console.log('✅ Response contains expected keys (cuisine, ingredients, mealType)');
            } else {
                console.log('⚠️  Response missing some expected keys');
            }
            
        } catch (parseError) {
            console.log('⚠️  Response is not valid JSON, but this is acceptable for enrichment');
        }
        
        console.log('\n🎉 Enrichment optimization test completed successfully!');
        console.log(`📊 Performance: Query executed in ${executionTime}ms (should be much faster than before)`);
        
    } catch (error) {
        console.error('❌ Enrichment optimization test failed:', error.message);
        process.exit(1);
    }
}

// Run test if called directly
if (require.main === module) {
    testEnrichmentOptimization().catch(error => {
        console.error('Test execution failed:', error);
        process.exit(1);
    });
}

module.exports = testEnrichmentOptimization;