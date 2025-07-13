// Test script to validate the research service structure
// Run with: node test_research_structure.js

require('dotenv').config({ path: '../../.env' });
console.log('🧪 Testing Research Service Structure...\n');

try {
    // Test basic imports
    console.log('📦 Testing imports...');
    const { runResearch } = require('./src/services/research.service');
    console.log('✅ research.service.js imports successfully');
    
    // Test LLM service integration
    const { sendMessage } = require('./src/services/llm.service');
    console.log('✅ llm.service.js imports successfully');
    
    // Test function signatures
    console.log('\n🔍 Testing function signatures...');
    console.log('runResearch type:', typeof runResearch);
    console.log('sendMessage type:', typeof sendMessage);
    
    if (typeof runResearch === 'function') {
        console.log('✅ runResearch is a function');
    } else {
        console.log('❌ runResearch is not a function');
    }
    
    if (typeof sendMessage === 'function') {
        console.log('✅ sendMessage is a function');
    } else {
        console.log('❌ sendMessage is not a function');
    }
    
    console.log('\n🎯 Structure validation completed successfully!');
    console.log('\n📋 Next steps:');
    console.log('1. Add your Tavily API key to .env file');
    console.log('2. Test with: node test_research_agent.js');
    console.log('3. Or test through the main application');
    
} catch (error) {
    console.error('💥 Structure validation failed:', error.message);
    console.error('Stack:', error.stack);
    process.exit(1);
}