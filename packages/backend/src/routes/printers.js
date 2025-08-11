const express = require('express');
const router = express.Router();
const printerService = require('../services/printer_service');

/**
 * @route   POST /api/printers/discover
 * @desc    Starts the printer auto-discovery and configuration process.
 * @access  Public
 */
router.post('/discover', async (req, res) => {
  console.log('API call received to discover printers...');
  try {
    // The networkRange can be optionally passed in the request body for manual scans
    const options = req.body || {}; 

    // We don't wait for this to finish, as it can be a long process.
    // We'll return an immediate response to the client.
    // The client can poll for results or use WebSockets for real-time updates.
    printerService.startAutoConfiguration(options);

    res.status(202).json({ message: 'Printer discovery process started.' });

  } catch (error) {
    console.error('Error starting printer discovery:', error);
    res.status(500).json({ message: 'Failed to start printer discovery process.' });
  }
});

/**
 * @route   GET /api/printers
 * @desc    Gets the list of currently configured printers.
 * @access  Public
 */
router.get('/', (req, res) => {
  res.json(printerService.printers);
});

/**
 * @route   POST /api/printers/test-receipt
 * @desc    Prints a test receipt using the configured receipt printer.
 * @access  Public
 */
router.post('/test-receipt', async (req, res) => {
  console.log('API call received to print test receipt...');
  
  try {
    // Load receipt template to get sample data, or use provided data
    const receiptData = req.body || await getDefaultReceiptData();
    
    console.log('[PrintersRoute] Using receipt data:', JSON.stringify(receiptData, null, 2));
    
    // Call printer service to print receipt
    const printResult = await printerService.printReceipt(receiptData);
    
    if (printResult.status === 'success') {
      res.status(200).json({
        message: 'Test receipt printed successfully',
        result: printResult
      });
    } else {
      res.status(400).json({
        message: 'Failed to print test receipt',
        error: printResult.message,
        result: printResult
      });
    }
    
  } catch (error) {
    console.error('Error printing test receipt:', error);
    res.status(500).json({ 
      message: 'Internal server error while printing receipt',
      error: error.message 
    });
  }
});

/**
 * Gets default sample receipt data from the template configuration
 * @returns {Promise<Object>} Sample receipt data
 */
async function getDefaultReceiptData() {
  try {
    const fs = require('fs').promises;
    const path = require('path');
    const templatePath = path.join(__dirname, '../config/receipt_template.json');
    const templateContent = await fs.readFile(templatePath, 'utf-8');
    const template = JSON.parse(templateContent);
    
    return template.sample_data;
  } catch (error) {
    console.warn('[PrintersRoute] Could not load sample data from template, using fallback');
    // Fallback sample data
    return {
      business_name: "ecKasse Test Store",
      business_address: "Test Address 123, 12345 Test City",
      business_phone: "+49 123 456789",
      receipt_number: "TEST-" + Date.now(),
      date_time: new Date().toLocaleString('de-DE'),
      cashier_name: "Test Cashier",
      items: [
        {
          name: "Test Item 1",
          quantity: 2,
          unit_price: 5.50,
          total_price: 11.00
        },
        {
          name: "Test Item 2",
          quantity: 1,
          unit_price: 3.25,
          total_price: 3.25
        }
      ],
      subtotal: 14.25,
      tax_rate: 19,
      tax_amount: 2.71,
      total: 16.96,
      payment_method: "Cash",
      tse_qr_data: "TSE:V0:TEST123:20250811143025:16.96EUR:19%",
      farewell_message: "Thank you for testing ecKasse!"
    };
  }
}

module.exports = router;