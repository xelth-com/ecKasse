// File: /packages/backend/src/scripts/testHybridSearch.js

const { searchProducts, hybridSearch } = require('../services/search.service');
const db = require('../db/knex');

async function testHybridSearch() {
  console.log('🧪 Testing Hybrid Search System\n');
  
  try {
    // Test cases for different search scenarios
    const testCases = [
      {
        name: 'Exact FTS Match',
        query: 'Super Widget',
        expected: 'Should find exact match via FTS'
      },
      {
        name: 'Partial FTS Match',
        query: 'Widget',
        expected: 'Should find partial match via FTS'
      },
      {
        name: 'Semantic Vector Search',
        query: 'amazing product',
        expected: 'Should find semantic match via vector search'
      },
      {
        name: 'Typo Correction',
        query: 'Supr Widge',
        expected: 'Should correct typos and find match'
      },
      {
        name: 'Cup/Mug Semantic',
        query: 'cup',
        expected: 'Should find Eco Mug via semantic search'
      },
      {
        name: 'Non-existent Product',
        query: 'flying car',
        expected: 'Should return no results or suggestions'
      }
    ];

    for (const testCase of testCases) {
      console.log(`\n📋 Test: ${testCase.name}`);
      console.log(`🔍 Query: "${testCase.query}"`);
      console.log(`📝 Expected: ${testCase.expected}`);
      console.log('─'.repeat(50));
      
      const startTime = Date.now();
      const result = await searchProducts(testCase.query);
      const endTime = Date.now();
      
      console.log(`✅ Success: ${result.success}`);
      console.log(`💬 Message: ${result.message}`);
      console.log(`🔧 Method: ${result.metadata?.searchMethod || 'unknown'}`);
      console.log(`⏱️  Time: ${endTime - startTime}ms`);
      
      if (result.results && result.results.length > 0) {
        console.log(`📊 Results (${result.results.length}):`);
        result.results.forEach((item, index) => {
          console.log(`  ${index + 1}. ${item.productName} - ${item.price}€`);
          if (item.similarity) console.log(`     Similarity: ${item.similarity}%`);
          if (item.levenshteinDistance !== undefined) {
            console.log(`     Edit Distance: ${item.levenshteinDistance}`);
          }
        });
      }
      
      console.log('─'.repeat(50));
    }

    // Test direct hybrid search with different options
    console.log('\n🔬 Testing Direct Hybrid Search Options\n');
    
    const advancedTests = [
      {
        name: 'FTS Only Mode',
        query: 'Widget',
        options: { ftsOnly: true }
      },
      {
        name: 'Vector Only Mode', 
        query: 'cup',
        options: { vectorOnly: true }
      },
      {
        name: 'Strict Levenshtein',
        query: 'Widge',
        options: { levenshteinThreshold: 1 }
      },
      {
        name: 'Loose Vector Distance',
        query: 'beverage container',
        options: { vectorDistanceThreshold: 0.9 }
      }
    ];

    for (const test of advancedTests) {
      console.log(`\n🎯 Advanced Test: ${test.name}`);
      console.log(`🔍 Query: "${test.query}"`);
      console.log(`⚙️  Options: ${JSON.stringify(test.options)}`);
      console.log('─'.repeat(40));
      
      const result = await hybridSearch(test.query, test.options);
      
      console.log(`🔧 Method: ${result.metadata.searchMethod}`);
      console.log(`⏱️  Time: ${result.metadata.executionTime}ms`);
      console.log(`📊 Results: ${result.results.length}`);
      
      if (result.results.length > 0) {
        result.results.slice(0, 2).forEach((item, index) => {
          console.log(`  ${index + 1}. ${item.productName} (${item.search_type})`);
        });
      }
      console.log('─'.repeat(40));
    }

    console.log('\n✅ Hybrid Search Testing Completed Successfully!');
    
  } catch (error) {
    console.error('❌ Error during testing:', error);
    throw error;
  } finally {
    await db.destroy();
  }
}

// Run tests if this script is executed directly
if (require.main === module) {
  testHybridSearch()
    .then(() => process.exit(0))
    .catch(error => {
      console.error('Test failed:', error);
      process.exit(1);
    });
}

module.exports = testHybridSearch;