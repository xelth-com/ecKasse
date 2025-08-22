// packages/core/application/import.service.js

/**
 * Import Service for OOP-POS-MDF Data with Integrated Vectorization
 *
 * This service handles importing complete oop-pos-mdf JSON configurations
 * into the normalized database with real-time vector embedding generation.
 *
 * Key Improvements:
 * - Fixed category lookup failures during item import.
 * - Added robust logging to trace the import process.
 * - Made embedding storage database-agnostic (SQLite vs PostgreSQL).
 * - Used a safer JSON parsing utility to prevent errors.
 *
 * @author ecKasse Development Team
 * @version 2.1.0
 */

const bcrypt = require('bcrypt');
const db = require('../db/knex');
const { generateEmbedding, embeddingToBuffer } = require('./embedding.service');
const logger = require('../config/logger');
const crypto = require('crypto');
// FIX: Using the robust JSON parsing utility from db-helper
const { parseJsonIfNeeded } = require('../utils/db-helper');

/**
 * Import a complete oop-pos-mdf JSON configuration into the database.
 * @param {Object} jsonData - The parsed oop-pos-mdf JSON data.
 * @param {Function} progressCallback - Callback for progress reporting.
 * @param {Object} options - Import options (currently unused but here for future expansion).
 * @returns {Promise<Object>} - Import result with statistics.
 */
async function importFromOopMdf(jsonData, progressCallback = null, options = {}) {
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
    // The entire import is wrapped in a transaction for atomicity.
    // If any part fails, the whole operation is rolled back.
    const result = await db.transaction(async (trx) => {
      // The calling script (parse_and_init.js) is responsible for cleaning the DB.
      // This service now focuses solely on the import logic.
      return await importHierarchicalData(trx, jsonData, stats, progressCallback);
    });

    const duration = Date.now() - startTime;
    logger.info('OOP-POS-MDF import completed successfully', {
      duration: `${duration}ms`,
      stats,
    });

    return {
      success: true,
      stats,
      duration,
      message: 'Import completed successfully'
    };

  } catch (error) {
    const duration = Date.now() - startTime;
    logger.error('OOP-POS-MDF import failed critically', {
      error: error.message,
      stack: error.stack,
      duration: `${duration}ms`,
      stats
    });
    // Re-throw the error to ensure the transaction is rolled back and the failure is known.
    throw new Error(`Import failed critically: ${error.message}`);
  }
}


/**
 * Import the hierarchical data structure from the JSON file.
 * @param {Object} trx - Knex transaction object.
 * @param {Object} jsonData - The oop-pos-mdf JSON data.
 * @param {Object} stats - Statistics object to update.
 * @param {Function} progressCallback - Callback for progress reporting.
 * @returns {Promise<Object>} - Result of the import.
 */
async function importHierarchicalData(trx, jsonData, stats, progressCallback = null) {
  const companyDetails = jsonData.company_details;
  if (!companyDetails) throw new Error('Invalid JSON: company_details is required');

  // Step 1: Insert Company
  logger.info('Importing company data...');
  const [companyResult] = await trx('companies').insert({
    company_full_name: companyDetails.company_full_name,
    meta_information: JSON.stringify(companyDetails.meta_information || {}),
    global_configurations: JSON.stringify(companyDetails.global_configurations || {})
  }).returning('id');
  const companyId = typeof companyResult === 'object' ? companyResult.id : companyResult;
  stats.companies++;

  // Step 2: Import Branches
  if (!companyDetails.branches || !Array.isArray(companyDetails.branches)) {
    throw new Error('Invalid JSON: branches array is required');
  }

  for (const branch of companyDetails.branches) {
    const [branchResult] = await trx('branches').insert({
      company_id: companyId,
      branch_name: JSON.stringify(branch.branch_names || {}),
      branch_address: branch.branch_address || ''
    }).returning('id');
    const branchId = typeof branchResult === 'object' ? branchResult.id : branchResult;
    stats.branches++;

    // Step 3: Import POS Devices
    if (!branch.point_of_sale_devices || !Array.isArray(branch.point_of_sale_devices)) continue;

    for (const posDevice of branch.point_of_sale_devices) {
      const [posDeviceResult] = await trx('pos_devices').insert({
        branch_id: branchId,
        pos_device_name: JSON.stringify(posDevice.pos_device_names || {}),
        pos_device_type: posDevice.pos_device_type || 'DESKTOP',
        pos_device_external_number: posDevice.pos_device_external_number || 1,
        pos_device_settings: JSON.stringify(posDevice.pos_device_settings || {})
      }).returning('id');
      const posDeviceId = typeof posDeviceResult === 'object' ? posDeviceResult.id : posDeviceResult;
      stats.posDevices++;

      // Step 4: Import Categories
      const categoryIdMap = new Map();
      if (posDevice.categories_for_this_pos) {
        for (const category of posDevice.categories_for_this_pos) {
          const [categoryResult] = await trx('categories').insert({
            pos_device_id: posDeviceId,
            source_unique_identifier: category.category_unique_identifier,
            category_names: JSON.stringify(category.category_names || {}),
            category_type: category.category_type || 'food',
            parent_category_id: null, // Parent linking needs a second pass if used
            default_linked_main_group_unique_identifier: category.default_linked_main_group_unique_identifier || null,
            audit_trail: JSON.stringify(category.audit_trail || {})
          }).returning('id');
          const newCategoryId = typeof categoryResult === 'object' ? categoryResult.id : categoryResult;
          categoryIdMap.set(category.category_unique_identifier, newCategoryId);
          stats.categories++;
        }
      }

      // Step 5: Import Items with Vectorization
      if (posDevice.items_for_this_pos) {
        await importItemsWithVectorization(trx, posDevice.items_for_this_pos, posDeviceId, categoryIdMap, stats, progressCallback);
      }
    }
  }
  
  return { companyId, totalItems: stats.items, totalEmbeddings: stats.embeddings };
}

