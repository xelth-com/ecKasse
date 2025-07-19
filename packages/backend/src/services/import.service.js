/**
 * Import Service for OOP-POS-MDF Data with Integrated Vectorization
 * 
 * This service handles importing complete oop-pos-mdf JSON configurations
 * into the normalized SQLite database with real-time vector embedding generation.
 * 
 * Features:
 * - Atomic transaction-based import
 * - Hierarchical data insertion (companies -> branches -> pos_devices -> categories -> items)
 * - On-the-fly vector embedding generation for each item
 * - Automatic database cleanup before import
 * 
 * @author eckasse Development Team
 * @version 2.0.0
 */

const db = require('../db/knex');
const { generateEmbedding, embeddingToBuffer } = require('./embedding.service');
const logger = require('../config/logger');
const crypto = require('crypto');

/**
 * Import a complete oop-pos-mdf JSON configuration into the database
 * @param {Object} jsonData - The parsed oop-pos-mdf JSON data
 * @param {Object} options - Import options
 * @returns {Promise<Object>} - Import result with statistics
 */
async function importFromOopMdf(jsonData, options = {}) {
  const startTime = Date.now();
  const stats = {
    companies: 0,
    branches: 0,
    posDevices: 0,
    categories: 0,
    items: 0,
    embeddings: 0,
    errors: []
  };

  logger.info('Starting OOP-POS-MDF import', { 
    companyName: jsonData.company_details?.company_full_name,
    timestamp: new Date().toISOString()
  });

  try {
    // Wrap entire operation in a transaction for atomicity
    const result = await db.transaction(async (trx) => {
      // Step 1: Clean existing data (respecting foreign key constraints)
      await cleanExistingData(trx);
      
      // Step 2: Import hierarchical data
      const importResult = await importHierarchicalData(trx, jsonData, stats);
      
      return importResult;
    });

    const duration = Date.now() - startTime;
    logger.info('OOP-POS-MDF import completed successfully', {
      duration: `${duration}ms`,
      stats,
      timestamp: new Date().toISOString()
    });

    return {
      success: true,
      stats,
      duration,
      message: 'Import completed successfully'
    };

  } catch (error) {
    const duration = Date.now() - startTime;
    logger.error('OOP-POS-MDF import failed', {
      error: error.message,
      stack: error.stack,
      duration: `${duration}ms`,
      stats,
      timestamp: new Date().toISOString()
    });

    throw new Error(`Import failed: ${error.message}`);
  }
}

/**
 * Clean existing data in correct order (child to parent)
 * @param {Object} trx - Knex transaction object
 */
async function cleanExistingData(trx) {
  logger.info('Cleaning existing data from database');
  
  // Delete in order: vec_items -> items -> categories -> pos_devices -> branches -> companies
  try {
    await trx.raw('DELETE FROM vec_items');
  } catch (error) {
    logger.warn('vec_items table not found, skipping cleanup');
  }
  await trx('items').del();
  await trx('categories').del();
  await trx('pos_devices').del();
  await trx('branches').del();
  await trx('companies').del();
  
  // Reset auto-increment sequences
  await trx.raw('UPDATE sqlite_sequence SET seq = 0 WHERE name IN (?, ?, ?, ?, ?)', 
    ['companies', 'branches', 'pos_devices', 'categories', 'items']);
  
  logger.info('Database cleanup completed');
}

/**
 * Import hierarchical data structure
 * @param {Object} trx - Knex transaction object
 * @param {Object} jsonData - The oop-pos-mdf JSON data
 * @param {Object} stats - Statistics object to update
 * @returns {Promise<Object>} - Import result
 */
