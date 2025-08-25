const fs = require('fs').promises;
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const CoreController = require('../utils/printers/core_controller');
const systemTools = require('../utils/printers/system_tools');
const db = require('../db/knex');
const logger = require('../config/logger');

const PRINTERS_CONFIG_PATH = path.join(__dirname, '../config/printers.json');

/**
 * Service to manage all printer-related operations.
 */
class PrinterService {
  constructor() {
    this.printers = [];
  }

  /**
   * Loads the printer configurations from the JSON file.
   */
  async loadPrinters() {
    try {
      const data = await fs.readFile(PRINTERS_CONFIG_PATH, 'utf-8');
      this.printers = JSON.parse(data);
    } catch (error) {
      if (error.code === 'ENOENT') {
        // File doesn't exist, create it.
        await this.savePrinters();
      } else {
        console.error('Error loading printer configuration:', error);
      }
    }
  }

  /**
   * Saves the current printer configurations to the JSON file.
   */
  async savePrinters() {
    await fs.writeFile(PRINTERS_CONFIG_PATH, JSON.stringify(this.printers, null, 2));
  }

  /**
   * Adds a new printer to the configuration and saves it.
   * @param {object} printerData - Data for the new printer.
   */
  async addPrinter(printerData) {
    const newPrinter = {
      id: uuidv4(),
      name: `New ${printerData.model}`,
      roles: ['receipts'], // Default role
      ...printerData
    };
    this.printers.push(newPrinter);
    await this.savePrinters();
    console.log(`[PrinterService] Added new printer: ${newPrinter.name}`);
    return newPrinter;
  }

  /**
   * Finds a printer by its assigned role.
   * @param {string} role - The role to search for (e.g., 'kitchen_orders').
   * @returns {object | undefined} The printer object or undefined if not found.
   */
  getPrinterByRole(role) {
    return this.printers.find(p => p.roles.includes(role));
  }

  /**
   * Initiates the auto-discovery and configuration process.
   * @param {object} [options] - Optional configuration options
   * @param {string} [options.networkRange] - Optional network range to scan (e.g., '192.168.0.0/24')
   */
  async startAutoConfiguration(options = {}) {
    // Dynamically load all driver modules from the drivers directory
    const driversDir = path.join(__dirname, '../utils/printers/drivers');
    const driverFiles = await fs.readdir(driversDir);
    const printerModules = driverFiles.map(file => require(path.join(driversDir, file)));

    const controller = new CoreController(printerModules, systemTools, this, options);
    await controller.startConfiguration();
  }

