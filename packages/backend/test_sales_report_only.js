#!/usr/bin/env node

/**
 * Quick test for getSalesReport functionality
 */

require('dotenv').config({ path: '../../.env' });
const { sendMessage } = require('./src/services/llm.service.js');

async function testSalesReport() {
    console.log('🧪 Testing getSalesReport tool...');
    
    try {
        const query = "покажи отчет о продажах за сегодня";
        console.log(`Query: "${query}"`);
        
        const startTime = Date.now();
        const response = await sendMessage(query, []);
        const endTime = Date.now();
        
        console.log(`\n📊 Response: ${response.text}`);
        console.log(`⏱️ Duration: ${endTime - startTime}ms`);
        
        // Check if response contains real data indicators
        const responseText = response.text.toLowerCase();
        const hasRealData = responseText.includes('revenue') || 
                           responseText.includes('доход') || 
                           responseText.includes('transaction') ||
                           responseText.includes('транзакци') ||
                           responseText.includes('отчет') ||
                           responseText.includes('report');
        
        console.log(`\n✅ Test Result: ${hasRealData ? 'PASS - Real data detected' : 'FAIL - No real data detected'}`);
        
        if (hasRealData) {
            console.log('🎉 getSalesReport tool is working with real database data!');
        } else {
            console.log('❌ getSalesReport tool may still be using stub data');
        }
        
    } catch (error) {
        console.error('❌ Test failed with error:', error.message);
        process.exit(1);
    }
}

testSalesReport();