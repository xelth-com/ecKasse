// Test script for Google-only research implementation
// Run with: node test_google_research.js

require('dotenv').config({ path: '../../.env' });
const { runResearch } = require('./src/services/research.service');
const logger = require('./src/config/logger');

async function testGoogleResearch() {
    console.log('🧪 Testing Google-only Research Implementation...\n');
    
    // Check required environment variables
    const requiredVars = ['GEMINI_API_KEY', 'GCS_CX'];
    const missingVars = requiredVars.filter(varName => !process.env[varName] || process.env[varName] === 'YOUR_SEARCH_ENGINE_ID');
    
    if (missingVars.length > 0) {
        console.error(`❌ Missing required environment variables: ${missingVars.join(', ')}`);
        console.log('\n📋 Setup instructions:');
        console.log('1. Go to https://programmablesearchengine.google.com/');
        console.log('2. Create a new search engine for "Search the entire web"');
        console.log('3. Copy the Search Engine ID to GCS_CX in your .env file');
        console.log('4. Your GEMINI_API_KEY will be used for search functionality');
        console.log('5. Ensure Custom Search API is enabled in Google Cloud Console');
        return;
    }
    
    console.log('✅ Environment variables are configured');
    console.log(`📊 Using Search Engine ID: ${process.env.GCS_CX}`);
    console.log(`🔑 Using API Key: ${process.env.GEMINI_API_KEY ? 'SET' : 'NOT SET'}`);
    
    // Test queries for different scenarios
    const testQueries = [
        "What are the main ingredients in Tiramisu?",
        "German VAT rates for restaurants 2025",
        "Pad Thai cuisine type and ingredients"
    ];
    
    for (const [index, query] of testQueries.entries()) {
        console.log(`\n📝 Test ${index + 1}: "${query}"`);
        console.log('=' .repeat(60));
        
        try {
            const result = await runResearch(query);
            
            if (result.success) {
                console.log('✅ Google research successful!');
                console.log(`📊 Summary length: ${result.summary?.length || 0} characters`);
                console.log(`📖 Sources: ${result.sources}`);
                console.log(`📝 Preview: ${result.summary?.substring(0, 300)}...`);
            } else {
                console.log('❌ Google research failed');
                console.log(`🔍 Error: ${result.error}`);
                console.log(`💡 Fallback: ${result.fallback}`);
            }
        } catch (error) {
            console.error(`💥 Test failed with exception: ${error.message}`);
            console.error(`📍 Stack: ${error.stack}`);
        }
        
        // Wait between tests to avoid rate limits
        if (index < testQueries.length - 1) {
            console.log('⏳ Waiting 3 seconds before next test...');
            await new Promise(resolve => setTimeout(resolve, 3000));
        }
    }
    
    console.log('\n🎯 Google research testing completed!');
    console.log('\n📋 Next steps:');
    console.log('1. If tests passed, the system is ready for production use');
    console.log('2. If tests failed, check your Google Custom Search Engine configuration');
    console.log('3. You can now use web search through the main application');
}

// Run the test
testGoogleResearch().catch(error => {
    console.error('💥 Test runner failed:', error);
    process.exit(1);
});