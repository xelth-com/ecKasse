/**
 * Vectron Auswahlfenster Converter (LineType 152)
 * 
 * Converts OOP-POS-MDF display layouts to Vectron Auswahlfenster format
 * See VECTRON_CONVERTER_PLAN.md section 3.4 for details
 * 
 * @module VectronAuswahlfensterConverter
 */

const VectronLineFormatter = require('./utils/formatter');
const { sanitizeText } = require('./utils/encoding');
const VectronFieldMapper = require('./mapping');

/**
 * Convert OOP-POS-MDF display layouts to Vectron Auswahlfenster lines
 * @param {Array} displays - Built-in displays from OOP-POS-MDF
 * @param {Array} categories - Categories from OOP-POS-MDF
 * @param {Array} items - Items from OOP-POS-MDF
 * @param {Object} options - Conversion options
 * @returns {Array} Array of Auswahlfenster lines
 */
function convertDisplayLayoutsToAuswahlfenster(displays, categories, items, options = {}) {
  if (!displays || !Array.isArray(displays)) {
    return [];
  }
  
  const formatter = new VectronLineFormatter();
  const mapper = new VectronFieldMapper(options);
  const defaultLanguage = options.defaultLanguage || 'de';
  const awLines = [];
  
  displays.forEach(display => {
    if (!display.display_activities) return;
    
    display.display_activities.forEach(activity => {
      if (!activity.user_interface_elements) return;
      
      activity.user_interface_elements.forEach(element => {
        try {
          const elementLines = convertUIElementToAuswahlfenster(
            element,
            activity,
            categories,
            items,
            mapper,
            formatter,
            defaultLanguage,
            options
          );
          awLines.push(...elementLines);
        } catch (error) {
          console.error(`Error converting UI element ${element.element_unique_identifier}: ${error.message}`);
          if (options.strictMode) {
            throw error;
          }
        }
      });
    });
  });
  
  return awLines;
}

/**
 * Convert single UI element to Auswahlfenster lines
 * @param {Object} element - UI element from OOP-POS-MDF
 * @param {Object} activity - Parent activity
 * @param {Array} categories - Categories array
 * @param {Array} items - Items array
 * @param {VectronFieldMapper} mapper - Field mapper
 * @param {VectronLineFormatter} formatter - Line formatter
 * @param {string} defaultLanguage - Default language
 * @param {Object} options - Conversion options
 * @returns {Array} Array of Auswahlfenster lines
 */
function convertUIElementToAuswahlfenster(element, activity, categories, items, mapper, formatter, defaultLanguage, options) {
  const lines = [];
  
  // Handle different element types
  switch (element.element_type) {
    case 'CATEGORY_NAVIGATION_PANEL':
      lines.push(...convertCategoryNavigationPanel(element, categories, mapper, formatter, defaultLanguage, options));
      break;
      
    case 'ITEM_GRID':
      lines.push(...convertItemGrid(element, items, categories, mapper, formatter, defaultLanguage, options));
      break;
      
    case 'BUTTON':
      lines.push(...convertButton(element, mapper, formatter, defaultLanguage, options));
      break;
      
    case 'RECEIPT_DISPLAY_AREA':
    case 'NUMERIC_KEYPAD':
      // These elements don't typically generate Auswahlfenster lines
      // but could be used for window layout configuration
      if (options.includeLayoutElements) {
        lines.push(...convertLayoutElement(element, mapper, formatter, defaultLanguage, options));
      }
      break;
      
    default:
      console.warn(`Unknown UI element type: ${element.element_type}`);
  }
  
  return lines;
}

/**
 * Convert category navigation panel to Auswahlfenster lines
 * @param {Object} element - Category navigation panel element
 * @param {Array} categories - Categories array
 * @param {VectronFieldMapper} mapper - Field mapper
 * @param {VectronLineFormatter} formatter - Line formatter
 * @param {string} defaultLanguage - Default language
 * @param {Object} options - Conversion options
 * @returns {Array} Array of Auswahlfenster lines
 */
