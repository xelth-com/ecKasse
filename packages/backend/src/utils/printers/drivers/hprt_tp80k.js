/**
 * Driver module for the HPRT TP80K.
 * Implements the standard interface required by the core controller.
 */
module.exports = {
  // --- Identity Information ---
  modelName: 'HPRT_TP80K',
  manufacturer: 'HPRT',

  // --- Default Configuration ---
  getDefaultLanConfig: () => ({
    ip: '192.168.0.31',
    cashRegisterTempIp: '192.168.0.100',
    subnet: '255.255.255.0'
  }),
  
  /**
   * Identifies the printer by sending a standard ESC/POS command.
   * @param {object} port - The port object (LAN, COM, or USB).
   * @returns {Promise<boolean>} - True if the response matches the model.
   */
  identify: async (port) => {
    console.log(`[HPRT Module] Identifying device at ${port.type}:${port.ip || port.path}...`);
    
    try {
      // Get system tools for printer identification
      const systemTools = require('../system_tools');
      const identityResult = await systemTools.getPrinterIdentity(port);
      
      console.log(`[HPRT Module] Received identity result:`, identityResult);
      
      // Handle the new status object format
      if (identityResult.status === 'SUCCESS') {
        // Check if the response contains HPRT manufacturer identifier
        const isHPRT = identityResult.data.toUpperCase().includes('HPRT');
        
        if (isHPRT) {
          console.log(`[HPRT Module] ✅ Device identified as HPRT printer`);
          return true;
        } else {
          console.log(`[HPRT Module] ❌ Device is not an HPRT printer`);
          return false;
        }
      } else if (identityResult.status === 'NO_RESPONSE') {
        // If no response, return true as a best-effort guess
        console.log(`[HPRT Module] ⚠️ No response from device, assuming HPRT printer (best-effort guess)`);
        return true;
      } else {
        // Error case
        console.log(`[HPRT Module] ❌ Identification failed: ${identityResult.message || 'Unknown error'}`);
        return false;
      }
      
    } catch (error) {
      console.log(`[HPRT Module] ❌ Identification failed: ${error.message}`);
      return false;
    }
  },

  // --- Configuration Methods ---
  /**
   * Constructs the binary command to set the printer's IP address.
   * @param {string} newIp - The target IP address.
   * @returns {Buffer} - The command as a binary buffer.
   */
  getSetIpCommand: (newIp) => {
    // The specific system command for this model
    const setIpPrefix = Buffer.from([0x1F, 0x1B, 0x1F, 0x91, 0x00, 0x49, 0x50]);
    const ipBytes = Buffer.from(newIp.split('.').map(num => parseInt(num, 10)));
    return Buffer.concat([setIpPrefix, ipBytes]);
  },
  
  // Returns the required delay in ms for the printer to restart after IP change.
  getRestartDelay: () => 15000,

  /**
   * HPRT TP80K specific commands based on programming manual
   */
  getHPRTCommands: () => ({
    // Printer status commands
    TRANSMIT_STATUS: Buffer.from([0x1B, 0x76]), // ESC v
    TRANSMIT_PRINTER_ID: Buffer.from([0x1D, 0x49, 0x42]), // GS I 66 - Get manufacturer "HPRT"
    
    // Buzzer/Beeper commands 
    generateBuzzerCommand: (times = 3, onTime = 2, offTime = 2) => {
      // ESC ( A pL pH fn n c t1 t2 - Function 97 (beeper)
      return Buffer.from([
        0x1B, 0x28, 0x41,  // ESC ( A
        0x05, 0x00,        // pL pH (5 bytes)
        0x61,              // fn = 97
        0x64,              // n = 100
        Math.min(times, 63), // c = times (0-63)
        Math.min(onTime, 255), // t1 = on time * 100ms
        Math.min(offTime, 255) // t2 = off time * 100ms
      ]);
    },

    // Paper cutting commands specific to HPRT
    CUT_PARTIAL_ONE_POINT: Buffer.from([0x1B, 0x69]), // ESC i - partial cut (one point)
    CUT_PARTIAL_THREE_POINTS: Buffer.from([0x1B, 0x6D]), // ESC m - partial cut (three points)
    CUT_FULL: Buffer.from([0x1D, 0x56, 0x00]), // GS V 0 - full cut
    
    // Cash drawer pulse generation
    generateDrawerPulse: (pin = 0, onTime = 50, offTime = 200) => {
      // ESC p m t1 t2
      return Buffer.from([
        0x1B, 0x70,
        pin === 0 ? 0x00 : 0x01, // m: pin 2 (0) or pin 5 (1)
        Math.min(onTime, 255),   // t1: ON time = t1*2ms
        Math.min(offTime, 255)   // t2: OFF time = t2*2ms
      ]);
    },

    // Print density control (HPRT specific)
    SET_DENSITY_LIGHT: Buffer.from([0x1B, 0x45, 0x00]), // ESC E 0
    SET_DENSITY_NORMAL: Buffer.from([0x1B, 0x45, 0x01]), // ESC E 1
    SET_DENSITY_DARK: Buffer.from([0x1B, 0x45, 0x02]),   // ESC E 2

    // Test print commands
    generateTestPrintCommand: (type = 'config') => {
      // GS ( A pL pH n m - Execute test printing
      const testTypes = {
        'hex': 0x01,     // Hex dump printing
        'config': 0x02,  // Printer configuration
        'paper': 0x04    // Paper verification
      };
      return Buffer.from([
        0x1D, 0x28, 0x41, // GS ( A
        0x02, 0x00,        // pL pH (2 bytes)
        0x00,              // n = 0 (general paper roll)
        testTypes[type] || 0x02 // m = test type
      ]);
    }
  }),

  /**
   * Generates ESC/POS print commands from receipt data and template
   * @param {Object} receiptData - The data to print (items, totals, etc.)
   * @param {Object} template - The receipt template structure
   * @returns {Buffer} - Complete ESC/POS command buffer ready for printing
   */
  generatePrintCommands: (receiptData, template) => {
    console.log(`[HPRT Module] Generating print commands for receipt...`);
    
    const commands = require('../commands');
    const hprtCommands = module.exports.getHPRTCommands();
    const printBuffer = [];
    
    try {
      // Initialize printer with HPRT-specific setup
      printBuffer.push(commands.COMMANDS.INIT);
      printBuffer.push(commands.COMMANDS.CHARSET_GERMANY); // German charset for Euro symbol
      printBuffer.push(commands.COMMANDS.CODEPAGE_CP858);  // Latin-1 + Euro
      
      // Set optimal print density for receipts
      printBuffer.push(hprtCommands.SET_DENSITY_NORMAL);
      
      // Process template sections
      const templateSections = ['header', 'body', 'footer'];
      
      for (const sectionName of templateSections) {
        const section = template.template[sectionName];
        if (!section || !Array.isArray(section)) continue;
        
        console.log(`[HPRT Module] Processing ${sectionName} section with ${section.length} elements`);
        
        for (const element of section) {
          try {
            const elementBuffer = module.exports.processTemplateElement(element, receiptData, commands);
            if (elementBuffer) {
              printBuffer.push(elementBuffer);
            }
          } catch (elementError) {
            console.error(`[HPRT Module] Error processing element:`, elementError);
            // Continue with other elements even if one fails
          }
        }
      }
      
      // Ensure we end with line feeds and reset formatting
      printBuffer.push(commands.COMMANDS.RESET_FORMATTING);
      
      const finalBuffer = Buffer.concat(printBuffer);
      console.log(`[HPRT Module] Generated ${finalBuffer.length} bytes of print commands`);
      
      return finalBuffer;
      
    } catch (error) {
      console.error(`[HPRT Module] Error generating print commands:`, error);
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
          return commands.generateQRCodeCommand(qrData, element.size || 'medium');
        }
        return null;
      }
      
      case 'cut_paper': {
        const hprtCommands = module.exports.getHPRTCommands();
        const cutType = element.cut_type || 'partial';
        
        // Use HPRT-specific cutting commands for better precision
        switch (cutType) {
          case 'full':
            return hprtCommands.CUT_FULL;
          case 'partial_one':
            return hprtCommands.CUT_PARTIAL_ONE_POINT;
          case 'partial_three':
            return hprtCommands.CUT_PARTIAL_THREE_POINTS;
          default:
            return hprtCommands.CUT_PARTIAL_ONE_POINT; // Default to one point partial cut
        }
      }
      
      case 'buzzer': {
        const hprtCommands = module.exports.getHPRTCommands();
        const times = element.times || 2;
        const onTime = element.on_time || 1; // 100ms units
        const offTime = element.off_time || 1;
        
        return hprtCommands.generateBuzzerCommand(times, onTime, offTime);
      }
      
      case 'drawer_pulse': {
        const hprtCommands = module.exports.getHPRTCommands();
        const pin = element.pin || 0; // 0 for pin 2, 1 for pin 5
        const onTime = element.on_time || 50; // 2ms units
        const offTime = element.off_time || 200;
        
        return hprtCommands.generateDrawerPulse(pin, onTime, offTime);
      }
      
      case 'test_print': {
        const hprtCommands = module.exports.getHPRTCommands();
        const testType = element.test_type || 'config';
        
        return hprtCommands.generateTestPrintCommand(testType);
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
          
          // Quantity and price line
          const qtyPriceText = commands.processTemplateVariables(
            element.format?.quantity_price_line?.format || '{{ quantity }} x {{ unit_price }} EUR',
            item
          );
          
          // Create justified line with quantity info on left and total on right
          const totalPriceText = `${item.total_price.toFixed(2)} EUR`;
          const maxLineLength = 32;
          const leftText = qtyPriceText;
          const rightText = totalPriceText;
          const spacesNeeded = Math.max(1, maxLineLength - leftText.length - rightText.length);
          const justifiedLine = leftText + ' '.repeat(spacesNeeded) + rightText;
          
          const qtyPriceBuffer = commands.generateTextCommand(justifiedLine, {
            alignment: 'left',
            style: element.format?.quantity_price_line?.style || 'normal',
            font_size: element.format?.quantity_price_line?.font_size || 'small'
          });
          itemBuffers.push(qtyPriceBuffer);
        }
        
        return Buffer.concat(itemBuffers);
      }
      
      default:
        console.warn(`[HPRT Module] Unknown template element type: ${element.type}`);
        return null;
    }
  },

  /**
   * Enhanced identification using HPRT-specific commands
   * @param {Object} port - Port object for communication
   * @returns {Promise<Object>} Detailed printer information
   */
  getDetailedPrinterInfo: async (port) => {
    const systemTools = require('../system_tools');
    const hprtCommands = module.exports.getHPRTCommands();
    
    try {
      console.log(`[HPRT Module] Getting detailed printer information...`);
      
      // Try to get manufacturer info using HPRT-specific command
      const manufacturerResult = await new Promise((resolve) => {
        systemTools.execute_printer_command(port, hprtCommands.TRANSMIT_PRINTER_ID, 3000)
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
      
      // Get printer status
      const statusResult = await new Promise((resolve) => {
        systemTools.execute_printer_command(port, hprtCommands.TRANSMIT_STATUS, 3000)
          .then(result => {
            if (result.status === 'success' && result.responseData) {
              const statusByte = result.responseData[0] || 0;
              resolve({
                paperNearEnd: (statusByte & 0x03) !== 0,
                paperOut: (statusByte & 0x0C) !== 0,
                statusByte
              });
            } else {
              resolve({ error: 'No status response' });
            }
          })
          .catch(() => resolve({ error: 'Status query failed' }));
      });
      
      return {
        manufacturer: manufacturerResult,
        status: statusResult,
        model: 'HPRT_TP80K',
        capabilities: {
          buzzer: true,
          cutter: true,
          drawer: true,
          densityControl: true,
          testPrint: true,
          qrCode: true,
          barcode: true
        }
      };
      
    } catch (error) {
      console.error(`[HPRT Module] Error getting detailed info:`, error);
      return { error: error.message };
    }
  },

  /**
   * Execute printer self-test and configuration print
   * @param {Object} port - Port object for communication
   * @param {String} testType - Type of test ('config', 'hex', 'paper')
   * @returns {Promise<Object>} Test execution result
   */
  executeSelfTest: async (port, testType = 'config') => {
    const systemTools = require('../system_tools');
    const hprtCommands = module.exports.getHPRTCommands();
    
    try {
      console.log(`[HPRT Module] Executing self-test: ${testType}`);
      
      const testCommand = hprtCommands.generateTestPrintCommand(testType);
      const result = await systemTools.execute_printer_command(port, testCommand, 10000);
      
      if (result.status === 'success') {
        console.log(`[HPRT Module] Self-test completed successfully`);
        return { status: 'success', message: `${testType} test executed` };
      } else {
        return { status: 'error', message: `Test failed: ${result.message}` };
      }
      
    } catch (error) {
      console.error(`[HPRT Module] Self-test error:`, error);
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
    const hprtCommands = module.exports.getHPRTCommands();
    
    try {
      const pin = options.pin || 0;
      const onTime = options.onTime || 50;   // Default 100ms (50 * 2ms)
      const offTime = options.offTime || 200; // Default 400ms (200 * 2ms)
      
      console.log(`[HPRT Module] Opening cash drawer - Pin:${pin}, On:${onTime*2}ms, Off:${offTime*2}ms`);
      
      const drawerCommand = hprtCommands.generateDrawerPulse(pin, onTime, offTime);
      const result = await systemTools.execute_printer_command(port, drawerCommand, 3000);
      
      if (result.status === 'success') {
        return { status: 'success', message: 'Cash drawer opened' };
      } else {
        return { status: 'error', message: `Drawer operation failed: ${result.message}` };
      }
      
    } catch (error) {
      console.error(`[HPRT Module] Cash drawer error:`, error);
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
    const hprtCommands = module.exports.getHPRTCommands();
    
    try {
      const times = options.times || 2;
      const onTime = options.onTime || 2;   // 200ms (2 * 100ms)
      const offTime = options.offTime || 1; // 100ms (1 * 100ms)
      
      console.log(`[HPRT Module] Sounding buzzer - Times:${times}, On:${onTime*100}ms, Off:${offTime*100}ms`);
      
      const buzzerCommand = hprtCommands.generateBuzzerCommand(times, onTime, offTime);
      const result = await systemTools.execute_printer_command(port, buzzerCommand, 5000);
      
      if (result.status === 'success') {
        return { status: 'success', message: 'Buzzer activated' };
      } else {
        return { status: 'error', message: `Buzzer operation failed: ${result.message}` };
      }
      
    } catch (error) {
      console.error(`[HPRT Module] Buzzer error:`, error);
      return { status: 'error', message: error.message };
    }
  }
};