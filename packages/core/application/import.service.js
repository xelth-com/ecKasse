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

const bcrypt = require('bcrypt');
const db = require('../db/knex');
const { generateEmbedding, embeddingToBuffer } = require('./embedding.service');
const logger = require('../config/logger');
const crypto = require('crypto');

/**
 * Import a complete oop-pos-mdf JSON configuration into the database
 * @param {Object} jsonData - The parsed oop-pos-mdf JSON data
 * @param {Function} progressCallback - Callback for progress reporting (current, total, itemName)
 * @param {Object} options - Import options
 * @returns {Promise<Object>} - Import result with statistics
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
    // Wrap entire operation in a transaction for atomicity
    const result = await db.transaction(async (trx) => {
      // Step 1: Clean existing data (respecting foreign key constraints)
      await cleanExistingData(trx);
      
      // Step 2: Import hierarchical data
      const importResult = await importHierarchicalData(trx, jsonData, stats, progressCallback);
      
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
  await trx('storno_log').del();
  await trx('pending_changes').del();
  await trx('user_sessions').del();
  // await trx('users').del(); // Preserve existing users
  // await trx('roles').del(); // Preserve existing roles
  await trx('items').del();
  await trx('categories').del();
  await trx('pos_devices').del();
  await trx('branches').del();
  await trx('companies').del();
  
  // Reset auto-increment sequences (database-specific)
  const client = trx.client.config.client;
  if (client === 'sqlite3') {
    await trx.raw('UPDATE sqlite_sequence SET seq = 0 WHERE name IN (?, ?, ?, ?, ?)', 
      ['companies', 'branches', 'pos_devices', 'categories', 'items']);
  } else if (client === 'pg') {
    // PostgreSQL sequence reset
    await trx.raw('ALTER SEQUENCE companies_id_seq RESTART WITH 1');
    await trx.raw('ALTER SEQUENCE branches_id_seq RESTART WITH 1');
    await trx.raw('ALTER SEQUENCE pos_devices_id_seq RESTART WITH 1');
    await trx.raw('ALTER SEQUENCE categories_id_seq RESTART WITH 1');
    await trx.raw('ALTER SEQUENCE items_id_seq RESTART WITH 1');
  }
  
  logger.info('Database cleanup completed');
}

/**
 * Import hierarchical data structure
 * @param {Object} trx - Knex transaction object
 * @param {Object} jsonData - The oop-pos-mdf JSON data
 * @param {Object} stats - Statistics object to update
 * @returns {Promise<Object>} - Import result
 */
