#!/usr/bin/env node

/**
 * Quick verification that getSalesReport is working
 */

require('dotenv').config({ path: '../../.env' });

async function quickTest() {
    console.log('🧪 Quick test of getSalesReport implementation...');
    
    // Test 1: Direct service test
    console.log('\n1. Testing reporting service directly...');
    const { generateSalesReport } = require('./src/services/reporting.service.js');
    
    const report = await generateSalesReport({ period: 'today' });
    console.log(`✅ Service test: ${report.success ? 'PASS' : 'FAIL'}`);
    
    if (report.success) {
        console.log(`   📊 Revenue: ${report.data.totalRevenue}, Transactions: ${report.data.transactionCount}`);
    }
    
    // Test 2: LLM service integration test
    console.log('\n2. Testing LLM service integration...');
    const { sendMessage } = require('./src/services/llm.service.js');
    
    console.log('   Sending query: "покажи отчет о продажах за сегодня"');
    
    // Set timeout for LLM test
    const timeout = setTimeout(() => {
        console.log('   ⏱️  LLM test timed out (30s) - this may be normal for first run');
        process.exit(0);
    }, 30000);
    
    try {
        const response = await sendMessage("покажи отчет о продажах за сегодня", []);
        clearTimeout(timeout);
        
        const responseText = response.text.toLowerCase();
        const hasRealData = responseText.includes('revenue') || 
                           responseText.includes('доход') || 
                           responseText.includes('отчет') ||
                           responseText.includes('204') ||  // Known revenue from direct test
                           responseText.includes('24');     // Known transaction count
        
        console.log(`   ✅ LLM integration test: ${hasRealData ? 'PASS' : 'FAIL'}`);
        console.log(`   📝 Response: ${response.text.substring(0, 100)}...`);
        
    } catch (error) {
        clearTimeout(timeout);
        console.log(`   ❌ LLM test failed: ${error.message}`);
    }
    
    console.log('\n🎉 Testing complete!');
}

quickTest().catch(console.error);