/**
 * Imports items and generates vector embeddings for each one.
 * @param {Object} trx - Knex transaction object.
 * @param {Array} items - The items array from the JSON.
 * @param {number} posDeviceId - The database ID of the parent POS device.
 * @param {Map} categoryIdMap - A map of JSON category IDs to database IDs.
 * @param {Object} stats - Statistics object to update.
 * @param {Function} progressCallback - Callback for progress reporting.
 */
async function importItemsWithVectorization(trx, items, posDeviceId, categoryIdMap, stats, progressCallback = null) {
  logger.info(`Processing ${items.length} items with vectorization for POS device ${posDeviceId}`);

  // FIX: Pre-build a map of category DB IDs to their names for efficient lookup.
  const categoryNameMap = new Map();
  for (const [uniqueId, dbId] of categoryIdMap.entries()) {
    const categoryRow = await trx('categories').where('id', dbId).first();
    if (categoryRow) {
      // FIX: Using the safe parseJsonIfNeeded utility here.
      const names = parseJsonIfNeeded(categoryRow.category_names);
      const name = names.de || names.en || 'Unknown';
      categoryNameMap.set(dbId, name);
    }
  }
  
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const itemName = item.display_names?.menu?.de || item.display_names?.menu?.en || 'Unknown Item';
    
    if (progressCallback) progressCallback(i + 1, items.length, itemName);
    logger.debug('Processing item with vectorization', { itemName });

    const categoryId = categoryIdMap.get(item.associated_category_unique_identifier);
    if (!categoryId) {
      const errorMsg = `Item "${itemName}" has invalid category reference: ${item.associated_category_unique_identifier}`;
      logger.warn(errorMsg);
      stats.errors.push(errorMsg);
      continue; // Skip this item
    }

    try {
      const [itemResult] = await trx('items').insert({
        pos_device_id: posDeviceId,
        source_unique_identifier: item.item_unique_identifier,
        associated_category_unique_identifier: categoryId,
        display_names: JSON.stringify(item.display_names || {}),
        item_price_value: item.item_price_value || 0,
        item_flags: JSON.stringify(item.item_flags || { is_sellable: true }),
        audit_trail: JSON.stringify(item.audit_trail || {})
      }).returning('id');
      const itemId = typeof itemResult === 'object' ? itemResult.id : itemResult;
      stats.items++;

      // Generate embedding
      const categoryName = categoryNameMap.get(categoryId) || 'Unknown Category';
      const description = item.additional_item_attributes?.description || '';
      const semanticString = `Category: ${categoryName}. Product: ${itemName}. Description: ${description}`.trim();
      
      logger.debug('Generated semantic string for embedding', { itemId, semanticString });
      const embedding = await generateEmbedding(semanticString);
      const embeddingBuffer = embeddingToBuffer(embedding);

      // FIX: Database-agnostic embedding insertion
      const dbClient = trx.client.config.client;
      if (dbClient === 'pg') {
        // PostgreSQL: Use item_embeddings table (if migration is enabled)
        const tableExists = await trx.schema.hasTable('item_embeddings');
        if (tableExists) {
          await trx('item_embeddings').insert({
            item_id: itemId,
            item_embedding: embedding // pgvector handles array-to-vector conversion
          }).onConflict('item_id').merge();
        } else {
          logger.warn('PostgreSQL table "item_embeddings" not found. Skipping embedding insertion.');
        }
      } else {
        // SQLite: Use vec_items virtual table
        await trx.raw('INSERT OR REPLACE INTO vec_items(rowid, item_embedding) VALUES (?, ?)', [itemId, embeddingBuffer]);
      }
      stats.embeddings++;
      logger.debug('Item import completed', { itemId, itemName });

    } catch (error) {
      const errorMsg = `Failed to import item "${itemName}": ${error.message}`;
      logger.error('Failed to import item', { itemName, error: error.message, stack: error.stack });
      stats.errors.push(errorMsg);
      // Continue with the next item instead of failing the entire import
    }
  }
}

module.exports = {
  importFromOopMdf
};