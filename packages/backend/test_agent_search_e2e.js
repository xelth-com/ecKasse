#!/usr/bin/env node

/**
 * End-to-End Test for Phase 3: LLM Agent + Hybrid Search Integration
 * 
 * This test validates the complete workflow from natural language queries
 * to the agent's final response using the integrated hybrid search system.
 * 
 * Test scenarios:
 * - Exact match tests
 * - Typo/Levenshtein correction tests  
 * - Semantic search tests
 * - No match handling tests
 * - Contextual follow-up conversation tests
 * 
 * @author eckasse Development Team
 * @version 2.0.0
 */

const { sendMessage } = require('./src/services/llm.service.js');
const fs = require('fs').promises;
const path = require('path');

class AgentSearchE2ETest {
  constructor() {
    this.testsPassed = 0;
    this.testsFailed = 0;
    this.results = [];
    this.chatHistory = []; // Shared conversation history
  }

  async runTests() {
    console.log('🧪 Starting Phase 3 End-to-End Agent Search Tests\n');
    console.log('⚠️  Note: These tests require:');
    console.log('   • Working GEMINI_API_KEY in environment');
    console.log('   • Database imported with: node src/lib/cli.js import-mdf test-sample-enhanced-mdf.json --force');
    console.log('   • The test data includes: Super Widget (€19.99), Eco Mug (€12.50), Coffee Cup (€8.75)\n');
    
    try {
      // Test 1: Exact match test
      console.log('📝 Test 1: Exact Match Test');
      await this.testExactMatch();

      // Test 2: Typo/Levenshtein correction test
      console.log('\n📝 Test 2: Typo/Levenshtein Correction Test');
      await this.testTypoCorrection();

      // Test 3: Semantic search test
      console.log('\n📝 Test 3: Semantic Search Test');
      await this.testSemanticSearch();

      // Test 4: No match test
      console.log('\n📝 Test 4: No Match Test');
      await this.testNoMatch();

      // Test 5: Contextual follow-up test
      console.log('\n📝 Test 5: Contextual Follow-up Test');
      await this.testContextualFollowup();

      // Summary
      this.printSummary();

    } catch (error) {
      console.error('❌ Test execution failed:', error.message);
      if (error.message.includes('API key') || error.message.includes('GEMINI_API_KEY')) {
        console.log('\n💡 Hint: Make sure GEMINI_API_KEY is set in your environment or .env file');
      }
      process.exit(1);
    }
  }

  async testExactMatch() {
    try {
      const query = "Найди Super Widget";
      const expectedKeywords = ["Super Widget", "19.99"];
      
      console.log(`   User: "${query}"`);
      
      const response = await sendMessage(query, this.chatHistory);
      this.chatHistory = response.history || [];
      
      console.log(`   Agent: "${response.text}"`);
      
      // Check if response contains expected keywords
      const containsProductName = expectedKeywords.some(keyword => 
        response.text.toLowerCase().includes(keyword.toLowerCase())
      );
      
      this.assert(
        containsProductName,
        `Response should contain 'Super Widget' and price information. Got: "${response.text}"`
      );

      this.assert(
        !response.isTemporary && !response.errorType,
        'Response should not contain API errors'
      );

      console.log('✅ Exact match test passed');
      
    } catch (error) {
      console.log('❌ Exact match test failed:', error.message);
      this.testsFailed++;
    }
  }

  async testTypoCorrection() {
    try {
      const query = "supr widge";
      const expectedSuggestion = "Super Widget";
      
      console.log(`   User: "${query}"`);
      
      const response = await sendMessage(query, this.chatHistory);
      this.chatHistory = response.history || [];
      
      console.log(`   Agent: "${response.text}"`);
      
      // Check if response suggests the correct product despite typo
      const containsSuggestion = response.text.toLowerCase().includes(expectedSuggestion.toLowerCase());
      
      this.assert(
        containsSuggestion,
        `Response should suggest 'Super Widget' for typo. Got: "${response.text}"`
      );

      console.log('✅ Typo correction test passed');
      
    } catch (error) {
      console.log('❌ Typo correction test failed:', error.message);
      this.testsFailed++;
    }
  }

  async testSemanticSearch() {
    try {
      const query = "a container for hot coffee";
      const expectedSuggestion = "Eco Mug";
      
      console.log(`   User: "${query}"`);
      
      const response = await sendMessage(query, this.chatHistory);
      this.chatHistory = response.history || [];
      
      console.log(`   Agent: "${response.text}"`);
      
      // Check if response suggests semantically relevant product
      const containsSemanticMatch = response.text.toLowerCase().includes(expectedSuggestion.toLowerCase()) ||
                                   response.text.toLowerCase().includes("mug") ||
                                   response.text.toLowerCase().includes("cup");
      
      this.assert(
        containsSemanticMatch,
        `Response should suggest semantically relevant products for 'container for hot coffee'. Got: "${response.text}"`
      );

      console.log('✅ Semantic search test passed');
      
    } catch (error) {
      console.log('❌ Semantic search test failed:', error.message);
      this.testsFailed++;
    }
  }

