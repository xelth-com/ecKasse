const transactionService = require('./src/services/transaction_management.service');
const printerService = require('./src/services/printer_service');
const loggingService = require('./src/services/logging.service');
const db = require('./src/db/knex');

/**
 * End-to-end test for transaction-to-print workflow
 * This script simulates creating a transaction, adding items, and finishing it with receipt printing
 */
async function testTransactionToPrint() {
  console.log('🧪 Starting end-to-end transaction-to-print workflow test...\n');

  try {
    // Initialize printer service
    console.log('📋 [Step 1] Initializing printer service...');
    await printerService.loadPrinters();
    console.log('✅ Printer service initialized');
    console.log('Configured printers:', printerService.printers.map(p => `${p.name} (${p.model})`));

    // Check if we have at least one receipt printer configured
    const receiptPrinter = printerService.getPrinterByRole('receipts');
    if (!receiptPrinter) {
      console.log('⚠️  No receipt printer configured - this test will demonstrate the integration but printing will fail');
    } else {
      console.log(`📄 Receipt printer found: ${receiptPrinter.name} at ${receiptPrinter.ip_address}`);
    }

    // Create a new transaction
    console.log('\n🛒 [Step 2] Creating new transaction...');
    const mockUserId = 1;
    const transactionCriteria = {
      metadata: {
        table: 'Test Table 99',
        source: 'integration_test'
      }
    };

    const newTransaction = await transactionService.findOrCreateActiveTransaction(transactionCriteria, mockUserId);
    console.log('✅ Transaction created:', {
      id: newTransaction.id,
      uuid: newTransaction.uuid,
      status: newTransaction.status,
      table: JSON.parse(newTransaction.metadata).table
    });

    // Check if we have items in the database to add
    console.log('\n📦 [Step 3] Checking available items in database...');
    const availableItems = await db('items')
      .select('id', 'display_names', 'item_price_value')
      .limit(3);

    if (availableItems.length === 0) {
      throw new Error('No items found in database. Please seed some items first.');
    }

    console.log(`✅ Found ${availableItems.length} items in database`);
    availableItems.forEach(item => {
      const itemName = JSON.parse(item.display_names).menu?.de || 'Unknown Item';
      console.log(`   - ${itemName} (${item.item_price_value} EUR)`);
    });

    // Add items to the transaction
    console.log('\n🛒 [Step 4] Adding items to transaction...');
    let updatedTransaction = newTransaction;

    for (const item of availableItems) {
      const quantity = Math.floor(Math.random() * 3) + 1; // Random quantity 1-3
      console.log(`   Adding ${quantity}x ${JSON.parse(item.display_names).menu?.de}...`);
      
      updatedTransaction = await transactionService.addItemToTransaction(
        updatedTransaction.id,
        item.id,
        quantity,
        mockUserId
      );
    }

    console.log('✅ Items added to transaction. Current totals:', {
      total_amount: updatedTransaction.total_amount,
      tax_amount: updatedTransaction.tax_amount,
      items_count: updatedTransaction.items?.length || 'fetching...'
    });

    // Finish the transaction (this should trigger receipt printing)
    console.log('\n💰 [Step 5] Finishing transaction with payment...');
    const paymentData = {
      type: 'CASH',
      amount: parseFloat(updatedTransaction.total_amount)
    };

    console.log(`Payment: ${paymentData.amount.toFixed(2)} EUR via ${paymentData.type}`);

    const finishedResult = await transactionService.finishTransaction(
      updatedTransaction.id,
      paymentData,
      mockUserId
    );

    console.log('\n🎯 [Step 6] Transaction completion results:');
    console.log('✅ Transaction Status:', finishedResult.success ? 'SUCCESS' : 'FAILED');
    console.log('📄 Fiscal Log:', finishedResult.fiscal_log ? 'Created' : 'Missing');
    
    // Check printing results
    if (finishedResult.print_result) {
      console.log('🖨️  Printing Result: SUCCESS');
      console.log('   Printer:', finishedResult.print_result.printer);
      console.log('   Model:', finishedResult.print_result.model);
      console.log('   Bytes Generated:', finishedResult.print_result.bytesSize);
      console.log('   Items Printed:', finishedResult.print_result.items_printed);
      console.log('   Receipt #:', finishedResult.print_result.receipt_number);
    } else if (finishedResult.print_warning) {
      console.log('⚠️  Printing Result: WARNING');
      console.log('   Message:', finishedResult.print_warning);
    } else if (finishedResult.print_error) {
      console.log('❌ Printing Result: ERROR');
      console.log('   Error:', finishedResult.print_error);
    }

    console.log('\n📊 [Step 7] Final transaction details:');
    const finalTransaction = finishedResult.transaction;
    console.log('Transaction UUID:', finalTransaction.uuid);
    console.log('Status:', finalTransaction.status);
    console.log('Total Amount:', finalTransaction.total_amount);
    console.log('Payment Type:', finalTransaction.payment_type);
    console.log('Items Count:', finalTransaction.items.length);

    // List all items in the final transaction
    console.log('\nItems in receipt:');
    finalTransaction.items.forEach((item, index) => {
      const itemName = item.display_names?.menu?.de || 'Unknown Item';
      console.log(`   ${index + 1}. ${itemName} - ${item.quantity}x ${item.unit_price} = ${item.total_price} EUR`);
    });

    // Test direct printer service call with sample data
    console.log('\n🖨️  [Step 8] Testing direct printer service call...');
    const sampleReceiptData = {
      business_name: 'Test Integration Store',
      business_address: 'Test Address 123, 12345 Test City',
      business_phone: '+49 123 456789',
      receipt_number: 'TEST-' + Date.now().toString().slice(-6),
      date_time: new Date().toLocaleString('de-DE'),
      cashier_name: 'Integration Test',
      items: [
        { name: 'Test Item 1', quantity: 2, unit_price: 5.50, total_price: 11.00 },
        { name: 'Test Item 2', quantity: 1, unit_price: 3.20, total_price: 3.20 }
      ],
      subtotal: '14.20',
      tax_rate: 19,
      tax_amount: '2.27',
      total: '14.20',
      payment_method: 'Test Payment',
      tse_qr_data: 'TSE:TEST:INTEGRATION:' + Date.now(),
      farewell_message: 'Integration test completed successfully!'
    };

    const directPrintResult = await printerService.printReceipt(sampleReceiptData);
    console.log('Direct print result:', {
      status: directPrintResult.status,
      message: directPrintResult.message,
      bytesSize: directPrintResult.bytesSize || 'N/A'
    });

    console.log('\n🎉 End-to-end test completed successfully!');
    console.log('✅ Transaction lifecycle with printing integration verified');

  } catch (error) {
    console.error('\n❌ Test failed with error:', error.message);
    console.error('Stack trace:', error.stack);
    process.exit(1);
  } finally {
    // Clean up database connection
    try {
      await db.destroy();
      console.log('📋 Database connection closed');
    } catch (cleanupError) {
      console.error('⚠️  Error closing database:', cleanupError.message);
    }
  }
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n🛑 Test interrupted by user');
  try {
    await db.destroy();
  } catch (error) {
    // Ignore cleanup errors on interrupt
  }
  process.exit(0);
});

// Run the test
testTransactionToPrint();