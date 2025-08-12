/**
 * Driver module for the Xprinter XP-V330L.
 * Implements the standard interface required by the core controller.
 */
module.exports = {
  // --- Identity Information ---
  modelName: 'XPRINTER_XP-V330L',
  manufacturer: 'Xprinter',

  // --- Default Configuration ---
  getDefaultLanConfig: () => ({
    ip: '192.168.123.100',
    cashRegisterTempIp: '192.168.123.101',
    subnet: '255.255.255.0'
  }),
  
  /**
   * Identifies the printer by sending a standard ESC/POS command.
   * @param {object} port - The port object (LAN, COM, or USB).
   * @returns {Promise<boolean>} - True if the response matches the model.
   */
  identify: async (port) => {
    console.log(`[Xprinter Module] Identifying device at ${port.type}:${port.ip || port.path}...`);
    
    try {
      // Get system tools for printer identification
      const systemTools = require('../system_tools');
      const identityResult = await systemTools.getPrinterIdentity(port);
      
      console.log(`[Xprinter Module] Received identity result:`, identityResult);
      
      // Handle the new status object format
      if (identityResult.status === 'SUCCESS') {
        // Check if the response contains Xprinter manufacturer identifier
        const isXprinter = identityResult.data.toUpperCase().includes('XPRINTER') || 
                          identityResult.data.toUpperCase().includes('XP-');
        
        if (isXprinter) {
          console.log(`[Xprinter Module] ✅ Device identified as Xprinter`);
          return true;
        } else {
          console.log(`[Xprinter Module] ❌ Device is not an Xprinter`);
          return false;
        }
      } else if (identityResult.status === 'NO_RESPONSE') {
        // If no response, return true as a best-effort guess
        console.log(`[Xprinter Module] ⚠️ No response from device, assuming Xprinter (best-effort guess)`);
        return true;
      } else {
        // Error case
        console.log(`[Xprinter Module] ❌ Identification failed: ${identityResult.message || 'Unknown error'}`);
        return false;
      }
      
    } catch (error) {
      console.log(`[Xprinter Module] ❌ Identification failed: ${error.message}`);
      return false;
    }
  },

  // --- Configuration Methods ---
  /**
   * Constructs the binary command to set the printer's IP address.
   * @param {string} newIp - The target IP address, e.g., '192.168.1.250'.
   * @returns {Buffer} - The command as a binary buffer.
   */
  getSetIpCommand: (newIp) => {
    // This is the specific, non-documented command for this model
    const setIpPrefix = Buffer.from([0x1F, 0x1B, 0x1F, 0x91, 0x00, 0x53, 0x45, 0x54, 0x20, 0x49, 0x50]); 
    const ipBytes = Buffer.from(newIp.split('.').map(num => parseInt(num, 10)));
    return Buffer.concat([setIpPrefix, ipBytes]);
  },
  
  // Returns the required delay in ms for the printer to restart after IP change.
  getRestartDelay: () => 15000,

  /**
   * Xprinter XP-V330L specific commands based on ESC Linux SDK Manual
   */
  getXprinterCommands: () => ({
    // Printer status and information commands
    GET_PRINTER_STATE: Buffer.from([0x10, 0x04, 0x01]), // DLE EOT 1 - Real-time status
    GET_PRINTER_STATE_2: Buffer.from([0x10, 0x04, 0x02]), // DLE EOT 2 - Offline status
    GET_PAPER_SENSOR_STATUS: Buffer.from([0x10, 0x04, 0x03]), // DLE EOT 3 - Error status
    GET_CONTINUOUS_STATUS: Buffer.from([0x10, 0x04, 0x04]), // DLE EOT 4 - Paper sensor
    TRANSMIT_PRINTER_ID: Buffer.from([0x1D, 0x49, 0x01]), // GS I 1 - Get printer model ID
    TRANSMIT_VERSION_INFO: Buffer.from([0x1D, 0x49, 0x02]), // GS I 2 - Get firmware version
    
    // Text printing commands (PrintTextS equivalent)
    PRINT_AND_LINE_FEED: Buffer.from([0x0A]), // LF - Print and line feed
    PRINT_AND_CARRIAGE_RETURN: Buffer.from([0x0D]), // CR - Print and carriage return
    
    // Character set and code page commands
    SELECT_INTERNATIONAL_CHARSET: (charset = 0) => Buffer.from([0x1B, 0x52, charset]), // ESC R n
    SELECT_CODE_PAGE: (codepage = 0) => Buffer.from([0x1B, 0x74, codepage]), // ESC t n
    
    // Font and formatting commands
    SET_FONT_SIZE: (width = 0, height = 0) => Buffer.from([0x1D, 0x21, (height << 4) | width]), // GS ! n
    SET_CHARACTER_SPACING: (n = 0) => Buffer.from([0x1B, 0x20, n]), // ESC SP n
    SET_LINE_SPACING: (n = 32) => Buffer.from([0x1B, 0x33, n]), // ESC 3 n
    
    // Cut paper commands  
    CUT_PAPER_FULL: Buffer.from([0x1D, 0x56, 0x00]), // GS V 0 - Full cut
    CUT_PAPER_PARTIAL: Buffer.from([0x1D, 0x56, 0x01]), // GS V 1 - Partial cut
    CUT_PAPER_FEED_FULL: (lines = 3) => Buffer.from([0x1D, 0x56, 0x41, lines]), // GS V A n - Feed and full cut
    CUT_PAPER_FEED_PARTIAL: (lines = 3) => Buffer.from([0x1D, 0x56, 0x42, lines]), // GS V B n - Feed and partial cut
    
    // Cash drawer commands
    generateDrawerPulse: (pin = 0, onTime = 50, offTime = 200) => {
      // ESC p m t1 t2 - Generate drawer pulse
      return Buffer.from([
        0x1B, 0x70,
        pin === 0 ? 0x00 : 0x01, // m: pin 2 (0) or pin 5 (1)  
        Math.min(onTime, 255),   // t1: ON time = t1*2ms
        Math.min(offTime, 255)   // t2: OFF time = t2*2ms
      ]);
    },
    
    // Barcode printing commands (PrintSymbol equivalent)
    SET_BARCODE_HEIGHT: (height = 162) => Buffer.from([0x1D, 0x68, height]), // GS h n
    SET_BARCODE_WIDTH: (width = 3) => Buffer.from([0x1D, 0x77, width]), // GS w n
    SET_BARCODE_FONT: (font = 0) => Buffer.from([0x1D, 0x66, font]), // GS f n
    SET_BARCODE_POSITION: (pos = 0) => Buffer.from([0x1D, 0x48, pos]), // GS H n
    
    // QR code commands
    generateQRCommand: (data, size = 4, errorCorrection = 48) => {
      const dataBuffer = Buffer.from(data, 'utf8');
      const pL = (dataBuffer.length + 3) & 0xFF;
      const pH = ((dataBuffer.length + 3) >> 8) & 0xFF;
      
      return Buffer.concat([
        Buffer.from([0x1D, 0x28, 0x6B, pL, pH, 0x31, 0x50, 0x30]), // GS ( k - QR Code model
        Buffer.from([0x1D, 0x28, 0x6B, 0x03, 0x00, 0x31, 0x43, size]), // Size setting
        Buffer.from([0x1D, 0x28, 0x6B, 0x03, 0x00, 0x31, 0x45, errorCorrection]), // Error correction
        Buffer.from([0x1D, 0x28, 0x6B, pL, pH, 0x31, 0x44, 0x30]), // Store data
        dataBuffer,
        Buffer.from([0x1D, 0x28, 0x6B, 0x03, 0x00, 0x31, 0x51, 0x30]) // Print stored QR code
      ]);
    },
    
    // Image and logo printing commands
    SET_PRINT_MODE: (mode = 0) => Buffer.from([0x1B, 0x21, mode]), // ESC ! n
    SELECT_BITMAP_MODE: (mode = 0, dots = 0) => Buffer.from([0x1B, 0x2A, mode, dots & 0xFF, (dots >> 8) & 0xFF]), // ESC * m nL nH
    
    // Paper feed commands
    PRINT_AND_FEED_LINES: (lines = 1) => Buffer.from([0x1B, 0x64, lines]), // ESC d n
    FEED_MARKED_PAPER: Buffer.from([0x1B, 0x69]), // ESC i - Feed to mark position
    
    // Buzzer/beeper commands (if supported)
    generateBuzzerCommand: (times = 3, onTime = 2, offTime = 2) => {
      // ESC B n t - Buzzer (if supported by model)
      return Buffer.from([0x1B, 0x42, times, onTime]);
    },
    
    // Print density and speed control
    SET_PRINT_DENSITY: (density = 8, heatTime = 80, heatInterval = 2) => {
      return Buffer.from([0x12, 0x23, density, heatTime, heatInterval]); // DC2 # n1 n2 n3
    }
  }),

  /**
   * Generates ESC/POS print commands from receipt data and template
   * Based on ESC Linux SDK Manual for Xprinter compatibility
   * @param {Object} receiptData - The data to print (items, totals, etc.)
   * @param {Object} template - The receipt template structure
   * @returns {Buffer} - Complete ESC/POS command buffer ready for printing
   */
  generatePrintCommands: (receiptData, template) => {
    console.log(`[Xprinter Module] Generating print commands for receipt...`);
    
    const commands = require('../commands');
    const xprinterCommands = module.exports.getXprinterCommands();
    const printBuffer = [];
    
    try {
      // Initialize printer with Xprinter-specific setup
      printBuffer.push(commands.COMMANDS.INIT);
      printBuffer.push(commands.COMMANDS.CHARSET_GERMANY); // German charset for Euro symbol
      printBuffer.push(commands.COMMANDS.CODEPAGE_CP858);  // Latin-1 + Euro
      
      // Set optimal print density and formatting for receipts
      printBuffer.push(xprinterCommands.SET_PRINT_DENSITY(8, 80, 2)); // Medium density
      printBuffer.push(xprinterCommands.SET_LINE_SPACING(32)); // Standard line spacing
      
      // Process template sections
      const templateSections = ['header', 'body', 'footer'];
      
      for (const sectionName of templateSections) {
        const section = template.template[sectionName];
        if (!section || !Array.isArray(section)) continue;
        
        console.log(`[Xprinter Module] Processing ${sectionName} section with ${section.length} elements`);
        
        for (const element of section) {
          try {
            const elementBuffer = module.exports.processTemplateElement(element, receiptData, commands);
            if (elementBuffer) {
              printBuffer.push(elementBuffer);
            }
          } catch (elementError) {
            console.error(`[Xprinter Module] Error processing element:`, elementError);
            // Continue with other elements even if one fails
          }
        }
      }
      
      // Ensure we end with line feeds and reset formatting
      printBuffer.push(commands.COMMANDS.RESET_FORMATTING);
      
      const finalBuffer = Buffer.concat(printBuffer);
      console.log(`[Xprinter Module] Generated ${finalBuffer.length} bytes of print commands`);
      
      return finalBuffer;
      
    } catch (error) {
      console.error(`[Xprinter Module] Error generating print commands:`, error);
      // Return a minimal error message instead of throwing
      const errorBuffer = Buffer.concat([
        commands.COMMANDS.INIT,
        commands.generateTextCommand('PRINT ERROR\nPlease check logs', { alignment: 'center' }),
        commands.generateLineFeed(3),
        commands.generateCutCommand('partial')
      ]);
      return errorBuffer;
    }
  },

  /**
   * Processes a single template element and returns the corresponding ESC/POS commands
   * Uses PrintTextS equivalent commands for text and PrintSymbol equivalent for QR codes
   * @param {Object} element - Template element to process
   * @param {Object} receiptData - Data for variable substitution
   * @param {Object} commands - Commands utility module
   * @returns {Buffer|null} - ESC/POS commands or null if element should be skipped
   */
  processTemplateElement: (element, receiptData, commands) => {
    if (!element || !element.type) return null;
    
    switch (element.type) {
      case 'text': {
        let content = element.content || '';
        content = commands.processTemplateVariables(content, receiptData);
        
        // Use PrintTextS equivalent formatting
        return commands.generateTextCommand(content, {
          alignment: element.alignment || 'left',
          style: element.style || 'normal',
          font_size: element.font_size || 'normal'
        });
      }
      
      case 'line_separator': {
        return commands.generateLineSeparator(
          element.character || '-',
          element.length || 32
        );
      }
      
      case 'line_feed': {
        return commands.generateLineFeed(element.count || 1);
      }
      
      case 'qr_code': {
        let qrData = element.content || '';
        qrData = commands.processTemplateVariables(qrData, receiptData);
        
        if (qrData) {
          // Use Xprinter-specific QR code generation for better compatibility
          const sizeMapping = { 'small': 3, 'medium': 4, 'large': 6 };
          const qrSize = sizeMapping[element.size] || 4;
          return module.exports.getXprinterCommands().generateQRCommand(qrData, qrSize);
        }
        return null;
      }
      
      case 'cut_paper': {
        const xprinterCommands = module.exports.getXprinterCommands();
        const cutType = element.cut_type || 'partial';
        
        // Use Xprinter-specific cutting commands
        switch (cutType) {
          case 'full':
            return xprinterCommands.CUT_PAPER_FULL;
          case 'partial':
            return xprinterCommands.CUT_PAPER_PARTIAL;
          case 'feed_full':
            const feedLinesF = element.feed_lines || 3;
            return xprinterCommands.CUT_PAPER_FEED_FULL(feedLinesF);
          case 'feed_partial':
            const feedLinesP = element.feed_lines || 3;
            return xprinterCommands.CUT_PAPER_FEED_PARTIAL(feedLinesP);
          default:
            return xprinterCommands.CUT_PAPER_PARTIAL; // Default to partial cut
        }
      }
      
      case 'buzzer': {
        const xprinterCommands = module.exports.getXprinterCommands();
        const times = element.times || 2;
        const onTime = element.on_time || 2;
        
        return xprinterCommands.generateBuzzerCommand(times, onTime);
      }
      
      case 'drawer_pulse': {
        const xprinterCommands = module.exports.getXprinterCommands();
        const pin = element.pin || 0; // 0 for pin 2, 1 for pin 5
        const onTime = element.on_time || 50; // 2ms units
        const offTime = element.off_time || 200;
        
        return xprinterCommands.generateDrawerPulse(pin, onTime, offTime);
      }
      
      case 'barcode': {
        const xprinterCommands = module.exports.getXprinterCommands();
        let barcodeData = element.content || '';
        barcodeData = commands.processTemplateVariables(barcodeData, receiptData);
        
        if (barcodeData) {
          const height = element.height || 162;
          const width = element.width || 3;
          const font = element.font || 0;
          const position = element.position || 0; // 0=no text, 1=above, 2=below, 3=both
          
          return Buffer.concat([
            xprinterCommands.SET_BARCODE_HEIGHT(height),
            xprinterCommands.SET_BARCODE_WIDTH(width),
            xprinterCommands.SET_BARCODE_FONT(font),
            xprinterCommands.SET_BARCODE_POSITION(position),
            Buffer.from([0x1D, 0x6B, 0x02]), // GS k 2 - CODE128 barcode
            Buffer.from(barcodeData, 'ascii'),
            Buffer.from([0x00]) // Null terminator
          ]);
        }
        return null;
      }
      
      case 'items_list': {
        const items = receiptData.items || [];
        if (!Array.isArray(items) || items.length === 0) return null;
        
        const itemBuffers = [];
        
        for (const item of items) {
          // Item name line
          const itemNameBuffer = commands.generateTextCommand(item.name, {
            alignment: element.format?.item_name?.alignment || 'left',
            style: element.format?.item_name?.style || 'normal',
            font_size: element.format?.item_name?.font_size || 'normal'
          });
          itemBuffers.push(itemNameBuffer);
          
          // Quantity and price line - create justified layout for Xprinter
          const qtyPriceText = commands.processTemplateVariables(
            element.format?.quantity_price_line?.format || '{{ quantity }} x {{ unit_price }} EUR',
            item
          );
          
          // Create justified line with quantity info on left and total on right
          const totalPriceText = `${item.total_price.toFixed(2)} EUR`;
          const maxLineLength = 32; // Standard thermal printer width
          const leftText = qtyPriceText;
          const rightText = totalPriceText;
          const spacesNeeded = Math.max(1, maxLineLength - leftText.length - rightText.length);
          const justifiedLine = leftText + ' '.repeat(spacesNeeded) + rightText;
          
          const qtyPriceBuffer = commands.generateTextCommand(justifiedLine, {
            alignment: 'left', // Left alignment for justified text
            style: element.format?.quantity_price_line?.style || 'normal',
            font_size: element.format?.quantity_price_line?.font_size || 'small'
          });
          itemBuffers.push(qtyPriceBuffer);
        }
        
        return Buffer.concat(itemBuffers);
      }
      
      default:
        console.warn(`[Xprinter Module] Unknown template element type: ${element.type}`);
        return null;
    }
  },

  /**
   * Enhanced printer information using Xprinter-specific commands
   * @param {Object} port - Port object for communication
   * @returns {Promise<Object>} Detailed printer information
   */
  getDetailedPrinterInfo: async (port) => {
    const systemTools = require('../system_tools');
    const xprinterCommands = module.exports.getXprinterCommands();
    
    try {
      console.log(`[Xprinter Module] Getting detailed printer information...`);
      
      // Try to get printer model ID
      const modelResult = await new Promise((resolve) => {
        systemTools.execute_printer_command(port, xprinterCommands.TRANSMIT_PRINTER_ID, 3000)
          .then(result => {
            if (result.status === 'success' && result.responseData) {
              resolve({ 
                status: 'SUCCESS', 
                data: result.responseData.toString('ascii').trim() 
              });
            } else {
              resolve({ status: 'NO_RESPONSE' });
            }
          })
          .catch(() => resolve({ status: 'ERROR' }));
      });
      
      // Try to get firmware version
      const versionResult = await new Promise((resolve) => {
        systemTools.execute_printer_command(port, xprinterCommands.TRANSMIT_VERSION_INFO, 3000)
          .then(result => {
            if (result.status === 'success' && result.responseData) {
              resolve({ 
                status: 'SUCCESS', 
                data: result.responseData.toString('ascii').trim() 
              });
            } else {
              resolve({ status: 'NO_RESPONSE' });
            }
          })
          .catch(() => resolve({ status: 'ERROR' }));
      });
      
      // Get real-time printer status
      const statusResult = await new Promise((resolve) => {
        systemTools.execute_printer_command(port, xprinterCommands.GET_PRINTER_STATE, 3000)
          .then(result => {
            if (result.status === 'success' && result.responseData) {
              const statusByte = result.responseData[0] || 0;
              resolve({
                online: (statusByte & 0x08) === 0,
                paperOut: (statusByte & 0x20) !== 0,
                coverOpen: (statusByte & 0x04) !== 0,
                feedButton: (statusByte & 0x01) !== 0,
                statusByte
              });
            } else {
              resolve({ error: 'No status response' });
            }
          })
          .catch(() => resolve({ error: 'Status query failed' }));
      });
      
      return {
        model: modelResult,
        version: versionResult,
        status: statusResult,
        manufacturer: 'Xprinter',
        modelName: 'XP-V330L',
        capabilities: {
          buzzer: true,
          cutter: true,
          drawer: true,
          barcode: true,
          qrCode: true,
          densityControl: true,
          bitmapPrint: true,
          realTimeStatus: true
        }
      };
      
    } catch (error) {
      console.error(`[Xprinter Module] Error getting detailed info:`, error);
      return { error: error.message };
    }
  },

  /**
   * Execute real-time status query
   * @param {Object} port - Port object for communication
   * @returns {Promise<Object>} Status query result
   */
  queryPrinterStatus: async (port) => {
    const systemTools = require('../system_tools');
    const xprinterCommands = module.exports.getXprinterCommands();
    
    try {
      console.log(`[Xprinter Module] Querying printer status...`);
      
      const statusResult = await systemTools.execute_printer_command(port, xprinterCommands.GET_PRINTER_STATE, 3000);
      
      if (statusResult.status === 'success' && statusResult.responseData) {
        const statusByte = statusResult.responseData[0];
        return {
          status: 'success',
          online: (statusByte & 0x08) === 0,
          paperOut: (statusByte & 0x20) !== 0,
          coverOpen: (statusByte & 0x04) !== 0,
          feedButton: (statusByte & 0x01) !== 0,
          rawStatus: statusByte
        };
      } else {
        return { status: 'error', message: 'No status response received' };
      }
      
    } catch (error) {
      console.error(`[Xprinter Module] Status query error:`, error);
      return { status: 'error', message: error.message };
    }
  },

  /**
   * Control cash drawer with configurable pulse
   * @param {Object} port - Port object for communication
   * @param {Object} options - Drawer control options
   * @returns {Promise<Object>} Operation result
   */
  controlCashDrawer: async (port, options = {}) => {
    const systemTools = require('../system_tools');
    const xprinterCommands = module.exports.getXprinterCommands();
    
    try {
      const pin = options.pin || 0;
      const onTime = options.onTime || 50;   // Default 100ms (50 * 2ms)
      const offTime = options.offTime || 200; // Default 400ms (200 * 2ms)
      
      console.log(`[Xprinter Module] Opening cash drawer - Pin:${pin}, On:${onTime*2}ms, Off:${offTime*2}ms`);
      
      const drawerCommand = xprinterCommands.generateDrawerPulse(pin, onTime, offTime);
      const result = await systemTools.execute_printer_command(port, drawerCommand, 3000);
      
      if (result.status === 'success') {
        return { status: 'success', message: 'Cash drawer opened' };
      } else {
        return { status: 'error', message: `Drawer operation failed: ${result.message}` };
      }
      
    } catch (error) {
      console.error(`[Xprinter Module] Cash drawer error:`, error);
      return { status: 'error', message: error.message };
    }
  },

  /**
   * Sound buzzer with configurable pattern
   * @param {Object} port - Port object for communication
   * @param {Object} options - Buzzer options
   * @returns {Promise<Object>} Operation result
   */
  soundBuzzer: async (port, options = {}) => {
    const systemTools = require('../system_tools');
    const xprinterCommands = module.exports.getXprinterCommands();
    
    try {
      const times = options.times || 2;
      const onTime = options.onTime || 2;   // Duration of each beep
      
      console.log(`[Xprinter Module] Sounding buzzer - Times:${times}, Duration:${onTime}`);
      
      const buzzerCommand = xprinterCommands.generateBuzzerCommand(times, onTime);
      const result = await systemTools.execute_printer_command(port, buzzerCommand, 5000);
      
      if (result.status === 'success') {
        return { status: 'success', message: 'Buzzer activated' };
      } else {
        return { status: 'error', message: `Buzzer operation failed: ${result.message}` };
      }
      
    } catch (error) {
      console.error(`[Xprinter Module] Buzzer error:`, error);
      return { status: 'error', message: error.message };
    }
  },

  /**
   * Print test page with various test patterns
   * @param {Object} port - Port object for communication
   * @param {String} testType - Type of test ('ascii', 'barcode', 'qr', 'full')
   * @returns {Promise<Object>} Test execution result
   */
  executeTestPrint: async (port, testType = 'ascii') => {
    const systemTools = require('../system_tools');
    const xprinterCommands = module.exports.getXprinterCommands();
    const commands = require('../commands');
    
    try {
      console.log(`[Xprinter Module] Executing test print: ${testType}`);
      
      let testBuffer;
      
      switch (testType) {
        case 'ascii':
          testBuffer = Buffer.concat([
            commands.COMMANDS.INIT,
            commands.generateTextCommand('=== XPRINTER TEST PAGE ===', { alignment: 'center', style: 'bold' }),
            commands.generateLineFeed(2),
            commands.generateTextCommand('ASCII Characters:', { style: 'bold' }),
            commands.generateLineFeed(1),
            commands.generateTextCommand('0123456789 ABCDEFGHIJKLMNOPQRSTUVWXYZ'),
            commands.generateLineFeed(1),
            commands.generateTextCommand('abcdefghijklmnopqrstuvwxyz !@#$%^&*()'),
            commands.generateLineFeed(3),
            xprinterCommands.CUT_PAPER_PARTIAL
          ]);
          break;
          
        case 'barcode':
          testBuffer = Buffer.concat([
            commands.COMMANDS.INIT,
            commands.generateTextCommand('=== BARCODE TEST ===', { alignment: 'center', style: 'bold' }),
            commands.generateLineFeed(2),
            xprinterCommands.SET_BARCODE_HEIGHT(100),
            xprinterCommands.SET_BARCODE_WIDTH(2),
            xprinterCommands.SET_BARCODE_POSITION(2), // Below
            Buffer.from([0x1D, 0x6B, 0x02]), // CODE128
            Buffer.from('TEST123456', 'ascii'),
            Buffer.from([0x00]),
            commands.generateLineFeed(3),
            xprinterCommands.CUT_PAPER_PARTIAL
          ]);
          break;
          
        case 'qr':
          testBuffer = Buffer.concat([
            commands.COMMANDS.INIT,
            commands.generateTextCommand('=== QR CODE TEST ===', { alignment: 'center', style: 'bold' }),
            commands.generateLineFeed(2),
            xprinterCommands.generateQRCommand('https://github.com/xelth/ecKasse', 4),
            commands.generateLineFeed(3),
            xprinterCommands.CUT_PAPER_PARTIAL
          ]);
          break;
          
        case 'full':
          testBuffer = Buffer.concat([
            commands.COMMANDS.INIT,
            commands.generateTextCommand('=== FULL CAPABILITY TEST ===', { alignment: 'center', style: 'bold' }),
            commands.generateLineFeed(1),
            commands.generateTextCommand('Font Size Tests:', { style: 'bold' }),
            commands.generateLineFeed(1),
            xprinterCommands.SET_FONT_SIZE(0, 0),
            commands.generateTextCommand('Normal Size Text'),
            commands.generateLineFeed(1),
            xprinterCommands.SET_FONT_SIZE(1, 1),
            commands.generateTextCommand('Double Size'),
            commands.generateLineFeed(1),
            commands.COMMANDS.INIT, // Reset
            commands.generateLineFeed(1),
            xprinterCommands.generateQRCommand('Xprinter XP-V330L Test', 3),
            commands.generateLineFeed(2),
            xprinterCommands.SET_BARCODE_HEIGHT(80),
            xprinterCommands.SET_BARCODE_POSITION(2),
            Buffer.from([0x1D, 0x6B, 0x02]),
            Buffer.from('XP-V330L', 'ascii'),
            Buffer.from([0x00]),
            commands.generateLineFeed(3),
            xprinterCommands.CUT_PAPER_PARTIAL
          ]);
          break;
          
        default:
          return { status: 'error', message: `Unknown test type: ${testType}` };
      }
      
      const result = await systemTools.execute_printer_command(port, testBuffer, 15000);
      
      if (result.status === 'success') {
        console.log(`[Xprinter Module] Test print completed successfully`);
        return { status: 'success', message: `${testType} test executed` };
      } else {
        return { status: 'error', message: `Test failed: ${result.message}` };
      }
      
    } catch (error) {
      console.error(`[Xprinter Module] Test print error:`, error);
      return { status: 'error', message: error.message };
    }
  }
};