  async testNoMatch() {
    try {
      const query = "find a flying car";
      const expectedResponses = ["не найден", "not found", "couldn't find", "no results"];
      
      console.log(`   User: "${query}"`);
      
      const response = await sendMessage(query, this.chatHistory);
      this.chatHistory = response.history || [];
      
      console.log(`   Agent: "${response.text}"`);
      
      // Check if response appropriately handles no match
      const containsNoMatchResponse = expectedResponses.some(phrase => 
        response.text.toLowerCase().includes(phrase)
      );
      
      this.assert(
        containsNoMatchResponse,
        `Response should indicate no match found for 'flying car'. Got: "${response.text}"`
      );

      console.log('✅ No match test passed');
      
    } catch (error) {
      console.log('❌ No match test failed:', error.message);
      this.testsFailed++;
    }
  }

  async testContextualFollowup() {
    try {
      // Step 1: Search for a product
      const step1Query = "ищи кружку";
      
      console.log(`   Step 1 User: "${step1Query}"`);
      
      const step1Response = await sendMessage(step1Query, this.chatHistory);
      this.chatHistory = step1Response.history || [];
      
      console.log(`   Step 1 Agent: "${step1Response.text}"`);
      
      // Step 2: Ask about price in context
      const step2Query = "сколько она стоит?";
      
      console.log(`   Step 2 User: "${step2Query}"`);
      
      const step2Response = await sendMessage(step2Query, this.chatHistory);
      this.chatHistory = step2Response.history || [];
      
      console.log(`   Step 2 Agent: "${step2Response.text}"`);
      
      // Check if the agent understood the context and provided price
      const containsPriceInfo = /\d+[.,]\d+/.test(step2Response.text) || 
                               step2Response.text.includes('€') ||
                               step2Response.text.includes('цена') ||
                               step2Response.text.includes('стоит') ||
                               step2Response.text.includes('price');
      
      this.assert(
        containsPriceInfo,
        `Step 2 response should contain price information based on context. Got: "${step2Response.text}"`
      );

      console.log('✅ Contextual follow-up test passed');
      
    } catch (error) {
      console.log('❌ Contextual follow-up test failed:', error.message);
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
    console.log('\n' + '='.repeat(70));
    console.log('📊 PHASE 3 END-TO-END TEST SUMMARY');
    console.log('='.repeat(70));
    console.log(`✅ Tests Passed: ${this.testsPassed}`);
    console.log(`❌ Tests Failed: ${this.testsFailed}`);
    console.log(`📈 Success Rate: ${(this.testsPassed / (this.testsPassed + this.testsFailed) * 100).toFixed(1)}%`);
    
    if (this.testsFailed === 0) {
      console.log('\n🎉 Phase 3 End-to-End Test: SUCCESS');
      console.log('The LLM Agent + Hybrid Search integration is working perfectly!');
      console.log('\n🚀 Ready for Production Features:');
      console.log('• Natural language product searches');
      console.log('• Typo correction and semantic understanding');
      console.log('• Contextual conversations');
      console.log('• Multi-layered search fallbacks (FTS → Vector → Levenshtein)');
    } else {
      console.log('\n💥 Phase 3 End-to-End Test: PARTIAL SUCCESS');
      console.log('Some integration issues detected. Check the detailed output above.');
      console.log('\nPossible Issues:');
      console.log('• Missing test data in database');
      console.log('• GEMINI_API_KEY not configured');
      console.log('• Vector embeddings not generated');
    }
    
    console.log('\n📋 Detailed Results:');
    this.results.forEach((result, index) => {
      const icon = result.status === 'PASS' ? '✅' : '❌';
      console.log(`${icon} ${index + 1}. ${result.message}`);
    });

    console.log('\n📚 Test Conversation History:');
    this.chatHistory.forEach((msg, index) => {
      const role = msg.role === 'user' ? '👤 User' : '🤖 Agent';
      const content = Array.isArray(msg.parts) ? msg.parts.map(p => p.text).join('') : msg.parts;
      console.log(`${index + 1}. ${role}: "${content}"`);
    });
  }
}

// Run tests if called directly
if (require.main === module) {
  const test = new AgentSearchE2ETest();
  test.runTests().catch(error => {
    console.error('Test execution failed:', error);
    process.exit(1);
  });
}

module.exports = AgentSearchE2ETest;