async function importHierarchicalData(trx, jsonData, stats) {
  const companyDetails = jsonData.company_details;
  
  if (!companyDetails) {
    throw new Error('Invalid JSON: company_details is required');
  }

  // Step 1: Insert company
  logger.info('Importing company data', { 
    companyName: companyDetails.company_full_name 
  });
  
  const companyResult = await trx('companies').insert({
    company_full_name: companyDetails.company_full_name,
    meta_information: JSON.stringify(companyDetails.meta_information || {}),
    global_configurations: JSON.stringify(companyDetails.global_configurations || {})
  }).returning('id');
  
  const companyId = companyResult[0].id || companyResult[0];

  stats.companies++;

  // Step 2: Import branches
  if (!companyDetails.branches || !Array.isArray(companyDetails.branches)) {
    throw new Error('Invalid JSON: branches array is required');
  }

  for (const branch of companyDetails.branches) {
    logger.info('Importing branch data', { 
      branchName: branch.branch_names?.de || branch.branch_names?.en || 'Unknown Branch'
    });

    const branchResult = await trx('branches').insert({
      company_id: companyId,
      branch_name: JSON.stringify(branch.branch_names || {}),
      branch_address: branch.branch_address || ''
    }).returning('id');
    
    const branchId = branchResult[0].id || branchResult[0];

    stats.branches++;

    // Step 3: Import POS devices for this branch
    if (!branch.point_of_sale_devices || !Array.isArray(branch.point_of_sale_devices)) {
      logger.warn('No POS devices found for branch', { branchId });
      continue;
    }

    for (const posDevice of branch.point_of_sale_devices) {
      logger.info('Importing POS device data', { 
        posDeviceName: posDevice.pos_device_names?.de || posDevice.pos_device_names?.en || 'Unknown POS'
      });

      const posDeviceResult = await trx('pos_devices').insert({
        branch_id: branchId,
        pos_device_name: JSON.stringify(posDevice.pos_device_names || {}),
        pos_device_type: posDevice.pos_device_type || 'DESKTOP',
        pos_device_external_number: posDevice.pos_device_external_number || 1,
        pos_device_settings: JSON.stringify(posDevice.pos_device_settings || {})
      }).returning('id');
      
      const posDeviceId = posDeviceResult[0].id || posDeviceResult[0];

      stats.posDevices++;

      // Step 4: Import categories for this POS device
      const categoryIdMap = new Map(); // Map from JSON category_unique_identifier to DB id
      
      if (posDevice.categories_for_this_pos && Array.isArray(posDevice.categories_for_this_pos)) {
        for (const category of posDevice.categories_for_this_pos) {
          logger.debug('Importing category', { 
            categoryName: category.category_names?.de || category.category_names?.en || 'Unknown Category',
            categoryUniqueId: category.category_unique_identifier
          });

          const categoryResult = await trx('categories').insert({
            pos_device_id: posDeviceId,
            source_unique_identifier: String(category.category_unique_identifier),
            category_names: JSON.stringify(category.category_names || {}),
            category_type: category.category_type || 'food',
            parent_category_id: category.parent_category_unique_identifier || null,
            default_linked_main_group_unique_identifier: category.default_linked_main_group_unique_identifier || null,
            audit_trail: JSON.stringify(category.audit_trail || {})
          }).returning('id');
          
          const categoryId = categoryResult[0].id || categoryResult[0];

          // Store mapping for item linking
          categoryIdMap.set(category.category_unique_identifier, categoryId);
          stats.categories++;
        }
      }

      // Step 5: Import items with integrated vectorization
      if (posDevice.items_for_this_pos && Array.isArray(posDevice.items_for_this_pos)) {
        await importItemsWithVectorization(trx, posDevice.items_for_this_pos, posDeviceId, categoryIdMap, stats);
      }
    }
  }

  return {
    companyId,
    totalItems: stats.items,
    totalEmbeddings: stats.embeddings
  };
}

/**
 * Import items with integrated vectorization
 * @param {Object} trx - Knex transaction object
 * @param {Array} items - Items array from oop-pos-mdf
 * @param {number} posDeviceId - POS device ID
 * @param {Map} categoryIdMap - Map of category unique IDs to database IDs
 * @param {Object} stats - Statistics object to update
 */
