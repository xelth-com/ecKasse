const path = require('path');
const fs = require('fs').promises;
const MenuParserLLM = require('../../../core/lib/menu_parser_llm.js');
const { importFromOopMdf } = require('../../../core/application/import.service.js');
const { services, db } = require('../../../core');
const logger = require('../../../core/config/logger');

// Helper to send progress updates to the frontend
function sendProgress(message, isComplete = false) {
  const prefix = isComplete ? '✅' : '⏳';
  const fullMessage = `PROGRESS: ${prefix} ${message}`;
  console.log(fullMessage); // Log to server console
  if (services.websocket && services.websocket.broadcast) {
    services.websocket.broadcast('menu-import-progress', { message: fullMessage });
  }
}

/**
 * Helper function to merge multiple OOP-POS-MDF configurations into one
 * This combines categories and items from all configurations into a master config
 * Guarantees unique source_unique_identifier for all categories and items
 */
function mergeMdfData(configs) {
  if (!configs || configs.length === 0) {
    throw new Error('No configurations to merge');
  }

  if (configs.length === 1) {
    return configs[0]; // No merging needed
  }

  logger.info(`Merging ${configs.length} OOP-POS-MDF configurations`);

  // Use the first config as the base
  const masterConfig = JSON.parse(JSON.stringify(configs[0]));
  
  // Create Maps for tracking unique entities
  const uniqueCategoriesByName = new Map(); // category name -> category object
  const oldIdToNewIdMap = new Map(); // "fileX_catY" -> new unique ID
  const uniqueItemsByName = new Map(); // item name -> item object
  
  let nextCategoryId = 1;
  let nextItemId = 1;

  logger.info('Pass 1: Merging Categories and Creating ID Mapping');

  // Pass 1: Process all categories from all files
  for (let fileIndex = 0; fileIndex < configs.length; fileIndex++) {
    const config = configs[fileIndex];
    const posDevice = config.company_details.branches[0].point_of_sale_devices[0];
    
    if (posDevice.categories_for_this_pos) {
      posDevice.categories_for_this_pos.forEach(category => {
        const categoryName = (category.category_names.de || category.category_names.en || 'unknown').toLowerCase();
        const oldCategoryId = category.category_unique_identifier;
        const compositeKey = `file${fileIndex}_cat${oldCategoryId}`;
        
        let finalCategoryId;
        
        if (uniqueCategoriesByName.has(categoryName)) {
          // Category with this name already exists, get its new ID
          const existingCategory = uniqueCategoriesByName.get(categoryName);
          finalCategoryId = existingCategory.category_unique_identifier;
          logger.debug(`Category "${categoryName}" already exists with ID ${finalCategoryId}`);
        } else {
          // New unique category, assign new ID and add to map
          finalCategoryId = nextCategoryId++;
          const uniqueCategory = {
            ...category,
            category_unique_identifier: finalCategoryId
          };
          uniqueCategoriesByName.set(categoryName, uniqueCategory);
          logger.debug(`Added new category "${categoryName}" with unique ID ${finalCategoryId}`);
        }
        
        // Map old ID to new ID for this file
        oldIdToNewIdMap.set(compositeKey, finalCategoryId);
      });
    }
  }

  logger.info('Pass 2: Merging Items and Updating Category References');

  // Pass 2: Process all items from all files and update category references
  for (let fileIndex = 0; fileIndex < configs.length; fileIndex++) {
    const config = configs[fileIndex];
    const posDevice = config.company_details.branches[0].point_of_sale_devices[0];
    
    if (posDevice.items_for_this_pos) {
      posDevice.items_for_this_pos.forEach(item => {
        const itemName = (item.display_names.menu.de || item.display_names.menu.en || 'unknown').toLowerCase();
        
        if (uniqueItemsByName.has(itemName)) {
          logger.debug(`Item "${itemName}" already exists, skipping duplicate`);
          return;
        }
        
        // Find the new category ID using our mapping
        const oldCategoryId = item.associated_category_unique_identifier;
        const compositeKey = `file${fileIndex}_cat${oldCategoryId}`;
        const newCategoryId = oldIdToNewIdMap.get(compositeKey);
        
        if (!newCategoryId) {
          logger.warn(`Could not find category mapping for item "${itemName}" (${compositeKey})`);
          return;
        }
        
        // Create unique item with updated references
        const uniqueItem = {
          ...item,
          item_unique_identifier: nextItemId++,
          associated_category_unique_identifier: newCategoryId
        };
        
        uniqueItemsByName.set(itemName, uniqueItem);
        logger.debug(`Added item "${itemName}" with unique ID ${uniqueItem.item_unique_identifier}, category ${newCategoryId}`);
      });
    }
  }

  // Finalization: Replace lists with unique entities
  const firstPoS = masterConfig.company_details.branches[0].point_of_sale_devices[0];
  firstPoS.categories_for_this_pos = Array.from(uniqueCategoriesByName.values());
  firstPoS.items_for_this_pos = Array.from(uniqueItemsByName.values());

  logger.info(`Merge completed: ${firstPoS.categories_for_this_pos.length} unique categories, ${firstPoS.items_for_this_pos.length} unique items`);
  
  return masterConfig;
}

/**
 * Helper to find the category name for an item based on its category reference
 */
function findCategoryNameForItem(item, categories) {
  const category = categories.find(cat => 
    cat.category_unique_identifier === item.associated_category_unique_identifier
  );
  return category ? (category.category_names.de || category.category_names.en || 'unknown') : 'unknown';
}

/**
 * Clean the database before import (similar to what parse_and_init.js did)
 */
