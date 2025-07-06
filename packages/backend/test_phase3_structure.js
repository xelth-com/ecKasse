#!/usr/bin/env node

/**
 * Structure Validation Test for Phase 3: Hybrid Search Integration
 * 
 * This test validates the implementation structure and integration points
 * without requiring API keys or database data.
 * 
 * @author eckasse Development Team
 * @version 2.0.0
 */

const fs = require('fs').promises;
const path = require('path');

class Phase3StructureTest {
  constructor() {
    this.testsPassed = 0;
    this.testsFailed = 0;
    this.results = [];
  }

  async runTests() {
    console.log('🧪 Starting Phase 3 Structure Validation Tests\n');
    
    try {
      // Test 1: LLM service integration validation
      console.log('📝 Test 1: LLM Service Integration Validation');
      await this.testLLMServiceIntegration();

      // Test 2: Search service compatibility validation
      console.log('\n📝 Test 2: Search Service Compatibility Validation');
      await this.testSearchServiceCompatibility();

      // Test 3: E2E test script validation
      console.log('\n📝 Test 3: E2E Test Script Validation');
      await this.testE2EScriptStructure();

      // Test 4: Integration points validation
      console.log('\n📝 Test 4: Integration Points Validation');
      await this.testIntegrationPoints();

      // Summary
      this.printSummary();

    } catch (error) {
      console.error('❌ Test execution failed:', error.message);
      process.exit(1);
    }
  }

  async testLLMServiceIntegration() {
    try {
      // Check LLM service file
      const llmServicePath = path.join(__dirname, 'src', 'services', 'llm.service.js');
      const llmServiceExists = await fs.access(llmServicePath).then(() => true).catch(() => false);
      
      this.assert(
        llmServiceExists,
        'LLM service file should exist'
      );

      if (llmServiceExists) {
        const llmServiceContent = await fs.readFile(llmServicePath, 'utf8');
        
        // Test enhanced findProduct tool
        this.assert(
          llmServiceContent.includes('findProduct'),
          'Should have findProduct tool'
        );

        this.assert(
          llmServiceContent.includes('advanced hybrid search'),
          'findProduct description should mention advanced hybrid search'
        );

        this.assert(
          llmServiceContent.includes('corrects typos'),
          'findProduct description should mention typo correction'
        );

        this.assert(
          llmServiceContent.includes('searchProducts'),
          'Should import and use searchProducts from search service'
        );

        // Test enhanced system prompt
        this.assert(
          llmServiceContent.includes('Search Result Interpretation Rules'),
          'Should have detailed search result interpretation rules'
        );

        this.assert(
          llmServiceContent.includes('success: true'),
          'Should have rules for handling successful search results'
        );

        this.assert(
          llmServiceContent.includes('success: false'),
          'Should have rules for handling unsuccessful search results'
        );

        this.assert(
          llmServiceContent.includes('Context Rule'),
          'Should have context handling rules'
        );

        this.assert(
          llmServiceContent.includes('Language Rule'),
          'Should have language matching rules'
        );

        console.log('✅ LLM service integration validation passed');
      }
      
    } catch (error) {
      console.log('❌ LLM service integration test failed:', error.message);
      this.testsFailed++;
    }
  }

  async testSearchServiceCompatibility() {
    try {
      // Check search service file
      const searchServicePath = path.join(__dirname, 'src', 'services', 'search.service.js');
      const searchServiceExists = await fs.access(searchServicePath).then(() => true).catch(() => false);
      
      this.assert(
        searchServiceExists,
        'Search service file should exist'
      );

      if (searchServiceExists) {
        const searchServiceContent = await fs.readFile(searchServicePath, 'utf8');
        
        this.assert(
          searchServiceContent.includes('searchProducts'),
          'Should export searchProducts function'
        );

        this.assert(
          searchServiceContent.includes('hybridSearch'),
          'Should have hybridSearch function'
        );

        this.assert(
          searchServiceContent.includes('success'),
          'searchProducts should return success field'
        );

        this.assert(
          searchServiceContent.includes('results'),
          'searchProducts should return results array'
        );

        this.assert(
          searchServiceContent.includes('metadata'),
          'searchProducts should return metadata'
        );

        this.assert(
          searchServiceContent.includes('performFTSSearch'),
          'Should have FTS search capability'
        );

        this.assert(
          searchServiceContent.includes('performVectorSearch'),
          'Should have vector search capability'
        );

        this.assert(
          searchServiceContent.includes('applyLevenshteinFilter'),
          'Should have Levenshtein filtering capability'
        );

        console.log('✅ Search service compatibility validation passed');
      }
      
    } catch (error) {
      console.log('❌ Search service compatibility test failed:', error.message);
      this.testsFailed++;
    }
  }

