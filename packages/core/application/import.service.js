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
const { generateEmbedding, embeddingToBuffer, embeddingToJson } = require('./embedding.service');
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

  logger.info('🚀 Starting OOP-POS-MDF import', {
    companyName: jsonData.company_details?.company_full_name,
    branchesCount: jsonData.company_details?.branches?.length || 0,
    timestamp: new Date().toISOString(),
    importStats: stats
  });

  try {
    // The entire import is wrapped in a transaction for atomicity.
    // If any part fails, the whole operation is rolled back.
    logger.info('🔄 Starting database transaction for import');
    
    const result = await db.transaction(async (trx) => {
      logger.info('✅ Transaction started successfully');
      
      try {
        // The calling script (parse_and_init.js) is responsible for cleaning the DB.
        // This service now focuses solely on the import logic.
        const importResult = await importHierarchicalData(trx, jsonData, stats, progressCallback);
        
        logger.info('🎯 Import hierarchical data completed', {
          result: importResult,
          finalStats: stats
        });
        
        return importResult;
      } catch (transactionError) {
        logger.error('💥 Error during import transaction', {
          error: transactionError.message,
          errorStack: transactionError.stack,
          currentStats: stats
        });
        throw transactionError;
      }
    });

    const duration = Date.now() - startTime;
    logger.info('🎉 OOP-POS-MDF import completed successfully', {
      duration: `${duration}ms`,
      stats,
      companies: stats.companies,
      branches: stats.branches,
      posDevices: stats.posDevices,
      categories: stats.categories,
      items: stats.items,
      embeddings: stats.embeddings,
      errors: stats.errors.length,
      errorList: stats.errors
    });

    return {
      success: true,
      stats,
      duration,
      message: 'Import completed successfully'
    };

  } catch (error) {
    const duration = Date.now() - startTime;
    logger.error('💥 OOP-POS-MDF import failed critically', {
      error: error.message,
      errorCode: error.code,
      errorStack: error.stack,
      errorSql: error.sql,
      errorDetail: error.detail,
      errorHint: error.hint,
      duration: `${duration}ms`,
      partialStats: stats,
      companies: stats.companies,
      branches: stats.branches,
      posDevices: stats.posDevices,
      categories: stats.categories,
      items: stats.items,
      embeddings: stats.embeddings,
      errors: stats.errors.length,
      errorList: stats.errors
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
  if (!companyDetails) {
    logger.error('❌ Invalid JSON structure: company_details is required');
    throw new Error('Invalid JSON: company_details is required');
  }

  logger.info('🏢 Validating company data', {
    companyName: companyDetails.company_full_name,
    hasBranches: !!companyDetails.branches,
    branchesCount: companyDetails.branches?.length || 0
  });

  // Step 1: Insert Company
  logger.info('🏢 Importing company data...');
  
  let companyId;
  try {
    const [companyResult] = await trx('companies').insert({
      company_full_name: companyDetails.company_full_name,
      meta_information: JSON.stringify(companyDetails.meta_information || {}),
      global_configurations: JSON.stringify(companyDetails.global_configurations || {})
    }).returning('id');
    companyId = typeof companyResult === 'object' ? companyResult.id : companyResult;
    stats.companies++;

    logger.info('✅ Company created successfully', {
      companyName: companyDetails.company_full_name,
      companyId
    });

    // Step 2: Import Branches
  if (!companyDetails.branches || !Array.isArray(companyDetails.branches)) {
    logger.error('❌ Invalid JSON structure: branches array is required');
    throw new Error('Invalid JSON: branches array is required');
  }

  logger.info('🏪 Starting branches import', {
    companyId,
    branchesCount: companyDetails.branches.length
  });

  for (let branchIndex = 0; branchIndex < companyDetails.branches.length; branchIndex++) {
    const branch = companyDetails.branches[branchIndex];
    const branchName = branch.branch_names?.de || branch.branch_names?.en || `Branch ${branchIndex + 1}`;
    
    logger.debug('🏪 Processing branch', {
      branchIndex: branchIndex + 1,
      branchName,
      branchAddress: branch.branch_address,
      companyId
    });

    try {
      const [branchResult] = await trx('branches').insert({
        company_id: companyId,
        branch_name: JSON.stringify(branch.branch_names || {}),
        branch_address: branch.branch_address || ''
      }).returning('id');
      const branchId = typeof branchResult === 'object' ? branchResult.id : branchResult;
      stats.branches++;

      logger.info('✅ Branch created successfully', {
        branchName,
        branchId,
        companyId
      });

      // Step 3: Import POS Devices
      if (!branch.point_of_sale_devices || !Array.isArray(branch.point_of_sale_devices)) {
        logger.warn('⚠️ No POS devices found for branch', { branchName, branchId });
        continue;
      }

      logger.info('🖥️ Starting POS devices import', {
        branchId,
        branchName,
        posDevicesCount: branch.point_of_sale_devices.length
      });

      for (let posIndex = 0; posIndex < branch.point_of_sale_devices.length; posIndex++) {
        const posDevice = branch.point_of_sale_devices[posIndex];
        const posDeviceName = posDevice.pos_device_names?.de || posDevice.pos_device_names?.en || `POS ${posIndex + 1}`;

        logger.debug('🖥️ Processing POS device', {
          posIndex: posIndex + 1,
          posDeviceName,
          posDeviceType: posDevice.pos_device_type,
          branchId,
          branchName
        });

        try {
          const [posDeviceResult] = await trx('pos_devices').insert({
            branch_id: branchId,
            pos_device_name: JSON.stringify(posDevice.pos_device_names || {}),
            pos_device_type: posDevice.pos_device_type || 'DESKTOP',
            pos_device_external_number: posDevice.pos_device_external_number || 1,
            pos_device_settings: JSON.stringify(posDevice.pos_device_settings || {})
          }).returning('id');
          const posDeviceId = typeof posDeviceResult === 'object' ? posDeviceResult.id : posDeviceResult;
          stats.posDevices++;

          logger.info('✅ POS device created successfully', {
            posDeviceName,
            posDeviceId,
            posDeviceType: posDevice.pos_device_type,
            branchId,
            branchName
          });

      // Step 4: Import Categories
      const categoryIdMap = new Map();
      logger.info('📁 Starting category import', {
        posDeviceId,
        categoriesCount: posDevice.categories_for_this_pos?.length || 0
      });

      if (posDevice.categories_for_this_pos) {
        for (const category of posDevice.categories_for_this_pos) {
          const categoryName = category.category_names?.de || category.category_names?.en || 'Unknown Category';
          
          logger.debug('📂 Processing category', {
            categoryName,
            categoryId: category.category_unique_identifier,
            categoryType: category.category_type,
            posDeviceId
          });

          try {
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

            logger.info('✅ Category created successfully', {
              categoryName,
              categoryUniqueId: category.category_unique_identifier,
              dbCategoryId: newCategoryId,
              posDeviceId
            });

          } catch (categoryError) {
            logger.error('❌ Failed to create category', {
              categoryName,
              categoryUniqueId: category.category_unique_identifier,
              posDeviceId,
              error: categoryError.message,
              errorStack: categoryError.stack
            });
            throw categoryError; // Category creation is critical, should fail the entire import
          }
        }

        logger.info('📁 Category import completed', {
          posDeviceId,
          categoriesCreated: stats.categories,
          categoryMapping: Array.from(categoryIdMap.entries()).map(([key, value]) => ({ uniqueId: key, dbId: value }))
        });
      } else {
        logger.warn('⚠️ No categories found for POS device', { posDeviceId });
      }

          // Step 5: Import Items with Vectorization
          if (posDevice.items_for_this_pos) {
            logger.info('🛍️ Starting items import', {
              posDeviceId,
              posDeviceName,
              itemsCount: posDevice.items_for_this_pos.length,
              categoriesAvailable: categoryIdMap.size
            });
            
            await importItemsWithVectorization(trx, posDevice.items_for_this_pos, posDeviceId, categoryIdMap, stats, progressCallback);
          } else {
            logger.warn('⚠️ No items found for POS device', { posDeviceId, posDeviceName });
          }

        } catch (posDeviceError) {
          logger.error('❌ Failed to create POS device', {
            posDeviceName,
            posIndex: posIndex + 1,
            branchId,
            branchName,
            error: posDeviceError.message,
            errorStack: posDeviceError.stack
          });
          throw posDeviceError; // POS device creation is critical, should fail the entire import
        }
      }

      logger.info('🖥️ POS devices import completed for branch', {
        branchId,
        branchName,
        posDevicesCreated: branch.point_of_sale_devices.length
      });

    } catch (branchError) {
      logger.error('❌ Failed to create branch', {
        branchName,
        branchIndex: branchIndex + 1,
        companyId,
        error: branchError.message,
        errorStack: branchError.stack
      });
      throw branchError; // Branch creation is critical, should fail the entire import
    }
  }

  logger.info('🏪 All branches imported successfully', {
    companyId,
    branchesCreated: stats.branches,
    posDevicesCreated: stats.posDevices,
    categoriesCreated: stats.categories
  });

  } catch (companyError) {
    logger.error('❌ Failed to create company', {
      companyName: companyDetails.company_full_name,
      error: companyError.message,
      errorStack: companyError.stack
    });
    throw companyError;
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
    logger.info(`🔄 Processing item ${i + 1}/${items.length}: "${itemName}"`, {
      itemName,
      itemId: item.item_unique_identifier,
      categoryRef: item.associated_category_unique_identifier,
      price: item.item_price_value
    });

    const categoryId = categoryIdMap.get(item.associated_category_unique_identifier);
    if (!categoryId) {
      const errorMsg = `Item "${itemName}" has invalid category reference: ${item.associated_category_unique_identifier}`;
      logger.error('❌ Category lookup failed', {
        itemName,
        itemUniqueId: item.item_unique_identifier,
        categoryRef: item.associated_category_unique_identifier,
        availableCategories: Array.from(categoryIdMap.keys()),
        errorMsg
      });
      stats.errors.push(errorMsg);
      continue; // Skip this item
    }

    logger.debug('✅ Category lookup successful', {
      itemName,
      categoryRef: item.associated_category_unique_identifier,
      categoryDbId: categoryId
    });

    try {
      logger.debug('💾 Inserting item into database', {
        itemName,
        posDeviceId,
        categoryId,
        price: item.item_price_value || 0
      });

      const [itemResult] = await trx('items').insert({
        pos_device_id: posDeviceId,
        source_unique_identifier: item.item_unique_identifier,
        associated_category_unique_identifier: categoryId,
        display_names: JSON.stringify(item.display_names || {}),
        item_price_value: item.item_price_value || 0,
        item_flags: JSON.stringify(item.item_flags || { is_sellable: true }),
        additional_item_attributes: JSON.stringify(item.additional_item_attributes || {}),
        audit_trail: JSON.stringify(item.audit_trail || {})
      }).returning('id');
      const itemId = typeof itemResult === 'object' ? itemResult.id : itemResult;
      stats.items++;

      logger.info('✅ Item inserted successfully', {
        itemName,
        itemId,
        dbItemId: itemId,
        price: item.item_price_value || 0
      });

      // Generate embedding
      const categoryName = categoryNameMap.get(categoryId) || 'Unknown Category';
      const description = item.additional_item_attributes?.description || '';
      const semanticString = `Category: ${categoryName}. Product: ${itemName}. Description: ${description}`.trim();
      
      logger.debug('🧠 Generating embedding for item', {
        itemId,
        itemName,
        semanticString: semanticString.substring(0, 100) + '...',
        categoryName
      });

      const embedding = await generateEmbedding(semanticString);
      const embeddingBuffer = embeddingToBuffer(embedding);

      logger.debug('✅ Embedding generated successfully', {
        itemId,
        itemName,
        embeddingLength: embedding.length,
        firstValues: embedding.slice(0, 5).map(v => v.toFixed(4))
      });

      // FIX: Database-agnostic embedding insertion
      const dbClient = trx.client.config.client;
      logger.debug('📊 Storing embedding in database', {
        itemId,
        itemName,
        dbClient,
        embeddingDimensions: embedding.length
      });

      if (dbClient === 'pg') {
        // Try pgvector format first, fallback to text
        try {
          const vectorString = `[${embedding.join(',')}]`;
          await trx('item_embeddings').insert({
            item_id: itemId,
            item_embedding: trx.raw('?::vector', [vectorString])
          });
          logger.info('✅ Embedding stored as pgvector format', { itemId, itemName });
        } catch (pgVectorError) {
          // Fallback to JSON text storage
          await trx('item_embeddings').insert({
            item_id: itemId,
            item_embedding: JSON.stringify(embedding)
          });
          logger.info('✅ Embedding stored as JSON text format', { itemId, itemName });
        }
        stats.embeddings++;
      } else {
        // SQLite with vec_items table
        await trx.raw('INSERT OR REPLACE INTO vec_items(rowid, item_embedding) VALUES (?, ?)', [itemId, embeddingBuffer]);
        stats.embeddings++;
      }

      logger.info('🎉 Item import completed successfully', {
        itemId,
        itemName,
        totalEmbeddings: stats.embeddings,
        itemsProcessed: i + 1,
        itemsRemaining: items.length - (i + 1)
      });

    } catch (error) {
      const errorMsg = `Failed to import item "${itemName}": ${error.message}`;
      logger.error('💥 CRITICAL: Item import failed completely', {
        itemName,
        itemUniqueId: item.item_unique_identifier,
        categoryId,
        categoryRef: item.associated_category_unique_identifier,
        posDeviceId,
        itemIndex: i + 1,
        totalItems: items.length,
        errorMessage: error.message,
        errorCode: error.code,
        errorStack: error.stack,
        errorSql: error.sql,
        errorDetail: error.detail,
        errorHint: error.hint,
        itemData: {
          price: item.item_price_value,
          displayNames: item.display_names,
          flags: item.item_flags
        }
      });
      stats.errors.push(errorMsg);
      // Continue with the next item instead of failing the entire import
    }
  }
}

/**
 * Update a single entity (item or category) from OOP-POS-MDF format
 * @param {string} entityType - 'item' or 'category'
 * @param {number} entityId - Entity ID
 * @param {Object} jsonSnippet - Updated entity data in OOP-POS-MDF format
 * @returns {Promise<Object>} - Update result
 */
async function updateEntityFromOopMdf(entityType, entityId, jsonSnippet) {
  logger.info('Updating entity from OOP-POS-MDF format', { entityType, entityId });

  try {
    return await db.transaction(async (trx) => {
      if (entityType === 'item') {
        // Update an item
        const currentItem = await trx('items').where('id', entityId).first();
        if (!currentItem) {
          throw new Error(`Item with ID ${entityId} not found`);
        }

        // Build update data from the JSON snippet
        const updateData = {};
        
        if (jsonSnippet.display_names) {
          updateData.display_names = JSON.stringify(jsonSnippet.display_names);
        }
        
        if (jsonSnippet.item_price_value !== undefined) {
          updateData.item_price_value = parseFloat(jsonSnippet.item_price_value);
        }
        
        if (jsonSnippet.pricing_schedules) {
          updateData.pricing_schedules = JSON.stringify(jsonSnippet.pricing_schedules);
        }
        
        if (jsonSnippet.availability_schedule) {
          updateData.availability_schedule = JSON.stringify(jsonSnippet.availability_schedule);
        }
        
        if (jsonSnippet.additional_item_attributes) {
          updateData.additional_item_attributes = JSON.stringify(jsonSnippet.additional_item_attributes);
        }
        
        if (jsonSnippet.item_flags) {
          updateData.item_flags = JSON.stringify(jsonSnippet.item_flags);
        }

        // Update audit trail
        const currentAudit = parseJsonIfNeeded(currentItem.audit_trail);
        updateData.audit_trail = JSON.stringify({
          ...currentAudit,
          updated_at: new Date().toISOString(),
          last_modified_by: 'system', // TODO: Use actual user when auth is available
          version: (currentAudit.version || 0) + 1,
          change_log: [
            ...(currentAudit.change_log || []),
            {
              timestamp: new Date().toISOString(),
              action: 'advanced_json_update',
              source: 'agent_console'
            }
          ]
        });

        // Apply updates
        if (Object.keys(updateData).length > 0) {
          await trx('items').where('id', entityId).update(updateData);
          
          // Update embedding if display names or attributes changed
          if (jsonSnippet.display_names || jsonSnippet.additional_item_attributes) {
            const categoryRow = await trx('categories').where('id', currentItem.associated_category_unique_identifier).first();
            const categoryNames = parseJsonIfNeeded(categoryRow?.category_names || '{}');
            const categoryName = categoryNames.de || categoryNames.en || 'Unknown';
            
            const displayNames = jsonSnippet.display_names || parseJsonIfNeeded(currentItem.display_names);
            const additionalAttrs = jsonSnippet.additional_item_attributes || parseJsonIfNeeded(currentItem.additional_item_attributes);
            
            const itemName = displayNames?.menu?.de || displayNames?.menu?.en || 'Unknown Item';
            const description = additionalAttrs?.description || '';
            
            const semanticString = `Category: ${categoryName}. Product: ${itemName}. Description: ${description}`.trim();
            const embedding = await generateEmbedding(semanticString);
            const embeddingBuffer = embeddingToBuffer(embedding);
            
            // Update embedding in database-agnostic way
            const dbClient = trx.client.config.client;
            if (dbClient === 'pg') {
              const tableExists = await trx.schema.hasTable('item_embeddings');
              if (tableExists) {
                try {
                  // Try pgvector format first
                  const vectorString = `[${embedding.join(',')}]`;
                  const existingEmbedding = await trx('item_embeddings').where('item_id', entityId).first();
                  
                  if (existingEmbedding) {
                    await trx('item_embeddings').where('item_id', entityId).update({
                      item_embedding: trx.raw('?::vector', [vectorString]),
                      updated_at: trx.fn.now()
                    });
                  } else {
                    await trx('item_embeddings').insert({
                      item_id: entityId,
                      item_embedding: trx.raw('?::vector', [vectorString])
                    });
                  }
                } catch (error) {
                  // Fallback to text format if pgvector is not available
                  const existingEmbedding = await trx('item_embeddings').where('item_id', entityId).first();
                  
                  if (existingEmbedding) {
                    await trx('item_embeddings').where('item_id', entityId).update({
                      item_embedding: JSON.stringify(embedding),
                      updated_at: trx.fn.now()
                    });
                  } else {
                    await trx('item_embeddings').insert({
                      item_id: entityId,
                      item_embedding: JSON.stringify(embedding)
                    });
                  }
                }
              }
            } else {
              await trx.raw('INSERT OR REPLACE INTO vec_items(rowid, item_embedding) VALUES (?, ?)', [entityId, embeddingBuffer]);
            }
          }
        }

        return {
          success: true,
          entityType: 'item',
          entityId: entityId,
          message: 'Item updated successfully'
        };

      } else if (entityType === 'category') {
        // Update a category
        const currentCategory = await trx('categories').where('id', entityId).first();
        if (!currentCategory) {
          throw new Error(`Category with ID ${entityId} not found`);
        }

        // Build update data from the JSON snippet
        const updateData = {};
        
        if (jsonSnippet.category_names) {
          updateData.category_names = JSON.stringify(jsonSnippet.category_names);
        }
        
        if (jsonSnippet.category_type) {
          updateData.category_type = jsonSnippet.category_type;
        }
        
        if (jsonSnippet.default_linked_main_group_unique_identifier !== undefined) {
          updateData.default_linked_main_group_unique_identifier = jsonSnippet.default_linked_main_group_unique_identifier;
        }

        // Update audit trail
        const currentAudit = parseJsonIfNeeded(currentCategory.audit_trail);
        updateData.audit_trail = JSON.stringify({
          ...currentAudit,
          updated_at: new Date().toISOString(),
          last_modified_by: 'system', // TODO: Use actual user when auth is available
          version: (currentAudit.version || 0) + 1,
          change_log: [
            ...(currentAudit.change_log || []),
            {
              timestamp: new Date().toISOString(),
              action: 'advanced_json_update',
              source: 'agent_console'
            }
          ]
        });

        // Apply updates
        if (Object.keys(updateData).length > 0) {
          await trx('categories').where('id', entityId).update(updateData);
        }

        return {
          success: true,
          entityType: 'category',
          entityId: entityId,
          message: 'Category updated successfully'
        };

      } else {
        throw new Error(`Unsupported entity type: ${entityType}`);
      }
    });

  } catch (error) {
    logger.error('Failed to update entity from OOP-POS-MDF format', { 
      entityType, 
      entityId, 
      error: error.message 
    });
    
    return {
      success: false,
      error: error.message,
      message: 'Failed to update entity'
    };
  }
}

module.exports = {
  importFromOopMdf,
  updateEntityFromOopMdf
};