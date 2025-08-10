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

    console.log('\n🎉 Test finished successfully!');

  } catch (error) {
    console.error('\n❌ An error occurred during the test:', error);
    process.exit(1);
  }
}

testPrinterSystem();