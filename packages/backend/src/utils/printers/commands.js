/**
 * ESC/POS Command Definitions
 * Centralized command sequences for ESC/POS compatible printers
 * Based on HPRT TP80K and Xprinter XP-V330L manuals
 */

// Basic ESC/POS control codes
const ESC = 0x1B;
const GS = 0x1D;
const LF = 0x0A;
const CR = 0x0D;
const FF = 0x0C;

/**
 * Basic printer initialization and control commands
 */
const COMMANDS = {
  // Printer initialization
  INIT: Buffer.from([ESC, '@']),
  
  // Line feed and paper control
  LINE_FEED: Buffer.from([LF]),
  CARRIAGE_RETURN: Buffer.from([CR]),
  FORM_FEED: Buffer.from([FF]),
  
  // Paper cutting commands
  CUT_PARTIAL: Buffer.from([GS, 'V', 66, 0]), // Partial cut (leave connecting points)
  CUT_FULL: Buffer.from([GS, 'V', 65, 0]),    // Full cut
  
  // Text alignment
  ALIGN_LEFT: Buffer.from([ESC, 'a', 0]),
  ALIGN_CENTER: Buffer.from([ESC, 'a', 1]),
  ALIGN_RIGHT: Buffer.from([ESC, 'a', 2]),
  
  // Text style commands
  BOLD_ON: Buffer.from([ESC, 'E', 1]),
  BOLD_OFF: Buffer.from([ESC, 'E', 0]),
  ITALIC_ON: Buffer.from([ESC, '4', 1]),
  ITALIC_OFF: Buffer.from([ESC, '4', 0]),
  UNDERLINE_ON: Buffer.from([ESC, '-', 1]),
  UNDERLINE_OFF: Buffer.from([ESC, '-', 0]),
  
  // Font size commands
  FONT_SIZE_NORMAL: Buffer.from([GS, '!', 0x00]),
  FONT_SIZE_DOUBLE_HEIGHT: Buffer.from([GS, '!', 0x01]),
  FONT_SIZE_DOUBLE_WIDTH: Buffer.from([GS, '!', 0x10]),
  FONT_SIZE_DOUBLE_BOTH: Buffer.from([GS, '!', 0x11]),
  
  // Character set selection
  CHARSET_USA: Buffer.from([ESC, 'R', 0]),
  CHARSET_GERMANY: Buffer.from([ESC, 'R', 11]),
  
  // Code page selection (for special characters)
  CODEPAGE_CP437: Buffer.from([ESC, 't', 0]),   // US/Standard
  CODEPAGE_CP850: Buffer.from([ESC, 't', 2]),   // Latin-1
  CODEPAGE_CP858: Buffer.from([ESC, 't', 19]),  // Latin-1 + Euro
  
  // Print and reset text formatting
  RESET_FORMATTING: Buffer.from([ESC, '!', 0])
};

/**
 * Generate QR code command for ESC/POS printers
 * Uses GS ( k command sequence for QR code generation
 * @param {string} data - Data to encode in QR code
 * @param {string} size - Size of QR code ('small', 'medium', 'large')
 * @returns {Buffer} Command buffer for QR code printing
 */
function generateQRCodeCommand(data, size = 'medium') {
  const sizeMap = {
    small: 3,   // Module size 3
    medium: 5,  // Module size 5 
    large: 8    // Module size 8
  };
  
  const moduleSize = sizeMap[size] || 5;
  const dataBytes = Buffer.from(data, 'utf8');
  const dataLength = dataBytes.length;
  
  // Calculate length bytes for GS ( k command
  const pL = (dataLength + 3) & 0xFF;
  const pH = ((dataLength + 3) >> 8) & 0xFF;
  
  const commands = [];
  
  // Set QR code module size: GS ( k pL pH cn fn n
  commands.push(Buffer.from([GS, 0x28, 0x6B, 0x03, 0x00, 0x31, 0x43, moduleSize]));
  
  // Set QR code error correction level (L=0, M=1, Q=2, H=3)
  // Using level M (1) for good balance of error correction and data capacity
  commands.push(Buffer.from([GS, 0x28, 0x6B, 0x03, 0x00, 0x31, 0x45, 0x31]));
  
  // Store QR code data: GS ( k pL pH cn fn m d1...dk
  const storeCommand = Buffer.concat([
    Buffer.from([GS, 0x28, 0x6B, pL, pH, 0x31, 0x50, 0x30]),
    dataBytes
  ]);
  commands.push(storeCommand);
  
  // Print QR code: GS ( k pL pH cn fn m
  commands.push(Buffer.from([GS, 0x28, 0x6B, 0x03, 0x00, 0x31, 0x51, 0x30]));
  
  return Buffer.concat(commands);
}

