const db = require('./src/db/knex.js');
const printerService = require('./src/services/printer_service.js');

async function testWithValidTransaction() {
  try {
    console.log('🔍 Looking for valid finished transactions...');
    
    // Find a finished transaction
    const transaction = await db('active_transactions')
      .where('status', 'finished')
      .orderBy('id', 'desc')
      .first();
      
    if (!transaction) {
      console.log('ℹ️  No finished transactions found, testing will show not found message');
      return;
    }
    
    console.log('📋 Found transaction:', transaction.id, 'UUID:', transaction.uuid);
    
    // Load printer service
    await printerService.loadPrinters();
    
    // Test reprint
    const reprintResult = await printerService.reprintReceipt(transaction.id);
    console.log('🖨️  Reprint result:', {
      status: reprintResult.status,
      message: reprintResult.message,
      transaction_id: reprintResult.transaction_id,
      has_receipt_number: !!reprintResult.receipt_number
    });
    
    console.log('✅ Full reprint workflow test completed!');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  } finally {
    await db.destroy();
  }
}

testWithValidTransaction();