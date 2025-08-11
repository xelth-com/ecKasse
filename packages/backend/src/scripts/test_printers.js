const printerService = require('../services/printer_service');

/**
 * Standalone test script for the printer auto-configuration system.
 * Usage: node test_printers.js [networkRange]
 * Example: node test_printers.js 192.168.0.0/24
 */
async function testPrinterSystem() {
  // Parse command-line arguments
  const args = process.argv.slice(2);
  const networkRange = args[0];
  
  if (networkRange) {
    console.log(`🧪 Starting printer system test with manual network range: ${networkRange}`);
  } else {
    console.log('🧪 Starting printer system test with auto-detection...');
    console.log('💡 Tip: Use "node test_printers.js 192.168.0.0/24" to manually specify a network range');
  }
  
  try {
    // Step 0: Clear the configuration file to ensure a clean test environment
    console.log('\n[Step 0] Clearing configuration file for clean test...');
    const fs = require('fs').promises;
    const path = require('path');
    const configPath = path.join(__dirname, '../config/printers.json');
    try {
      await fs.writeFile(configPath, '[]', 'utf8');
      console.log('Configuration file cleared successfully.');
    } catch (configError) {
      console.log('Note: Could not clear configuration file (may not exist yet):', configError.message);
    }
    // Step 1: Initialize the service, which loads the printer config from printers.json
    console.log('\n[Step 1] Loading printer service...');
    await printerService.loadPrinters();
    console.log('Printer service loaded. Current printers:', printerService.printers);

    // Step 2: Run the full auto-configuration process
    console.log('\n[Step 2] Starting auto-configuration process...');
    const options = networkRange ? { networkRange } : {};
    await printerService.startAutoConfiguration(options);

    // Step 3: Check the results
    console.log('\n[Step 3] Checking results...');
    const receiptPrinter = printerService.getPrinterByRole('receipts');
    if (receiptPrinter) {
      console.log('✅ Found configured receipt printer:');
      console.log(JSON.stringify(receiptPrinter, null, 2));
    } else {
      console.log('🟡 No receipt printer was configured in this run.');
    }

    // Step 4: Test receipt printing if a printer was configured
    if (receiptPrinter) {
      console.log('\n[Step 4] Testing receipt printing via API endpoint...');
      try {
        const http = require('http');
        
        const postData = JSON.stringify({
          business_name: "Test Print Store",
          business_address: "Auto-Test Address",
          business_phone: "+49 000 000000", 
          receipt_number: "AUTO-TEST-" + Date.now(),
          date_time: new Date().toLocaleString('de-DE'),
          cashier_name: "Test Script",
          items: [
            {
              name: "Auto Test Item",
              quantity: 1,
              unit_price: 10.00,
              total_price: 10.00
            }
          ],
          subtotal: 10.00,
          tax_rate: 19,
          tax_amount: 1.90,
          total: 11.90,
          payment_method: "Test",
          tse_qr_data: "TSE:V0:AUTOTEST:20250811000000:11.90EUR:19%",
          farewell_message: "Auto-test completed!"
        });
        
        const options = {
          hostname: 'localhost',
          port: 3030,
          path: '/api/printers/test-receipt',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(postData)
          }
        };
        
        const apiResult = await new Promise((resolve, reject) => {
          const req = http.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => {
              data += chunk;
            });
            res.on('end', () => {
              try {
                const result = JSON.parse(data);
                resolve({ status: res.statusCode, body: result });
              } catch (parseError) {
                reject(new Error(`Failed to parse response: ${parseError.message}`));
              }
            });
          });
          
          req.on('error', (error) => {
            reject(error);
          });
          
          req.write(postData);
          req.end();
          
          // Add timeout
          setTimeout(() => {
            req.destroy();
            reject(new Error('API request timeout'));
          }, 10000);
        });
        
        if (apiResult.status === 200) {
          console.log('✅ Receipt printing test successful!');
          console.log('API Response:', JSON.stringify(apiResult.body, null, 2));
        } else {
          console.log('⚠️  Receipt printing test returned non-200 status:', apiResult.status);
          console.log('API Response:', JSON.stringify(apiResult.body, null, 2));
        }
        
      } catch (apiError) {
        console.log('❌ Receipt printing test failed:', apiError.message);
        console.log('Note: Make sure the backend server is running on port 3030');
      }
    } else {
      console.log('\n[Step 4] Skipping receipt printing test (no printer configured)');
    }

    console.log('\n🎉 Test finished successfully!');

  } catch (error) {
    console.error('\n❌ An error occurred during the test:', error);
    process.exit(1);
  }
}

testPrinterSystem();