async function importHierarchicalData(trx, jsonData, stats, progressCallback = null) {
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
  
  // Handle different return formats between SQLite and PostgreSQL
  const companyId = typeof companyResult[0] === 'object' ? companyResult[0].id : companyResult[0];

  stats.companies++;

  // Step 2a: Import user management if it exists (using upsert logic)
  const roleIdMap = new Map();
  if (companyDetails.user_management) {
    logger.info('Importing user management data with upsert logic...');
    
    // Import roles first with upsert logic
    if (companyDetails.user_management.roles) {
      for (const role of companyDetails.user_management.roles) {
        // Check if role already exists by role_name
        const existingRole = await trx('roles').where('role_name', role.role_name).first();
        
        let roleId;
        if (existingRole) {
          // Update existing role
          logger.info(`Updating existing role: ${role.role_name}`);
          await trx('roles').where('id', existingRole.id).update({
            role_display_names: JSON.stringify(role.role_display_names),
            description: role.description,
            permissions: JSON.stringify(role.permissions),
            default_storno_daily_limit: role.default_storno_daily_limit,
            default_storno_emergency_limit: role.default_storno_emergency_limit,
            can_approve_changes: role.can_approve_changes,
            can_manage_users: role.can_manage_users,
            is_system_role: role.is_system_role,
            audit_trail: JSON.stringify({
              ...JSON.parse(existingRole.audit_trail || '{}'),
              updated_at: new Date().toISOString(),
              updated_by: 'import_service',
              import_data: role.audit_trail
            })
          });
          roleId = existingRole.id;
          stats.rolesUpdated = (stats.rolesUpdated || 0) + 1;
        } else {
          // Insert new role
          logger.info(`Creating new role: ${role.role_name}`);
          const [newRole] = await trx('roles').insert({
            role_name: role.role_name,
            role_display_names: JSON.stringify(role.role_display_names),
            description: role.description,
            permissions: JSON.stringify(role.permissions),
            default_storno_daily_limit: role.default_storno_daily_limit,
            default_storno_emergency_limit: role.default_storno_emergency_limit,
            can_approve_changes: role.can_approve_changes,
            can_manage_users: role.can_manage_users,
            is_system_role: role.is_system_role,
            audit_trail: JSON.stringify({
              created_at: new Date().toISOString(),
              created_by: 'import_service',
              import_data: role.audit_trail
            })
          }).returning('id');
          roleId = typeof newRole === 'object' ? newRole.id : newRole;
          stats.rolesCreated = (stats.rolesCreated || 0) + 1;
        }
        
        roleIdMap.set(role.role_unique_identifier, roleId);
      }
    }

    // Import users with upsert logic
    if (companyDetails.user_management.users) {
      for (const user of companyDetails.user_management.users) {
        const newRoleId = roleIdMap.get(user.role_id);
        if (!newRoleId) {
          logger.warn(`Could not find new role ID for old role ID ${user.role_id} for user ${user.username}. Skipping user.`);
          continue;
        }
        
        // Check if user already exists by username
        const existingUser = await trx('users').where('username', user.username).first();
        
        // Prepare user data
        const userData = {
          email: user.email,
          full_name: user.full_name,
          role_id: newRoleId,
          storno_daily_limit: user.storno_daily_limit,
          storno_emergency_limit: user.storno_emergency_limit,
          trust_score: user.trust_score,
          is_active: user.is_active,
          user_preferences: JSON.stringify(user.user_preferences || {})
        };
        
        // Handle password hash - use imported hash if available, otherwise set default
        if (user.password_hash) {
          userData.password_hash = user.password_hash;
          userData.force_password_change = false; // If hash is imported, assume it's intentional
        } else {
          const defaultPassword = 'changeme';
          const saltRounds = 12;
          userData.password_hash = await bcrypt.hash(defaultPassword, saltRounds);
          userData.force_password_change = true; // Force change for default password
        }
        
        if (existingUser) {
          // Update existing user (preserve some sensitive fields)
          logger.info(`Updating existing user: ${user.username}`);
          
          // Don't overwrite password_hash if not provided in import (security)
          if (!user.password_hash) {
            delete userData.password_hash;
            delete userData.force_password_change;
          }
          
          userData.audit_trail = JSON.stringify({
            ...JSON.parse(existingUser.audit_trail || '{}'),
            updated_at: new Date().toISOString(),
            updated_by: 'import_service',
            import_data: user.audit_trail
          });
          
          await trx('users').where('id', existingUser.id).update(userData);
          stats.usersUpdated = (stats.usersUpdated || 0) + 1;
        } else {
          // Insert new user
          logger.info(`Creating new user: ${user.username}`);
          userData.username = user.username;
          userData.audit_trail = JSON.stringify({
            created_at: new Date().toISOString(),
            created_by: 'import_service',
            import_data: user.audit_trail
          });
          
          await trx('users').insert(userData);
          stats.usersCreated = (stats.usersCreated || 0) + 1;
        }
      }
    }
  }

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
    
    // Handle different return formats between SQLite and PostgreSQL
    const branchId = typeof branchResult[0] === 'object' ? branchResult[0].id : branchResult[0];

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
      
      // Handle different return formats between SQLite and PostgreSQL
      const posDeviceId = typeof posDeviceResult[0] === 'object' ? posDeviceResult[0].id : posDeviceResult[0];

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
          
          // Handle different return formats between SQLite and PostgreSQL
          const categoryId = typeof categoryResult[0] === 'object' ? categoryResult[0].id : categoryResult[0];

          // Store mapping for item linking
          categoryIdMap.set(category.category_unique_identifier, categoryId);
          stats.categories++;
        }
      }

      // Step 5: Import items with integrated vectorization
      if (posDevice.items_for_this_pos && Array.isArray(posDevice.items_for_this_pos)) {
        await importItemsWithVectorization(trx, posDevice.items_for_this_pos, posDeviceId, categoryIdMap, stats, progressCallback);
      }
    }
  }

  // Note: Default user creation is now handled by db_init.js on server startup
  // This ensures consistent user access regardless of import operations
  
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
 * @param {Function} progressCallback - Callback for progress reporting (current, total, itemName)
 */
async function importItemsWithVectorization(trx, items, posDeviceId, categoryIdMap, stats, progressCallback = null) {
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
  
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const itemName = item.display_names?.menu?.de || item.display_names?.menu?.en || 'Unknown Item';
    
    // Report progress
    if (progressCallback) {
      progressCallback(i + 1, items.length, itemName);
    }
    
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
        item_flags: JSON.stringify(item.item_flags || { is_sellable: true }),
        audit_trail: JSON.stringify(item.audit_trail || { created_at: new Date().toISOString(), created_by: 'import_service' })
      }).returning('id');
      
      // Handle different return formats between SQLite and PostgreSQL
      const itemId = typeof itemResult[0] === 'object' ? itemResult[0].id : itemResult[0];

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