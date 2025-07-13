#!/usr/bin/env node

/**
 * Test LLM createProduct integration
 */

require('dotenv').config({ path: '../../.env' });

async function testLLMCreateProduct() {
    console.log('🧪 Testing LLM createProduct integration...');
    
    try {
        const { sendMessage } = require('./src/services/llm.service.js');
        
        // Test Russian command
        const query = "создай товар 'Капучино Тест' цена 4.50 категория 'Getränke'";
        console.log(`Query: "${query}"`);
        
        console.log('⏱️ Sending request to LLM agent (timeout: 45s)...');
        
        const timeout = setTimeout(() => {
            console.log('⏱️ Request timed out after 45 seconds');
            process.exit(1);
        }, 45000);
        
        const response = await sendMessage(query, []);
        clearTimeout(timeout);
        
        console.log(`\n📝 Agent Response: ${response.text}`);
        
        // Check for success indicators
        const responseText = response.text.toLowerCase();
        const hasSuccessIndicators = responseText.includes('создан') || 
                                   responseText.includes('добавлен') ||
                                   responseText.includes('успешно') ||
                                   responseText.includes('капучино') ||
                                   responseText.includes('successfully') ||
                                   responseText.includes('created');
        
        console.log(`\n✅ Test Result: ${hasSuccessIndicators ? 'PASS - Product creation detected' : 'FAIL - No success indicators'}`);
        
        if (hasSuccessIndicators) {
            console.log('🎉 LLM agent successfully created a product using real database logic!');
        } else {
            console.log('❌ LLM agent response does not indicate successful product creation');
        }
        
    } catch (error) {
        console.error('❌ LLM test failed:', error.message);
        process.exit(1);
    }
}

testLLMCreateProduct();