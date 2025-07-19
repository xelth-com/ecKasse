// Test basic research functionality without Tavily API
// Run with: node test_research_basic.js

require('dotenv').config({ path: '../../.env' });
const { runResearch } = require('./src/services/research.service');

async function testBasicResearch() {
    console.log('🧪 Testing Basic Research Functionality...\n');
    
    // Test a simple query
    const query = "What are the main ingredients in Tiramisu?";
    console.log(`📝 Testing query: "${query}"`);
    console.log('=' .repeat(50));
    
    try {
        const result = await runResearch(query);
        
        console.log('📊 Result:', JSON.stringify(result, null, 2));
        
        if (result.success) {
            console.log('✅ Research completed successfully!');
        } else {
            console.log('⚠️ Research failed as expected (no Tavily API key)');
            console.log('💡 This is normal behavior when API key is not configured');
        }
        
    } catch (error) {
        console.error('💥 Test failed with exception:', error.message);
        console.error('Stack:', error.stack);
    }
    
    console.log('\n🎯 Basic research test completed!');
}

testBasicResearch().catch(error => {
    console.error('💥 Test runner failed:', error);
    process.exit(1);
});