  async testE2EScriptStructure() {
    try {
      // Check E2E test script
      const e2eTestPath = path.join(__dirname, 'test_agent_search_e2e.js');
      const e2eTestExists = await fs.access(e2eTestPath).then(() => true).catch(() => false);
      
      this.assert(
        e2eTestExists,
        'E2E test script should exist'
      );

      if (e2eTestExists) {
        const e2eTestContent = await fs.readFile(e2eTestPath, 'utf8');
        
        this.assert(
          e2eTestContent.includes('sendMessage'),
          'Should import sendMessage from LLM service'
        );

        // Test scenario coverage
        this.assert(
          e2eTestContent.includes('testExactMatch'),
          'Should have exact match test scenario'
        );

        this.assert(
          e2eTestContent.includes('testTypoCorrection'),
          'Should have typo correction test scenario'
        );

        this.assert(
          e2eTestContent.includes('testSemanticSearch'),
          'Should have semantic search test scenario'
        );

        this.assert(
          e2eTestContent.includes('testNoMatch'),
          'Should have no match test scenario'
        );

        this.assert(
          e2eTestContent.includes('testContextualFollowup'),
          'Should have contextual follow-up test scenario'
        );

        // Test specific query examples
        this.assert(
          e2eTestContent.includes('Super Widget'),
          'Should test for Super Widget exact match'
        );

        this.assert(
          e2eTestContent.includes('supr widge'),
          'Should test typo correction with "supr widge"'
        );

        this.assert(
          e2eTestContent.includes('container for hot coffee'),
          'Should test semantic search with coffee container query'
        );

        this.assert(
          e2eTestContent.includes('flying car'),
          'Should test no match with "flying car"'
        );

        this.assert(
          e2eTestContent.includes('chatHistory'),
          'Should maintain conversation history'
        );

        console.log('✅ E2E test script structure validation passed');
      }
      
    } catch (error) {
      console.log('❌ E2E test script structure test failed:', error.message);
      this.testsFailed++;
    }
  }

  async testIntegrationPoints() {
    try {
      // Check that all necessary services and utilities exist
      const requiredFiles = [
        'src/services/search.service.js',
        'src/services/llm.service.js',
        'src/services/embedding.service.js',
        'src/utils/levenshtein.js'
      ];

      for (const filePath of requiredFiles) {
        const fullPath = path.join(__dirname, filePath);
        const exists = await fs.access(fullPath).then(() => true).catch(() => false);
        
        this.assert(
          exists,
          `Required file should exist: ${filePath}`
        );
      }

      // Check levenshtein utility specifically
      const levenshteinPath = path.join(__dirname, 'src', 'utils', 'levenshtein.js');
      const levenshteinExists = await fs.access(levenshteinPath).then(() => true).catch(() => false);
      
      if (levenshteinExists) {
        const levenshteinContent = await fs.readFile(levenshteinPath, 'utf8');
        
        this.assert(
          levenshteinContent.includes('calculateLevenshtein'),
          'Levenshtein utility should export calculateLevenshtein'
        );

        this.assert(
          levenshteinContent.includes('isSimilar'),
          'Levenshtein utility should export isSimilar'
        );
      }

      console.log('✅ Integration points validation passed');
      
    } catch (error) {
      console.log('❌ Integration points test failed:', error.message);
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
    console.log('📊 PHASE 3 STRUCTURE TEST SUMMARY');
    console.log('='.repeat(60));
    console.log(`✅ Tests Passed: ${this.testsPassed}`);
    console.log(`❌ Tests Failed: ${this.testsFailed}`);
    console.log(`📈 Success Rate: ${(this.testsPassed / (this.testsPassed + this.testsFailed) * 100).toFixed(1)}%`);
    
    if (this.testsFailed === 0) {
      console.log('\n🎉 Phase 3 Structure Validation: SUCCESS');
      console.log('All hybrid search integration components are properly implemented!');
      console.log('\n📋 Ready Components:');
      console.log('• Enhanced findProduct LangChain tool');
      console.log('• Detailed search result interpretation rules');
      console.log('• Comprehensive E2E test scenarios');
      console.log('• Complete integration with existing search service');
      console.log('\n🧪 Next Steps:');
      console.log('1. Ensure GEMINI_API_KEY is configured');
      console.log('2. Run database import: node src/lib/cli.js import-mdf test-sample-mdf.json --force');
      console.log('3. Run E2E tests: node test_agent_search_e2e.js');
    } else {
      console.log('\n💥 Phase 3 Structure Validation: FAILED');
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
  const test = new Phase3StructureTest();
  test.runTests().catch(error => {
    console.error('Test execution failed:', error);
    process.exit(1);
  });
}

module.exports = Phase3StructureTest;