  /**
   * Prints a receipt using the configured printer and template
   * Enhanced to handle detailed receipt data from transaction service
   * @param {Object} receiptData - The comprehensive receipt data to print
   * @returns {Promise<Object>} Result object with status and details
   */
  async printReceipt(receiptData) {
    console.log('[PrinterService] Starting receipt print process...');
    console.log('[PrinterService] Receipt data received:', {
      receipt_number: receiptData.receipt_number,
      items_count: receiptData.items?.length || 0,
      total: receiptData.total,
      payment_method: receiptData.payment_method
    });
    
    try {
      // Validate essential receipt data
      if (!receiptData || typeof receiptData !== 'object') {
        throw new Error('Invalid receipt data provided');
      }
      
      if (!receiptData.items || !Array.isArray(receiptData.items)) {
        throw new Error('Receipt data must contain items array');
      }
      
      if (!receiptData.total || !receiptData.receipt_number) {
        throw new Error('Receipt data must contain total amount and receipt number');
      }
      
      // Load the receipt template
      const templatePath = path.join(__dirname, '../config/receipt_template.json');
      const templateContent = await fs.readFile(templatePath, 'utf-8');
      const template = JSON.parse(templateContent);
      
      console.log('[PrinterService] Receipt template loaded successfully');
      
      // Find the active printer for receipts role
      const receiptPrinter = this.getPrinterByRole('receipts');
      if (!receiptPrinter) {
        throw new Error('No printer configured for receipts role');
      }
      
      console.log(`[PrinterService] Using printer: ${receiptPrinter.name} (${receiptPrinter.model}) at ${receiptPrinter.ip_address}`);
      
      // Load the appropriate driver module
      const driversDir = path.join(__dirname, '../utils/printers/drivers');
      let driverModule = null;
      
      try {
        // Try to load driver by model name
        const modelFileName = receiptPrinter.model.toLowerCase().replace(/[^a-z0-9]/g, '_') + '.js';
        const driverPath = path.join(driversDir, modelFileName);
        driverModule = require(driverPath);
        console.log(`[PrinterService] Loaded driver: ${driverModule.modelName}`);
      } catch (driverError) {
        // Try to find a matching driver by checking all available drivers
        const driverFiles = await fs.readdir(driversDir);
        const printerModules = driverFiles.map(file => require(path.join(driversDir, file)));
        
        driverModule = printerModules.find(module => 
          module.modelName.toLowerCase().includes(receiptPrinter.model.toLowerCase()) ||
          receiptPrinter.model.toLowerCase().includes(module.modelName.toLowerCase())
        );
        
        if (!driverModule) {
          throw new Error(`No compatible driver found for printer model: ${receiptPrinter.model}`);
        }
        
        console.log(`[PrinterService] Found compatible driver: ${driverModule.modelName}`);
      }
      
      // Ensure receiptData contains all required fields with defaults
      const processedReceiptData = {
        business_name: receiptData.business_name || 'ecKasse Store',
        business_address: receiptData.business_address || 'Address not configured',
        business_phone: receiptData.business_phone || 'Phone not configured',
        receipt_number: receiptData.receipt_number,
        date_time: receiptData.date_time || new Date().toLocaleString('de-DE'),
        cashier_name: receiptData.cashier_name || 'System',
        items: receiptData.items.map(item => ({
          name: String(item.name || 'Unknown Item'),
          quantity: Number(item.quantity || 1),
          unit_price: Number(item.unit_price || 0),
          total_price: Number(item.total_price || 0)
        })),
        subtotal: String(receiptData.subtotal || '0.00'),
        tax_rate: Number(receiptData.tax_rate || 19),
        tax_amount: String(receiptData.tax_amount || '0.00'),
        total: String(receiptData.total),
        payment_method: receiptData.payment_method || 'Cash',
        tse_qr_data: receiptData.tse_qr_data || 'TSE:DEMO:DATA',
        farewell_message: receiptData.farewell_message || 'Thank you for your visit!'
      };
      
      console.log('[PrinterService] Processed receipt data for printing:', {
        items_processed: processedReceiptData.items.length,
        total_amount: processedReceiptData.total,
        has_tse_data: !!processedReceiptData.tse_qr_data
      });
      
      // Generate print commands using the driver
      const printCommands = driverModule.generatePrintCommands(processedReceiptData, template);
      console.log(`[PrinterService] Generated ${printCommands.length} bytes of print commands`);
      
      // Create port object for the printer
      const printerPort = {
        type: receiptPrinter.port_type || 'LAN',
        ip: receiptPrinter.ip_address,
        port: receiptPrinter.port || 9100
      };
      
      // Send commands to printer using system tools
      const printResult = await systemTools.execute_printer_command(printerPort, printCommands, 10000);
      
      if (printResult.status === 'success') {
        console.log('[PrinterService] ✅ Receipt printed successfully');
        return {
          status: 'success',
          message: 'Receipt printed successfully',
          printer: receiptPrinter.name,
          model: receiptPrinter.model,
          bytesSize: printCommands.length,
          items_printed: processedReceiptData.items.length,
          receipt_number: processedReceiptData.receipt_number
        };
      } else {
        console.error('[PrinterService] ❌ Print failed:', printResult.message);
        return {
          status: 'error',
          message: `Print failed: ${printResult.message}`,
          printer: receiptPrinter.name,
          model: receiptPrinter.model,
          error_details: printResult.error || 'Unknown printer error'
        };
      }
      
    } catch (error) {
      console.error('[PrinterService] ❌ Receipt printing error:', error);
      return {
        status: 'error',
        message: error.message,
        error: error.name,
        stack: error.stack
      };
    }
  }