function convertCategoryNavigationPanel(element, categories, mapper, formatter, defaultLanguage, options) {
  const lines = [];
  
  if (!element.button_configurations) {
    return lines;
  }
  
  // Create main window for category navigation
  const windowNumber = generateWindowNumber(element.element_unique_identifier, options);
  const windowFields = [];
  
  // Window name
  const windowName = getLocalizedText(element.element_names, defaultLanguage) || 'Category Navigation';
  windowFields.push({
    id: 101,
    type: 'TX',
    value: sanitizeText(windowName, options.textLimits?.windowName || 20)
  });
  
  // Background color if specified
  if (element.background_color) {
    const colorCode = convertColorToVectron(element.background_color);
    windowFields.push({
      id: '(20:1)',
      type: 'NR',
      value: colorCode
    });
  }
  
  lines.push(formatter.formatAuswahlfensterLine(windowNumber, windowFields));
  
  // Convert button configurations
  element.button_configurations.forEach((buttonConfig, index) => {
    const buttonLines = convertButtonConfiguration(
      buttonConfig,
      windowNumber,
      index + 1,
      categories,
      mapper,
      formatter,
      defaultLanguage,
      options
    );
    lines.push(...buttonLines);
  });
  
  return lines;
}

/**
 * Convert button configuration to Auswahlfenster line
 * @param {Object} buttonConfig - Button configuration
 * @param {number} windowNumber - Parent window number
 * @param {number} position - Button position
 * @param {Array} categories - Categories array
 * @param {VectronFieldMapper} mapper - Field mapper
 * @param {VectronLineFormatter} formatter - Line formatter
 * @param {string} defaultLanguage - Default language
 * @param {Object} options - Conversion options
 * @returns {Array} Array of Auswahlfenster lines
 */
function convertButtonConfiguration(buttonConfig, windowNumber, position, categories, mapper, formatter, defaultLanguage, options) {
  const lines = [];
  
  // Generate unique button number
  const buttonNumber = generateButtonNumber(windowNumber, position, options);
  const fields = [];
  
  // Button text
  const buttonText = getLocalizedText(buttonConfig.button_texts, defaultLanguage);
  if (buttonText) {
    fields.push({
      id: 101,
      type: 'TX',
      value: sanitizeText(buttonText, options.textLimits?.buttonName || 20)
    });
  }
  
  // Handle different button types
  if (buttonConfig.element_type === 'SEPARATOR_BUTTON') {
    // Separator buttons - usually just text display
    fields.push({
      id: 9001,
      type: 'NR',
      value: 1 // Mark as inactive/display only
    });
  } else if (buttonConfig.linked_category_unique_identifier) {
    // Category link button
    const warengruppe = mapper.generateWarengruppeNumber(
      buttonConfig.linked_category_unique_identifier,
      buttonText
    );
    
    // Link to Warengruppe using complex field format
    fields.push({
      id: `(31:${position},2:1)`,
      type: 'NR',
      value: warengruppe
    });
    
    // Button position
    if (buttonConfig.display_x_pos !== undefined && buttonConfig.display_y_pos !== undefined) {
      const positionCode = calculatePositionCode(buttonConfig.display_x_pos, buttonConfig.display_y_pos, options);
      fields.push({
        id: `(31:${position},3:1)`,
        type: 'NR',
        value: positionCode
      });
    }
    
    // Button size
    if (buttonConfig.display_width && buttonConfig.display_height) {
      const sizeCode = calculateSizeCode(buttonConfig.display_width, buttonConfig.display_height, options);
      fields.push({
        id: `(31:${position},4:1)`,
        type: 'NR',
        value: sizeCode
      });
    }
  }
  
  // Button color if specified
  if (buttonConfig.background_color) {
    const colorCode = convertColorToVectron(buttonConfig.background_color);
    fields.push({
      id: `(31:${position},1:1)`,
      type: 'INT',
      value: colorCode
    });
  }
  
  if (fields.length > 0) {
    lines.push(formatter.formatAuswahlfensterLine(buttonNumber, fields));
  }
  
  return lines;
}

