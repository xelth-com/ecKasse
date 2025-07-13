// Test Google Search setup validation
// Run with: node test_google_setup.js

require('dotenv').config({ path: '../../.env' });

async function validateGoogleSetup() {
    console.log('🔍 Google Search Setup Validation\n');
    
    let isValid = true;
    
    // Check 1: Basic environment variables
    console.log('=== Environment Variables Check ===');
    
    if (!process.env.GEMINI_API_KEY) {
        console.log('❌ GEMINI_API_KEY is not set');
        isValid = false;
    } else if (process.env.GEMINI_API_KEY === 'YOUR_GOOGLE_GEMINI_API_KEY') {
        console.log('❌ GEMINI_API_KEY is set to placeholder value');
        isValid = false;
    } else {
        console.log('✅ GEMINI_API_KEY is configured');
    }
    
    if (!process.env.GCS_CX) {
        console.log('❌ GCS_CX is not set');
        isValid = false;
    } else if (process.env.GCS_CX === 'YOUR_SEARCH_ENGINE_ID') {
        console.log('❌ GCS_CX is set to placeholder value');
        isValid = false;
    } else {
        console.log('✅ GCS_CX is configured');
    }
    
    if (!isValid) {
        console.log('\n❌ Environment setup is incomplete');
        console.log('\n📋 Please follow the setup instructions:');
        console.log('1. Read GOOGLE_SEARCH_SETUP.md for detailed instructions');
        console.log('2. Set up your Google Custom Search Engine');
        console.log('3. Update your .env file with the correct values');
        return false;
    }
    
    // Check 2: Test Google Custom Search Tool
    console.log('\n=== Google Custom Search Tool Check ===');
    
    try {
        // Set up environment for LangChain
        process.env.GOOGLE_API_KEY = process.env.GEMINI_API_KEY;
        process.env.GOOGLE_CSE_ID = process.env.GCS_CX;
        
        const { GoogleCustomSearch } = require("@langchain/community/tools/google_custom_search");
        const searchTool = new GoogleCustomSearch({});
        
        console.log('✅ Google Custom Search tool initialized successfully');
        console.log(`📊 Tool name: ${searchTool.name}`);
        console.log(`📖 Tool description: ${searchTool.description}`);
        
        // Test a simple search
        console.log('\n=== Test Search ===');
        console.log('🔍 Testing with query: "hello world"');
        
        const result = await searchTool.call("hello world");
        console.log('✅ Search completed successfully');
        console.log(`📊 Result length: ${result.length} characters`);
        console.log(`📝 First 200 chars: ${result.substring(0, 200)}...`);
        
        return true;
        
    } catch (error) {
        console.log('❌ Google Custom Search tool failed');
        console.log(`🔍 Error: ${error.message}`);
        
        if (error.message.includes('API key not set')) {
            console.log('💡 Solution: Check your GEMINI_API_KEY is valid');
        } else if (error.message.includes('API key not valid')) {
            console.log('💡 Solution: Enable Custom Search API in Google Cloud Console');
        } else if (error.message.includes('not found')) {
            console.log('💡 Solution: Check your Search Engine ID (GCS_CX)');
        }
        
        return false;
    }
}

// Run validation
validateGoogleSetup().then(success => {
    if (success) {
        console.log('\n🎉 Google Search setup is complete and working!');
        console.log('🚀 You can now use web search functionality in ecKasse');
    } else {
        console.log('\n❌ Google Search setup needs attention');
        console.log('📖 Please check GOOGLE_SEARCH_SETUP.md for instructions');
    }
}).catch(error => {
    console.error('💥 Setup validation failed:', error);
    process.exit(1);
});