/**
 * Generate text command with formatting
 * @param {string} text - Text to print
 * @param {Object} options - Formatting options
 * @param {string} options.alignment - 'left', 'center', 'right'
 * @param {string} options.style - 'normal', 'bold', 'italic'
 * @param {string} options.font_size - 'normal', 'large', 'small'
 * @returns {Buffer} Command buffer for formatted text
 */
function generateTextCommand(text, options = {}) {
  const commands = [];
  
  // Set alignment
  if (options.alignment) {
    switch (options.alignment) {
      case 'left':
        commands.push(COMMANDS.ALIGN_LEFT);
        break;
      case 'center':
        commands.push(COMMANDS.ALIGN_CENTER);
        break;
      case 'right':
        commands.push(COMMANDS.ALIGN_RIGHT);
        break;
    }
  }
  
  // Set font size
  if (options.font_size) {
    switch (options.font_size) {
      case 'small':
        commands.push(COMMANDS.FONT_SIZE_NORMAL);
        break;
      case 'normal':
        commands.push(COMMANDS.FONT_SIZE_NORMAL);
        break;
      case 'large':
        commands.push(COMMANDS.FONT_SIZE_DOUBLE_BOTH);
        break;
    }
  }
  
  // Set text style
  if (options.style === 'bold') {
    commands.push(COMMANDS.BOLD_ON);
  }
  if (options.style === 'italic') {
    commands.push(COMMANDS.ITALIC_ON);
  }
  
  // Add the text
  commands.push(Buffer.from(text, 'utf8'));
  
  // Reset formatting after text
  if (options.style === 'bold') {
    commands.push(COMMANDS.BOLD_OFF);
  }
  if (options.style === 'italic') {
    commands.push(COMMANDS.ITALIC_OFF);
  }
  
  // Add line feed
  commands.push(COMMANDS.LINE_FEED);
  
  return Buffer.concat(commands);
}

/**
 * Generate line separator command
 * @param {string} character - Character to use for line (default: '-')
 * @param {number} length - Length of separator line (default: 32)
 * @returns {Buffer} Command buffer for separator line
 */
function generateLineSeparator(character = '-', length = 32) {
  const line = character.repeat(length);
  return generateTextCommand(line, { alignment: 'center' });
}

/**
 * Generate multiple line feeds
 * @param {number} count - Number of line feeds
 * @returns {Buffer} Command buffer for multiple line feeds
 */
function generateLineFeed(count = 1) {
  const feeds = [];
  for (let i = 0; i < count; i++) {
    feeds.push(COMMANDS.LINE_FEED);
  }
  return Buffer.concat(feeds);
}

/**
 * Generate paper cut command
 * @param {string} cutType - 'full' or 'partial'
 * @returns {Buffer} Command buffer for paper cutting
 */
function generateCutCommand(cutType = 'partial') {
  // Add some line feeds before cutting
  const commands = [generateLineFeed(3)];
  
  if (cutType === 'full') {
    commands.push(COMMANDS.CUT_FULL);
  } else {
    commands.push(COMMANDS.CUT_PARTIAL);
  }
  
  return Buffer.concat(commands);
}

/**
 * Process template variable substitution
 * @param {string} template - Template string with {{variable}} placeholders
 * @param {Object} data - Data object with variable values
 * @returns {string} Processed string with variables substituted
 */
function processTemplateVariables(template, data) {
  return template.replace(/\{\{\s*([^}]+)\s*\}\}/g, (match, variable) => {
    const keys = variable.trim().split('.');
    let value = data;
    
    for (const key of keys) {
      if (value && typeof value === 'object' && key in value) {
        value = value[key];
      } else {
        return match; // Return original if variable not found
      }
    }
    
    return value != null ? String(value) : match;
  });
}

module.exports = {
  COMMANDS,
  generateQRCodeCommand,
  generateTextCommand,
  generateLineSeparator,
  generateLineFeed,
  generateCutCommand,
  processTemplateVariables
};