/**
 * Convert item grid to Auswahlfenster lines
 * @param {Object} element - Item grid element
 * @param {Array} items - Items array
 * @param {Array} categories - Categories array
 * @param {VectronFieldMapper} mapper - Field mapper
 * @param {VectronLineFormatter} formatter - Line formatter
 * @param {string} defaultLanguage - Default language
 * @param {Object} options - Conversion options
 * @returns {Array} Array of Auswahlfenster lines
 */
function convertItemGrid(element, items, categories, mapper, formatter, defaultLanguage, options) {
  const lines = [];
  
  if (!element.display_items_from_category_unique_identifier) {
    return lines;
  }
  
  // Find items for this category
  const categoryItems = items.filter(
    item => item.associated_category_unique_identifier === element.display_items_from_category_unique_identifier
  );
  
  if (categoryItems.length === 0) {
    return lines;
  }
  
  // Create window for item grid
  const windowNumber = generateWindowNumber(element.element_unique_identifier, options);
  const windowFields = [];
  
  // Window name
  const category = categories.find(cat => cat.category_unique_identifier === element.display_items_from_category_unique_identifier);
  const windowName = category ? getLocalizedText(category.category_names, defaultLanguage) : 'Items';
  windowFields.push({
    id: 101,
    type: 'TX',
    value: sanitizeText(windowName + ' Grid', options.textLimits?.windowName || 20)
  });
  
  lines.push(formatter.formatAuswahlfensterLine(windowNumber, windowFields));
  
  // Create buttons for each item
  categoryItems.forEach((item, index) => {
    const itemPosition = index + 1;
    const buttonNumber = generateButtonNumber(windowNumber, itemPosition, options);
    const fields = [];
    
    // Item button text
    const buttonText = getLocalizedText(item.display_names?.button, defaultLanguage) ||
                      getLocalizedText(item.display_names?.menu, defaultLanguage) ||
                      'Item';
    
    fields.push({
      id: 101,
      type: 'TX',
      value: sanitizeText(buttonText, options.textLimits?.buttonName || 20)
    });
    
    // Link to PLU
    const pluNumber = mapper.generatePLUNumber(
      item.associated_category_unique_identifier,
      index
    );
    
    fields.push({
      id: `(31:${itemPosition},2:1)`,
      type: 'NR',
      value: pluNumber
    });
    
    // Grid position
    if (element.grid_columns) {
      const gridX = (index % element.grid_columns) * (element.button_width || 120);
      const gridY = Math.floor(index / element.grid_columns) * (element.button_height || 80);
      const positionCode = calculatePositionCode(gridX, gridY, options);
      
      fields.push({
        id: `(31:${itemPosition},3:1)`,
        type: 'NR',
        value: positionCode
      });
    }
    
    // Show price if enabled
    if (element.item_button_template?.show_price) {
      fields.push({
        id: `(31:${itemPosition},5:1)`,
        type: 'VA',
        value: item.item_price_value
      });
    }
    
    lines.push(formatter.formatAuswahlfensterLine(buttonNumber, fields));
  });
  
  return lines;
}

/**
 * Convert generic button to Auswahlfenster line
 * @param {Object} element - Button element
 * @param {VectronFieldMapper} mapper - Field mapper
 * @param {VectronLineFormatter} formatter - Line formatter
 * @param {string} defaultLanguage - Default language
 * @param {Object} options - Conversion options
 * @returns {Array} Array of Auswahlfenster lines
 */