async function cleanDatabase() {
  logger.info('Cleaning database before import...');
  
  try {
    await db.transaction(async (trx) => {
      // Delete in correct order to avoid foreign key constraints
      // First delete active transaction items that reference items
      await trx('active_transaction_items').del();
      // Then delete the active transactions themselves  
      await trx('active_transactions').del();
      
      // Then delete item embeddings and items
      await trx('item_embeddings').del();
      await trx('items').del();
      await trx('categories').del();
      await trx('pos_devices').del();
      await trx('branches').del();
      await trx('companies').del();
      
      // For SQLite, also clear the vector table if it exists
      const dbClient = trx.client.config.client;
      if (dbClient === 'sqlite3') {
        try {
          await trx.raw('DELETE FROM vec_items');
        } catch (error) {
          // vec_items table might not exist, ignore error
          logger.debug('vec_items table not found or already empty');
        }
      }
    });
    
    logger.info('Database cleaned successfully');
  } catch (error) {
    logger.error('Failed to clean database', { error: error.message });
    throw new Error(`Database cleanup failed: ${error.message}`);
  }
}

async function uploadAndImportMenu(req, res) {
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ success: false, message: 'No files uploaded.' });
  }

  const uploadedFiles = req.files;
  const filePaths = uploadedFiles.map(f => f.path);
  const originalFilenames = uploadedFiles.map(f => f.originalname);
  logger.info({ fileCount: filePaths.length, filenames: originalFilenames }, 'Received files for menu import.');

  try {
    sendProgress('Starting AI-powered multi-file menu import with parse-combine-import workflow...');
    
    // Step 1: Parse all files individually
    const parsedConfigurations = [];
    
    for (let i = 0; i < filePaths.length; i++) {
      const filePath = filePaths[i];
      const originalFilename = originalFilenames[i];
      
      sendProgress(`Parsing file ${i + 1}/${filePaths.length}: ${originalFilename}`);
      logger.info(`Parsing file ${i + 1}/${filePaths.length}: ${originalFilename}`);
      
      try {
        // Create MenuParserLLM instance for this file
        const parser = new MenuParserLLM({
          businessType: 'restaurant',
          defaultLanguage: 'de',
          enableValidation: true
        });
        
        // Parse the menu file
        const parseResult = await parser.parseMenu(filePath);
        
        if (parseResult.success && parseResult.configuration) {
          parsedConfigurations.push(parseResult.configuration);
          sendProgress(`Successfully parsed: ${originalFilename} (${parseResult.metadata.itemsFound} items, ${parseResult.metadata.categoriesFound} categories)`);
          logger.info(`Successfully parsed: ${originalFilename}`, {
            itemsFound: parseResult.metadata.itemsFound,
            categoriesFound: parseResult.metadata.categoriesFound,
            confidence: parseResult.metadata.confidence
          });
        } else {
          throw new Error('Failed to parse menu file - no valid configuration returned');
        }
      } catch (parseError) {
        const errorMsg = `Failed to parse ${originalFilename}: ${parseError.message}`;
        logger.error(errorMsg, { error: parseError.stack });
        sendProgress(`❌ ${errorMsg}`);
        throw new Error(errorMsg);
      }
    }

    // Step 2: Combine all parsed configurations
    sendProgress('Combining parsed menu data from all files...');
    logger.info('Starting merge of parsed configurations', { configCount: parsedConfigurations.length });
    
    const combinedConfiguration = mergeMdfData(parsedConfigurations);
    
    const totalCategories = combinedConfiguration.company_details.branches[0].point_of_sale_devices[0].categories_for_this_pos?.length || 0;
    const totalItems = combinedConfiguration.company_details.branches[0].point_of_sale_devices[0].items_for_this_pos?.length || 0;
    
    sendProgress(`Combined data: ${totalCategories} categories, ${totalItems} items`);
    logger.info('Configuration merge completed', { totalCategories, totalItems });

    // Step 3: Clean database before import
    sendProgress('Cleaning database before import...');
    logger.info('Cleaning database before import');
    await cleanDatabase();
    sendProgress('Database cleaned successfully');

    // Step 4: Perform single database import
    sendProgress('Importing combined configuration to database...');
    logger.info('Starting database import of combined configuration');
    
    const importResult = await importFromOopMdf(combinedConfiguration, (current, total, itemName) => {
      if (current % 10 === 0 || current === total) { // Report every 10th item and the last one
        sendProgress(`Importing items: ${current}/${total} (${itemName})`);
      }
    });

    if (!importResult.success) {
      throw new Error(`Database import failed: ${importResult.message || 'Unknown error'}`);
    }

    sendProgress('Finalizing import and refreshing UI...', true);

    // Request UI refresh via WebSocket
    if (services.websocket && services.websocket.requestUiRefresh) {
      services.websocket.requestUiRefresh();
    }

    sendProgress('🎉 Multi-file menu import completed successfully!', true);

    res.json({
      success: true,
      message: 'Multi-file menu import completed successfully!',
      fileCount: filePaths.length,
      filenames: originalFilenames,
      totalCategories,
      totalItems,
      importStats: importResult.stats
    });

  } catch (error) {
    const errorMessage = `Multi-file import failed: ${error.message}`;
    logger.error({ msg: 'Multi-file menu import process failed', error: error.message, stack: error.stack });
    sendProgress(`❌ ${errorMessage}`, true);
    res.status(500).json({ success: false, message: errorMessage });
  } finally {
    // Final cleanup of uploaded files
    for (const filePath of filePaths) {
      try {
        await fs.unlink(filePath);
      } catch (cleanupError) {
        logger.warn({ error: cleanupError.message }, `Failed to clean up file: ${filePath}`);
      }
    }
  }
}

module.exports = {
  uploadAndImportMenu,
};