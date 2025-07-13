#!/usr/bin/env node

/**
 * Direct test of the reporting service
 */

require('dotenv').config({ path: '../../.env' });
const { generateSalesReport } = require('./src/services/reporting.service.js');

async function testReportingService() {
    console.log('🧪 Testing reporting service directly...');
    
    try {
        const report = await generateSalesReport({ period: 'today' });
        console.log('\n📊 Report Result:');
        console.log(JSON.stringify(report, null, 2));
        
        if (report.success) {
            console.log('\n✅ Reporting service is working correctly!');
            console.log(`📈 Total Revenue: ${report.data.totalRevenue}`);
            console.log(`📊 Transaction Count: ${report.data.transactionCount}`);
            console.log(`💰 Average Sale: ${report.data.averageSale}`);
        } else {
            console.log('\n❌ Reporting service returned an error:');
            console.log(report.message);
        }
        
    } catch (error) {
        console.error('❌ Test failed with error:', error.message);
        console.error('Stack:', error.stack);
        process.exit(1);
    }
}

testReportingService();