  /**
   * Prepares comprehensive receipt data for printing by gathering all necessary information
   * @param {Object} finishedTransaction - The completed transaction object with items
   * @param {Object} fiscalLog - The fiscal log entry for TSE data
   * @returns {Promise<Object>} Complete receipt data ready for template processing
   */
  async _prepareReceiptData(finishedTransaction, fiscalLog = null) {
    logger.info({ 
      service: 'PrinterService', 
      function: '_prepareReceiptData', 
      transactionId: finishedTransaction.id 
    });

    try {
      // Get current timestamp for receipt
      const now = new Date();
      const dateTime = now.toLocaleString('de-DE', { 
        timeZone: 'Europe/Berlin',
        year: 'numeric', 
        month: '2-digit', 
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      });

      // Get business/company information (placeholder - would typically come from settings)
      const businessInfo = {
        business_name: 'ecKasse Demo Store',
        business_address: 'Musterstraße 123, 12345 Berlin',
        business_phone: '+49 30 12345678',
        tax_number: 'DE123456789',
        vat_id: 'DE987654321'
      };

      // Process transaction items for receipt format
      const receiptItems = finishedTransaction.items.map(item => {
        const itemName = item.display_names?.menu?.de || `Item ${item.item_id}`;
        
        return {
          name: itemName,
          quantity: item.quantity,
          unit_price: parseFloat(item.unit_price),
          total_price: parseFloat(item.total_price),
          tax_rate: parseFloat(item.tax_rate)
        };
      });

      // Calculate totals
      const subtotal = receiptItems.reduce((sum, item) => sum + item.total_price, 0);
      const taxAmount = parseFloat(finishedTransaction.tax_amount);
      const total = parseFloat(finishedTransaction.total_amount);

      // Determine primary tax rate for display (use most common rate)
      const taxRates = receiptItems.map(item => item.tax_rate);
      const primaryTaxRate = taxRates.reduce((a, b, _, arr) => 
        arr.filter(v => v === a).length >= arr.filter(v => v === b).length ? a : b
      );

      // Generate receipt number from transaction UUID
      const receiptNumber = `R-${finishedTransaction.uuid.split('-')[0].toUpperCase()}`;

      // Prepare TSE QR data from fiscal log
      const tseQrData = fiscalLog?.log_data ? 
        `TSE:${fiscalLog.log_number}:${finishedTransaction.uuid}:${dateTime.replace(/[:\s]/g, '')}:${total.toFixed(2)}EUR:${primaryTaxRate}%` :
        `TSE:DEMO:${finishedTransaction.uuid}:${dateTime.replace(/[:\s]/g, '')}:${total.toFixed(2)}EUR:${primaryTaxRate}%`;

      // Determine cashier name (placeholder - would come from user service)
      const cashierName = 'System User';

      // Build complete receipt data object
      const receiptData = {
        ...businessInfo,
        receipt_number: receiptNumber,
        date_time: dateTime,
        cashier_name: cashierName,
        items: receiptItems,
        subtotal: subtotal.toFixed(2),
        tax_rate: primaryTaxRate,
        tax_amount: taxAmount.toFixed(2), 
        total: total.toFixed(2),
        payment_method: finishedTransaction.payment_type || 'Cash',
        payment_amount: finishedTransaction.payment_amount,
        tse_qr_data: tseQrData,
        farewell_message: 'Vielen Dank für Ihren Besuch! • Powered by ecKasse',
        
        // Additional metadata for advanced features
        transaction_uuid: finishedTransaction.uuid,
        fiscal_log_number: fiscalLog?.log_number || 'DEMO',
        // FIX: Use robust JSON parsing to handle both objects and strings
        table_number: finishedTransaction.metadata ? 
          (typeof finishedTransaction.metadata === 'string' ? JSON.parse(finishedTransaction.metadata).table : finishedTransaction.metadata.table) : null
      };

      logger.info({ 
        msg: 'Receipt data prepared successfully', 
        transactionId: finishedTransaction.id,
        itemCount: receiptItems.length,
        total: total.toFixed(2)
      });

      return receiptData;

    } catch (error) {
      logger.error({ 
        msg: 'Failed to prepare receipt data', 
        error: error.message,
        transactionId: finishedTransaction.id
      });
      throw error;
    }
  }