function convertButton(element, mapper, formatter, defaultLanguage, options) {
  const lines = [];
  
  const buttonNumber = generateWindowNumber(element.element_unique_identifier, options);
  const fields = [];
  
  // Button text
  const buttonText = getLocalizedText(element.button_texts, defaultLanguage);
  if (buttonText) {
    fields.push({
      id: 101,
      type: 'TX',
      value: sanitizeText(buttonText, options.textLimits?.buttonName || 20)
    });
  }
  
  // Handle linked action
  if (element.linked_action) {
    switch (element.linked_action.action_type) {
      case 'NAVIGATE_TO_ACTIVITY':
        // Navigation button - could link to another window
        fields.push({
          id: 501,
          type: 'NR',
          value: generateWindowNumber(element.linked_action.target_activity_unique_identifier, options)
        });
        break;
        
      case 'ADD_ITEM':
        // Direct item add button
        if (element.linked_action.item_id) {
          fields.push({
            id: 301,
            type: 'NR',
            value: element.linked_action.item_id
          });
        }
        break;
    }
  }
  
  // Position
  if (element.position_x_pixels !== undefined && element.position_y_pixels !== undefined) {
    const positionCode = calculatePositionCode(element.position_x_pixels, element.position_y_pixels, options);
    fields.push({
      id: 201,
      type: 'NR',
      value: positionCode
    });
  }
  
  if (fields.length > 0) {
    lines.push(formatter.formatAuswahlfensterLine(buttonNumber, fields));
  }
  
  return lines;
}

/**
 * Convert layout element (for advanced layout features)
 * @param {Object} element - Layout element
 * @param {VectronFieldMapper} mapper - Field mapper
 * @param {VectronLineFormatter} formatter - Line formatter
 * @param {string} defaultLanguage - Default language
 * @param {Object} options - Conversion options
 * @returns {Array} Array of Auswahlfenster lines
 */
function convertLayoutElement(element, mapper, formatter, defaultLanguage, options) {
  const lines = [];
  
  // This is for advanced layout features that might be supported in future
  // For now, we just create a placeholder entry
  const elementNumber = generateWindowNumber(element.element_unique_identifier, options);
  const fields = [];
  
  // Element name/description
  const elementName = element.element_type.replace(/_/g, ' ');
  fields.push({
    id: 101,
    type: 'TX',
    value: sanitizeText(elementName, options.textLimits?.windowName || 20)
  });
  
  // Mark as layout element
  fields.push({
    id: 9002,
    type: 'NR',
    value: 1
  });
  
  lines.push(formatter.formatAuswahlfensterLine(elementNumber, fields));
  
  return lines;
}

/**
 * Generate window number from element identifier
 * @param {string} elementId - Element identifier
 * @param {Object} options - Options
 * @returns {number} Window number
 */
