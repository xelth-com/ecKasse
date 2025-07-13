// Test environment variable setup for Google search
require('dotenv').config({ path: '../../.env' });

console.log('🔍 Environment Variable Debug Test\n');

console.log('=== Current Environment Variables ===');
console.log('GEMINI_API_KEY:', process.env.GEMINI_API_KEY ? 'SET' : 'NOT SET');
console.log('GCS_API_KEY:', process.env.GCS_API_KEY ? 'SET' : 'NOT SET');
console.log('GCS_CX:', process.env.GCS_CX ? 'SET' : 'NOT SET');
console.log('GOOGLE_API_KEY:', process.env.GOOGLE_API_KEY ? 'SET' : 'NOT SET');
console.log('GOOGLE_CSE_ID:', process.env.GOOGLE_CSE_ID ? 'SET' : 'NOT SET');

console.log('\n=== Setting up Google Search Environment ===');

// Simulate what the research service does
if (!process.env.GOOGLE_API_KEY && process.env.GEMINI_API_KEY) {
    process.env.GOOGLE_API_KEY = process.env.GEMINI_API_KEY;
    console.log('✅ Set GOOGLE_API_KEY from GEMINI_API_KEY');
}

if (!process.env.GOOGLE_CSE_ID && process.env.GCS_CX) {
    process.env.GOOGLE_CSE_ID = process.env.GCS_CX;
    console.log('✅ Set GOOGLE_CSE_ID from GCS_CX');
}

console.log('\n=== Final Environment Variables ===');
console.log('GOOGLE_API_KEY:', process.env.GOOGLE_API_KEY ? 'SET' : 'NOT SET');
console.log('GOOGLE_CSE_ID:', process.env.GOOGLE_CSE_ID ? 'SET' : 'NOT SET');

console.log('\n=== Testing GoogleCustomSearch Import ===');
try {
    const { GoogleCustomSearch } = require("@langchain/community/tools/google_custom_search");
    console.log('✅ GoogleCustomSearch imported successfully');
    
    if (process.env.GOOGLE_API_KEY && process.env.GOOGLE_CSE_ID) {
        console.log('🔧 Attempting to create GoogleCustomSearch instance...');
        const searchTool = new GoogleCustomSearch({});
        console.log('✅ GoogleCustomSearch instance created successfully');
        console.log('Tool name:', searchTool.name);
        console.log('Tool description:', searchTool.description);
    } else {
        console.log('❌ Cannot create GoogleCustomSearch - missing required env vars');
    }
} catch (error) {
    console.error('❌ Error with GoogleCustomSearch:', error.message);
}

console.log('\n🎯 Environment test completed!');