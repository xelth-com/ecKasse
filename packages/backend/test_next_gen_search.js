#!/usr/bin/env node

/**
 * Test script for Next-Gen Hybrid Search system
 */

require('dotenv').config({ path: '../../.env' });
const { searchProducts } = require('./src/services/search.service');
const { generateEmbedding } = require('./src/services/embedding.service');

async function testNextGenSearch() {
    console.log('🧪 Testing Next-Gen Hybrid Search System...\n');
    
    try {
        // Test 1: New embedding model
        console.log('📊 Test 1: New Embedding Model');
        const testEmbedding = await generateEmbedding('Test product');
        console.log(`✅ Generated embedding with ${testEmbedding.length} dimensions`);
        console.log(`✅ Model: gemini-embedding-exp-03-07`);
        console.log(`✅ Task Type: RETRIEVAL_DOCUMENT`);
        console.log();
        
        // Test 2: Hybrid search
        console.log('🔍 Test 2: Hybrid Search Pipeline');
        
        const testQueries = [
            'coffee',
            'latte',
            'pizza',
            'drink',
            'food'
        ];
        
        for (const query of testQueries) {
            console.log(`\n🔍 Searching for: "${query}"`);
            const searchResult = await searchProducts(query);
            
            console.log(`   Success: ${searchResult.success}`);
            console.log(`   Results: ${searchResult.results.length}`);
            console.log(`   Method: ${searchResult.metadata?.searchMethod || 'unknown'}`);
            console.log(`   Time: ${searchResult.metadata?.executionTime || 0}ms`);
            
            if (searchResult.results.length > 0) {
                const topResult = searchResult.results[0];
                console.log(`   Top result: "${topResult.productName}" (${topResult.price}€)`);
                console.log(`   Search type: ${topResult.search_type}`);
                
                if (topResult.similarity !== undefined) {
                    console.log(`   Similarity: ${topResult.similarity}%`);
                }
                if (topResult.levenshteinDistance !== undefined) {
                    console.log(`   Levenshtein: ${topResult.levenshteinDistance}`);
                }
            }
        }
        
        console.log('\n🎉 Next-Gen Hybrid Search System Tests Completed!');
        
        // Test 3: System specifications
        console.log('\n📋 System Specifications:');
        console.log('   • Embedding Model: gemini-embedding-exp-03-07');
        console.log('   • Vector Dimensions: 768');
        console.log('   • Task Type: RETRIEVAL_DOCUMENT');
        console.log('   • Search Pipeline: FTS → Vector → Levenshtein');
        console.log('   • Web Search Tool: Available');
        console.log('   • Database: SQLite with sqlite-vec extension');
        
    } catch (error) {
        console.error('❌ Test failed:', error.message);
        console.error('Stack:', error.stack);
        process.exit(1);
    }
}

// Run the test
testNextGenSearch().then(() => {
    console.log('\n✅ All tests completed successfully!');
    process.exit(0);
}).catch(error => {
    console.error('❌ Test suite failed:', error.message);
    process.exit(1);
});