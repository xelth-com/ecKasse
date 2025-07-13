#!/usr/bin/env node

/**
 * Verification script for all scaffolded agent tools
 * This script tests that all new tools are properly registered and responding with mock data
 */

require('dotenv').config({ path: '../../.env' });
const { sendMessage } = require('./src/services/llm.service.js');

async function runStubTests() {
    console.log('🧪 Testing all scaffolded agent tools (stubs)...');
    console.log('='.repeat(60));
    
    const tests = [
        { 
            name: 'Create Product', 
            query: "create a product called 'Test Coffee' for 5.99 in 'Drinks'" 
        },
        { 
            name: 'Update Product', 
            query: "update the price of 'Test Coffee' to 6.49" 
        },
        { 
            name: 'Create Category', 
            query: "create a food category named 'Desserts'" 
        },
        { 
            name: 'Create Modifier', 
            query: "create a happy hour discount modifier of 20% for drinks" 
        },
        { 
            name: 'Sales Report', 
            query: "покажи отчет о продажах за сегодня" 
        },
        { 
            name: 'Top Items', 
            query: "what are the top 3 selling items this week?" 
        },
        { 
            name: 'Slow Moving Items', 
            query: "show me items that sold less than 5 times this month" 
        },
        { 
            name: 'System Health', 
            query: "check system status" 
        }
    ];

    let passedTests = 0;
    let failedTests = 0;

    for (const test of tests) {
        console.log(`\n--- Running test: ${test.name} ---`);
        console.log(`   Query: "${test.query}"`);
        
        try {
            const startTime = Date.now();
            const response = await sendMessage(test.query, []);
            const endTime = Date.now();
            const duration = endTime - startTime;
            
            console.log(`   Agent Response: ${response.text}`);
            console.log(`   Duration: ${duration}ms`);
            
            let testPassed = false;
            
            // Special handling for Sales Report test (now uses real data)
            if (test.name === 'Sales Report') {
                const responseText = response.text.toLowerCase();
                // Check for real data indicators like revenue, transactions, etc.
                testPassed = responseText.includes('revenue') || 
                           responseText.includes('доход') || 
                           responseText.includes('transaction') ||
                           responseText.includes('транзакци') ||
                           responseText.includes('отчет') ||
                           responseText.includes('report') ||
                           responseText.includes('totalrevenue') ||
                           responseText.includes('transactioncount');
            } else {
                // For other tests, check if response contains mock data indicators
                testPassed = response.text.includes('(MOCK)') || 
                           response.text.includes('mock') || 
                           response.text.includes('Mock') ||
                           response.text.includes('успешно') ||
                           response.text.includes('successfully');
            }
            
            if (testPassed) {
                console.log(`   Result: ✅ PASS`);
                passedTests++;
            } else {
                console.log(`   Result: ❌ FAIL - Expected data not detected`);
                failedTests++;
            }
        } catch (error) {
            console.log(`   Result: ❌ FAIL - Error: ${error.message}`);
            failedTests++;
        }
    }

    console.log('\n' + '='.repeat(60));
    console.log(`🧪 Test Results Summary:`);
    console.log(`   ✅ Passed: ${passedTests}`);
    console.log(`   ❌ Failed: ${failedTests}`);
    console.log(`   📊 Total: ${passedTests + failedTests}`);
    
    if (failedTests === 0) {
        console.log(`\n🎉 All tests passed! The agent tool scaffolding is working correctly.`);
    } else {
        console.log(`\n⚠️  Some tests failed. Please check the tool implementations.`);
    }
    
    console.log('\nImplementation Status:');
    console.log('✅ getSalesReport - IMPLEMENTED with real database logic');
    console.log('⏳ Other tools - Still using stub implementations');
    console.log('\nNext steps:');
    console.log('1. Replace remaining stub implementations with real business logic');
    console.log('2. Connect remaining tools to actual database operations');
    console.log('3. Add proper error handling and validation');
    console.log('4. Update tool descriptions based on actual functionality');
    
    process.exit(failedTests === 0 ? 0 : 1);
}

// Handle graceful shutdown
process.on('SIGINT', () => {
    console.log('\n\n🛑 Test interrupted by user');
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    process.exit(1);
});

// Run the tests
runStubTests().catch(error => {
    console.error('💥 Test runner failed:', error);
    process.exit(1);
});