  /**
   * Reprints a receipt for a completed transaction
   * @param {number} transactionId - The ID of the completed transaction
   * @returns {Promise<Object>} Result object with status and details
   */
  async reprintReceipt(transactionId) {
    console.log(`[PrinterService] Starting receipt reprint for transaction ID: ${transactionId}...`);
    
    try {
      // Validate transaction ID
      if (!transactionId || isNaN(parseInt(transactionId))) {
        throw new Error('Invalid transaction ID provided');
      }

      // Fetch the completed transaction with items
      const transaction = await db('active_transactions')
        .where('id', transactionId)
        .first();

      if (!transaction) {
        throw new Error(`Transaction with ID ${transactionId} not found`);
      }

      if (transaction.status !== 'finished') {
        throw new Error(`Transaction ${transactionId} is not completed (status: ${transaction.status})`);
      }

      // Fetch transaction items
      const items = await db('active_transaction_items')
        .leftJoin('items', 'active_transaction_items.item_id', 'items.id')
        .select(
          'active_transaction_items.*',
          'items.display_names',
          'items.item_price_value'
        )
        .where('active_transaction_items.active_transaction_id', transactionId);

      const completeTransaction = {
        ...transaction,
        items: items.map(item => ({
          ...item,
          display_names: item.display_names ? JSON.parse(item.display_names) : null
        }))
      };

      // Try to find the corresponding fiscal log entry
      let fiscalLog = null;
      try {
        fiscalLog = await db('fiscal_log')
          .where('log_data', 'like', `%${transaction.uuid}%`)
          .where('event_type', 'finishTransaction')
          .orderBy('created_at', 'desc')
          .first();
      } catch (fiscalError) {
        console.warn(`[PrinterService] Could not find fiscal log for transaction ${transactionId}:`, fiscalError.message);
      }

      console.log(`[PrinterService] Retrieved transaction data:`, {
        uuid: transaction.uuid,
        status: transaction.status,
        total: transaction.total_amount,
        items_count: items.length,
        has_fiscal_log: !!fiscalLog
      });

      // Prepare receipt data
      const receiptData = await this._prepareReceiptData(completeTransaction, fiscalLog);

      // Print the receipt
      const printResult = await this.printReceipt(receiptData);

      if (printResult.status === 'success') {
        console.log(`[PrinterService] ✅ Receipt reprinted successfully for transaction ${transactionId}`);
        return {
          status: 'success',
          message: 'Receipt reprinted successfully',
          transaction_id: transactionId,
          receipt_number: receiptData.receipt_number,
          printer: printResult.printer,
          bytesSize: printResult.bytesSize
        };
      } else {
        console.error(`[PrinterService] ❌ Reprint failed for transaction ${transactionId}:`, printResult.message);
        return {
          status: 'error',
          message: `Reprint failed: ${printResult.message}`,
          transaction_id: transactionId,
          error_details: printResult.error_details || 'Unknown printer error'
        };
      }

    } catch (error) {
      console.error(`[PrinterService] ❌ Receipt reprint error for transaction ${transactionId}:`, error);
      return {
        status: 'error',
        message: error.message,
        transaction_id: transactionId,
        error: error.name
      };
    }
  }
}

module.exports = new PrinterService();