async function importItemsWithVectorization(trx, items, posDeviceId, categoryIdMap, stats) {
  logger.info(`Processing ${items.length} items with vectorization for POS device ${posDeviceId}`);
  
  // Create reverse category lookup for semantic string construction
  const categoryNameMap = new Map();
  for (const [uniqueId, dbId] of categoryIdMap) {
    // Get category name from database
    const categoryRow = await trx('categories').where('id', dbId).first();
    if (categoryRow && categoryRow.category_names) {
      try {
        const categoryNames = JSON.parse(categoryRow.category_names);
        const categoryName = categoryNames.de || categoryNames.en || Object.values(categoryNames)[0] || 'Unknown Category';
        categoryNameMap.set(uniqueId, categoryName);
      } catch (error) {
        logger.warn('Failed to parse category names', { categoryId: dbId, error: error.message });
        categoryNameMap.set(uniqueId, 'Unknown Category');
      }
    }
  }
  
  for (const item of items) {
    const itemName = item.display_names?.menu?.de || item.display_names?.menu?.en || 'Unknown Item';
    
    logger.debug('Processing item with vectorization', { itemName });
    
    // Validate category reference
    const categoryId = categoryIdMap.get(item.associated_category_unique_identifier) || null;
    
    if (!categoryId) {
      logger.warn('Item has invalid category reference', {
        itemName,
        categoryUniqueId: item.associated_category_unique_identifier
      });
      stats.errors.push(`Item "${itemName}" has invalid category reference`);
      continue;
    }

    try {
      // Step 1: Insert item data into items table
      const itemResult = await trx('items').insert({
        pos_device_id: posDeviceId,
        source_unique_identifier: String(item.item_unique_identifier),
        associated_category_unique_identifier: categoryId,
        display_names: JSON.stringify(item.display_names || {}),
        item_price_value: item.item_price_value || 0,
        pricing_schedules: JSON.stringify(item.pricing_schedules || []),
        availability_schedule: JSON.stringify(item.availability_schedule || {}),
        additional_item_attributes: JSON.stringify(item.additional_item_attributes || {}),
        item_flags: JSON.stringify(item.item_flags || {}),
        audit_trail: JSON.stringify(item.audit_trail || {})
      }).returning('id');
      
      const itemId = itemResult[0].id || itemResult[0];

      stats.items++;

      // Step 2: Check for existing embedding data and validate
      let embedding = null;
      let embeddingBuffer = null;
      let skipApiCall = false;

      if (item.embedding_data && item.embedding_data.vector && item.embedding_data.source_hash) {
        // Reconstruct semantic string for hash validation
        const categoryName = categoryNameMap.get(item.associated_category_unique_identifier) || 'Unknown Category';
        const description = item.additional_item_attributes?.description || '';
        const ingredients = item.additional_item_attributes?.ingredients || '';
        
        const currentSemanticString = [
          item.display_names?.menu?.de || item.display_names?.menu?.en || '',
          item.display_names?.menu?.en || '',
          description,
          ingredients
        ].filter(Boolean).join(' ').trim();
        
        const currentHash = crypto.createHash('sha256').update(currentSemanticString).digest('hex');
        
        if (currentHash === item.embedding_data.source_hash) {
          // Hash matches - reuse existing embedding
          logger.debug('Reusing existing embedding (hash match)', { 
            itemId, 
            itemName,
            hash: currentHash.substring(0, 8) + '...'
          });
          
          embedding = item.embedding_data.vector;
          embeddingBuffer = embeddingToBuffer(embedding);
          skipApiCall = true;
          stats.embeddings++;
        } else {
          logger.warn('Embedding hash mismatch - text has changed, generating new embedding', {
            itemId,
            itemName,
            expectedHash: item.embedding_data.source_hash.substring(0, 8) + '...',
            currentHash: currentHash.substring(0, 8) + '...'
          });
        }
      }

      // Step 3: Generate new embedding if needed
      if (!skipApiCall) {
        const categoryName = categoryNameMap.get(item.associated_category_unique_identifier) || 'Unknown Category';
        const description = item.additional_item_attributes?.description || '';
        
        const semanticString = `Category: ${categoryName}. Product: ${itemName}. Description: ${description}`.trim();
        
        logger.debug('Generated semantic string for new embedding', { 
          itemId, 
          itemName, 
          semanticString: semanticString.substring(0, 100) + (semanticString.length > 100 ? '...' : '')
        });

        embedding = await generateEmbedding(semanticString);
        embeddingBuffer = embeddingToBuffer(embedding);
        stats.embeddings++;
      }

      // Step 4: Insert vector data into vec_items table
      // The rowid of vec_items must match the id from the items table
      try {
        await trx.raw(
          'INSERT INTO vec_items(rowid, item_embedding) VALUES (?, ?)',
          [itemId, embeddingBuffer]
        );
      } catch (error) {
        logger.warn('vec_items table not found, skipping embedding insertion');
      }
      
      logger.debug('Item import completed', { 
        itemId, 
        itemName
      });

    } catch (error) {
      logger.error('Failed to import item', {
        itemName,
        error: error.message,
        stack: error.stack
      });
      
      stats.errors.push(`Failed to import item "${itemName}": ${error.message}`);
      
      // Continue with next item rather than failing entire import
      continue;
    }
  }
  
  logger.info('Item vectorization completed', {
    posDeviceId,
    totalItems: items.length,
    successfulItems: stats.items,
    successfulEmbeddings: stats.embeddings,
    errors: stats.errors.length
  });
}

module.exports = {
  importFromOopMdf
};