function generateWindowNumber(elementId, options = {}) {
  const baseNumber = options.auswahlfensterStartNumber || 1000;
  
  // Simple hash function to generate consistent numbers
  let hash = 0;
  if (elementId) {
    for (let i = 0; i < elementId.length; i++) {
      const char = elementId.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
  }
  
  return baseNumber + Math.abs(hash) % 9000; // Keep within reasonable range
}

/**
 * Generate button number from window and position
 * @param {number} windowNumber - Window number
 * @param {number} position - Button position
 * @param {Object} options - Options
 * @returns {number} Button number
 */
function generateButtonNumber(windowNumber, position, options = {}) {
  return windowNumber + position;
}

/**
 * Convert color string to Vectron color code
 * @param {string} color - Color string (hex, rgb, etc.)
 * @returns {number} Vectron color code
 */
function convertColorToVectron(color) {
  if (!color) return 0;
  
  // Remove # if present
  color = color.replace('#', '');
  
  // Convert hex to RGB and then to Vectron color code
  if (color.length === 6) {
    const r = parseInt(color.substr(0, 2), 16);
    const g = parseInt(color.substr(2, 2), 16);
    const b = parseInt(color.substr(4, 2), 16);
    
    // Simple RGB to Vectron color mapping
    return (r << 16) | (g << 8) | b;
  }
  
  // Default color codes for common colors
  const colorMap = {
    'white': 0xFFFFFF,
    'black': 0x000000,
    'red': 0xFF0000,
    'green': 0x00FF00,
    'blue': 0x0000FF,
    'yellow': 0xFFFF00,
    'gray': 0x808080,
    'lightgray': 0xC0C0C0
  };
  
  return colorMap[color.toLowerCase()] || 0xC0C0C0; // Default to light gray
}

/**
 * Calculate position code from pixel coordinates
 * @param {number} x - X coordinate in pixels
 * @param {number} y - Y coordinate in pixels
 * @param {Object} options - Options
 * @returns {number} Position code
 */
function calculatePositionCode(x, y, options = {}) {
  // Convert pixel coordinates to grid positions
  const gridSizeX = options.gridSizeX || 120;
  const gridSizeY = options.gridSizeY || 80;
  
  const gridX = Math.floor(x / gridSizeX);
  const gridY = Math.floor(y / gridSizeY);
  
  // Encode as single number (assuming max 256x256 grid)
  return (gridY << 8) | gridX;
}

/**
 * Calculate size code from dimensions
 * @param {number} width - Width in pixels
 * @param {number} height - Height in pixels
 * @param {Object} options - Options
 * @returns {number} Size code
 */
function calculateSizeCode(width, height, options = {}) {
  const gridSizeX = options.gridSizeX || 120;
  const gridSizeY = options.gridSizeY || 80;
  
  const gridWidth = Math.ceil(width / gridSizeX);
  const gridHeight = Math.ceil(height / gridSizeY);
  
  // Encode as single number
  return (gridHeight << 8) | gridWidth;
}

/**
 * Get localized text from multilingual object
 * @param {Object} textObj - Multilingual text object
 * @param {string} defaultLanguage - Default language
 * @returns {string} Localized text
 */
function getLocalizedText(textObj, defaultLanguage) {
  if (!textObj || typeof textObj !== 'object') {
    return '';
  }
  
  return textObj[defaultLanguage] || 
         textObj[Object.keys(textObj)[0]] || 
         '';
}

/**
 * Validate display layouts for Auswahlfenster conversion
 * @param {Array} displays - Display layouts to validate
 * @returns {Array} Array of validation errors
 */
function validateDisplayLayouts(displays) {
  const errors = [];
  
  if (!displays || !Array.isArray(displays)) {
    return errors; // Empty displays is valid
  }
  
  displays.forEach((display, displayIndex) => {
    if (!display.display_unique_identifier) {
      errors.push(`Display ${displayIndex}: Missing display_unique_identifier`);
    }
    
    if (display.display_activities && Array.isArray(display.display_activities)) {
      display.display_activities.forEach((activity, activityIndex) => {
        if (!activity.activity_unique_identifier) {
          errors.push(`Display ${displayIndex}, Activity ${activityIndex}: Missing activity_unique_identifier`);
        }
        
        if (activity.user_interface_elements && Array.isArray(activity.user_interface_elements)) {
          activity.user_interface_elements.forEach((element, elementIndex) => {
            if (!element.element_unique_identifier) {
              errors.push(`Display ${displayIndex}, Activity ${activityIndex}, Element ${elementIndex}: Missing element_unique_identifier`);
            }
            
            if (!element.element_type) {
              errors.push(`Display ${displayIndex}, Activity ${activityIndex}, Element ${elementIndex}: Missing element_type`);
            }
          });
        }
      });
    }
  });
  
  return errors;
}

module.exports = {
  convertDisplayLayoutsToAuswahlfenster,
  validateDisplayLayouts,
  // Export utility functions for testing
  convertColorToVectron,
  calculatePositionCode,
  calculateSizeCode,
  generateWindowNumber
};