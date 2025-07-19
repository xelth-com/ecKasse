// Test script for the Research Agent implementation
// Run with: node test_research_agent.js

require('dotenv').config({ path: '../../.env' });
const { runResearch } = require('./src/services/research.service');
const logger = require('./src/config/logger');

async function testResearchAgent() {
    console.log('🧪 Testing Research Agent implementation...\n');
    
    // Check if required environment variables are set
    if (!process.env.TAVILY_API_KEY) {
        console.error('❌ TAVILY_API_KEY is not set in .env file');
        console.log('Please add your Tavily API key to the .env file');
        console.log('Get one at: https://tavily.com/');
        return;
    }
    
    if (!process.env.GEMINI_API_KEY) {
        console.error('❌ GEMINI_API_KEY is not set in .env file');
        console.log('Please add your Gemini API key to the .env file');
        return;
    }
    
    console.log('✅ Environment variables are set');
    
    // Test queries for different scenarios
    const testQueries = [
        "What are the main ingredients in Tiramisu?",
        "Find information about German VAT rates for restaurants in 2025",
        "What cuisine type is Pad Thai and what are its main ingredients?"
    ];
    
    for (const [index, query] of testQueries.entries()) {
        console.log(`\n📝 Test ${index + 1}: "${query}"`);
        console.log('=' .repeat(50));
        
        try {
            const result = await runResearch(query);
            
            if (result.success) {
                console.log('✅ Research successful!');
                console.log(`📊 Summary length: ${result.summary?.length || 0} characters`);
                console.log(`📖 Sources: ${result.sources}`);
                console.log(`📝 Preview: ${result.summary?.substring(0, 200)}...`);
            } else {
                console.log('❌ Research failed');
                console.log(`🔍 Error: ${result.error}`);
                console.log(`💡 Fallback: ${result.fallback}`);
            }
        } catch (error) {
            console.error(`💥 Test failed with exception: ${error.message}`);
        }
        
        // Wait between tests to avoid rate limits
        if (index < testQueries.length - 1) {
            console.log('⏳ Waiting 2 seconds before next test...');
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
    }
    
    console.log('\n🎯 Research Agent testing completed!');
}

// Run the test
testResearchAgent().catch(error => {
    console.error('💥 Test runner failed:', error);
    process.exit(1);
});