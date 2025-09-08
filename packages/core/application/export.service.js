/**
 * Export Service for OOP-POS-MDF Data Export
 * 
 * This service handles exporting the current database state back to 
 * oop-pos-mdf JSON format for backup, review, or re-import purposes.
 * 
 * Features:
 * - Full database export to oop-pos-mdf v2.0.0 format
 * - Hierarchical data reconstruction (companies → branches → pos_devices → categories → items)
 * - Export metadata with timestamps and version information
 * - Validation of exported data structure
 * 
 * @author eckasse Development Team
 * @version 2.1.0 - DB-aware embedding export
 */

const db = require('../db/knex');
const logger = require('../config/logger');
const fs = require('fs');
const fsp = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const archiver = require('archiver');
const { bufferToEmbedding, jsonToEmbedding } = require('./embedding.service');

/**
 * Export current database state to OOP-POS-MDF JSON format
 * @param {Object} options - Export options
 * @returns {Promise<Object>} - Complete oop-pos-mdf configuration
 */
async function exportToOopMdf(options = {}) {
  const startTime = Date.now();
  const includeEmbeddings = options.includeEmbeddings !== false; // Default to true
  
  logger.info('Starting OOP-POS-MDF export', { 
    timestamp: new Date().toISOString(),
    options,
    includeEmbeddings
  });

  try {
    // Step 1: Export companies with global configurations
    const companies = await exportCompanies();
    
    if (companies.length === 0) {
      throw new Error('No companies found in database - nothing to export');
    }

    // For now, export the first company (single-company system)
    const company = companies[0];
    
    // Step 2: Export all hierarchical data with optimized bulk queries
    const exportedData = await exportHierarchicalDataOptimized(company.id, includeEmbeddings);
    const branches = exportedData.branches;

    // Step 3: Export user management data
    const roles = await db('roles').select('id as role_unique_identifier', 'role_name', 'role_display_names', 'description', 'permissions', 'default_storno_daily_limit', 'default_storno_emergency_limit', 'can_approve_changes', 'can_manage_users', 'is_system_role', 'audit_trail');
    const users = await db('users').select('id as user_unique_identifier', 'username', 'email', 'password_hash', 'full_name', 'role_id', 'storno_daily_limit', 'storno_emergency_limit', 'trust_score', 'is_active', 'user_preferences', 'audit_trail');

    const user_management = {
      roles: roles.map(r => {
        try {
          return {
            ...r, 
            permissions: typeof r.permissions === 'string' ? JSON.parse(r.permissions || '{}') : (r.permissions || {}), 
            role_display_names: typeof r.role_display_names === 'string' ? JSON.parse(r.role_display_names || '{}') : (r.role_display_names || {}), 
            audit_trail: typeof r.audit_trail === 'string' ? JSON.parse(r.audit_trail || '{}') : (r.audit_trail || {})
          };
        } catch (e) {
          logger.warn('Invalid JSON in role data', { role_id: r.role_unique_identifier, error: e.message });
          return {
            ...r, 
            permissions: {}, 
            role_display_names: {}, 
            audit_trail: {}
          };
        }
      }),
      users: users.map(u => {
        try {
          return {
            ...u, 
            user_preferences: typeof u.user_preferences === 'string' ? JSON.parse(u.user_preferences || '{}') : (u.user_preferences || {}), 
            audit_trail: typeof u.audit_trail === 'string' ? JSON.parse(u.audit_trail || '{}') : (u.audit_trail || {})
          };
        } catch (e) {
          logger.warn('Invalid JSON in user data', { user_id: u.user_unique_identifier, error: e.message });
          return {
            ...u, 
            user_preferences: {}, 
            audit_trail: {}
          };
        }
      })
    };

    // Step 4: Build final oop-pos-mdf structure
    const exportedConfig = {
      "$schema": "https://schemas.eckasse.com/oop-pos-mdf/v2.0.0/schema.json",
      company_details: {
        company_unique_identifier: company.id,
        company_full_name: company.company_full_name,
        
        // Parse and update meta information
        meta_information: {
          ...(typeof company.meta_information === 'string' ? JSON.parse(company.meta_information || '{}') : (company.meta_information || {})),
          export_timestamp: new Date().toISOString(),
          exported_by: "eckasse-cli-export-v2.0.0",
          export_version: "2.0.0"
        },
        
        // Parse global configurations
        global_configurations: typeof company.global_configurations === 'string' ? JSON.parse(company.global_configurations || '{}') : (company.global_configurations || {}),

        user_management,
        
        // Add branches
        branches: branches
      }
    };

    const duration = Date.now() - startTime;
    
    // Generate filename with timestamp and embedding suffix
    const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
    const embeddingSuffix = includeEmbeddings ? '_emb' : '';
    const jsonFilename = `oop-pos-mdf-export-${timestamp}${embeddingSuffix}.json`;
    const zipFilename = `oop-pos-mdf-export-${timestamp}${embeddingSuffix}.zip`;
    
    // Use external output directory for exports  
    const outputDir = path.join(__dirname, '../../../../ecKasseOut');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    
    // Create JSON content and save to ZIP archive
    const jsonContent = JSON.stringify(exportedConfig, null, 2);
    const zipPath = path.join(outputDir, zipFilename);
    
    // Create ZIP archive with JSON file inside
    await new Promise((resolve, reject) => {
      const archive = archiver('zip', { zlib: { level: 9 } });
      const output = fs.createWriteStream(zipPath);
      
      output.on('close', resolve);
      archive.on('error', reject);
      
      archive.pipe(output);
      archive.append(jsonContent, { name: jsonFilename });
      archive.finalize();
    });

    logger.info('OOP-POS-MDF export completed', {
      duration,
      filePath: zipPath,
      fileSize: jsonContent.length,
      stats: {
        companies: companies.length,
        branches: branches.length,
        posDevices: branches.reduce((sum, b) => sum + (b.point_of_sale_devices?.length || 0), 0)
      }
    });

    return {
      success: true,
      configuration: exportedConfig,
      path: zipPath,
      filename: zipFilename,
      metadata: { fileSize: jsonContent.length, archiveFormat: 'zip' }
    };

  } catch (error) {
    logger.error('OOP-POS-MDF export failed', { error: error.message, stack: error.stack });
    throw error;
  }
}

/**
 * Optimized hierarchical data export with bulk queries
 * @param {number} companyId - Company ID
 * @param {boolean} includeEmbeddings - Whether to include embeddings
 */
async function exportHierarchicalDataOptimized(companyId, includeEmbeddings = true) {
  const dbClient = db.client.config.client;
  const branches = await db('branches').select('*').where('company_id', companyId);
  if (branches.length === 0) return { branches: [] };
  
  const branchIds = branches.map(b => b.id);
  const posDevices = await db('pos_devices').select('*').whereIn('branch_id', branchIds);
  const posDeviceIds = posDevices.map(p => p.id);
  const categories = await db('categories').select('*').whereIn('pos_device_id', posDeviceIds);

  let itemsQuery = db('items')
    .leftJoin('categories', 'items.associated_category_unique_identifier', 'categories.id')
    .whereIn('items.pos_device_id', posDeviceIds);

  if (includeEmbeddings) {
    if (dbClient === 'pg') {
      itemsQuery = itemsQuery
        .leftJoin('item_embeddings', 'items.id', 'item_embeddings.item_id')
        .select('items.*', 'categories.source_unique_identifier as category_source_id', 'categories.id as category_internal_id', 'item_embeddings.item_embedding as embedding_vector');
    } else {
      itemsQuery = itemsQuery
        .leftJoin('vec_items', 'items.id', 'vec_items.rowid')
        .select('items.*', 'categories.source_unique_identifier as category_source_id', 'categories.id as category_internal_id', 'vec_items.item_embedding as embedding_vector');
    }
  } else {
    itemsQuery = itemsQuery.select('items.*', 'categories.source_unique_identifier as category_source_id', 'categories.id as category_internal_id');
  }

  const items = await itemsQuery;
  
  const posDevicesByBranch = new Map();
  posDevices.forEach(d => {
    if (!posDevicesByBranch.has(d.branch_id)) {
      posDevicesByBranch.set(d.branch_id, []);
    }
    posDevicesByBranch.get(d.branch_id).push(d);
  });

  const categoriesByPosDevice = new Map();
  categories.forEach(c => {
    if (!categoriesByPosDevice.has(c.pos_device_id)) {
      categoriesByPosDevice.set(c.pos_device_id, []);
    }
    categoriesByPosDevice.get(c.pos_device_id).push(c);
  });
  
  const itemsByPosDevice = new Map();
  items.forEach(i => {
    if (!itemsByPosDevice.has(i.pos_device_id)) {
      itemsByPosDevice.set(i.pos_device_id, []);
    }
    itemsByPosDevice.get(i.pos_device_id).push(i);
  });
  const processedBranches = branches.map(branch => {
    const branchPosDevices = posDevicesByBranch.get(branch.id) || [];
    const processedPosDevices = branchPosDevices.map(device => ({
      pos_device_unique_identifier: device.id,
      pos_device_names: typeof device.pos_device_name === 'string' ? JSON.parse(device.pos_device_name || '{}') : (device.pos_device_name || {}),
      pos_device_type: device.pos_device_type,
      pos_device_external_number: device.pos_device_external_number,
      pos_device_settings: typeof device.pos_device_settings === 'string' ? JSON.parse(device.pos_device_settings || '{}') : (device.pos_device_settings || {}),
      categories_for_this_pos: processCategories(categoriesByPosDevice.get(device.id) || []),
      items_for_this_pos: processItems(itemsByPosDevice.get(device.id) || [], includeEmbeddings, dbClient)
    }));
    return {
      branch_unique_identifier: branch.id,
      branch_names: typeof branch.branch_name === 'string' ? JSON.parse(branch.branch_name || '{}') : (branch.branch_name || {}),
      branch_address: branch.branch_address,
      point_of_sale_devices: processedPosDevices
    };
  });

  return { branches: processedBranches };
}

/**
 * Process categories data in memory
 */
function processCategories(categories) {
  // Build mapping of internal IDs to source identifiers for parent lookup
  const categoryIdMap = new Map();
  categories.forEach(cat => {
    categoryIdMap.set(cat.id, cat.source_unique_identifier);
  });
  
  return categories.map(category => {
    // Use source_unique_identifier if it exists and is numeric, otherwise use internal id
    let categoryId;
    if (category.source_unique_identifier) {
      const parsedSourceId = parseInt(category.source_unique_identifier);
      categoryId = isNaN(parsedSourceId) ? category.id : parsedSourceId;
    } else {
      categoryId = category.id;
    }
    
    return {
      category_unique_identifier: categoryId,
      category_names: typeof category.category_names === 'string' ? JSON.parse(category.category_names || '{}') : category.category_names || {},
      category_type: category.category_type,
      parent_category_unique_identifier: category.parent_category_id ? 
        parseInt(categoryIdMap.get(category.parent_category_id)) : null,
      default_linked_main_group_unique_identifier: category.default_linked_main_group_unique_identifier,
      audit_trail: typeof category.audit_trail === 'string' ? JSON.parse(category.audit_trail || '{}') : category.audit_trail || {}
    };
  });
}

/**
 * Process items data in memory with conditional embedding handling
 */
function processItems(items, includeEmbeddings, dbClient) {
  return items.map(item => {
    // Use source_unique_identifier if it exists and is numeric, otherwise use internal id
    let itemId;
    if (item.source_unique_identifier) {
      const parsedSourceId = parseInt(item.source_unique_identifier);
      itemId = isNaN(parsedSourceId) ? item.id : parsedSourceId;
    } else {
      itemId = item.id;
    }
    
    // Same logic for category ID
    let categoryId;
    if (item.category_source_id) {
      const parsedCategoryId = parseInt(item.category_source_id);
      categoryId = isNaN(parsedCategoryId) ? item.category_internal_id : parsedCategoryId;
    } else {
      categoryId = item.category_internal_id;
    }
    
    const exportedItem = {
      item_unique_identifier: itemId,
      associated_category_unique_identifier: categoryId,
      display_names: typeof item.display_names === 'string' ? JSON.parse(item.display_names || '{}') : item.display_names || {},
      item_price_value: parseFloat(item.item_price_value),
      pricing_schedules: typeof item.pricing_schedules === 'string' ? JSON.parse(item.pricing_schedules || '[]') : item.pricing_schedules || [],
      availability_schedule: typeof item.availability_schedule === 'string' ? JSON.parse(item.availability_schedule || '{}') : item.availability_schedule || {},
      additional_item_attributes: typeof item.additional_item_attributes === 'string' ? JSON.parse(item.additional_item_attributes || '{}') : item.additional_item_attributes || {},
      item_flags: typeof item.item_flags === 'string' ? JSON.parse(item.item_flags || '{}') : item.item_flags || {},
      audit_trail: typeof item.audit_trail === 'string' ? JSON.parse(item.audit_trail || '{}') : item.audit_trail || {}
    };

    if (includeEmbeddings && item.embedding_vector) {
      const displayNames = typeof item.display_names === 'string' ? JSON.parse(item.display_names || '{}') : item.display_names || {};
      const additionalAttrs = typeof item.additional_item_attributes === 'string' ? JSON.parse(item.additional_item_attributes || '{}') : item.additional_item_attributes || {};
      const semanticString = [displayNames.menu?.de || '', additionalAttrs.description || ''].filter(Boolean).join(' ').trim();
      const sourceHash = crypto.createHash('sha256').update(semanticString).digest('hex');
      
      let vector;
      if (typeof item.embedding_vector === 'string') {
        // Handle both JSON string format and PostgreSQL array format
        vector = jsonToEmbedding(item.embedding_vector);
      } else {
        vector = bufferToEmbedding(item.embedding_vector); // SQLite buffer
      }

      exportedItem.embedding_data = {
        model: process.env.GEMINI_EMBEDDING_MODEL || "gemini-embedding-001",
        vector: includeEmbeddings ? vector : `[${vector.length} dimensions: ${vector.slice(0,3).join(', ')}...]`,
        vector_length: vector.length,
        source_hash: sourceHash
      };
    }

    return exportedItem;
  });
}

/**
 * Export companies from database
 */
async function exportCompanies() {
  return db('companies').select('*');
}

// Legacy functions removed - using optimized exportHierarchicalDataOptimized instead

/**
 * Export with file naming that includes 'exp' suffix
 * @param {Object} options - Export options
 * @returns {Promise<Object>} - Export result with suggested filename
 */
async function exportToOopMdfWithFileName(options = {}) {
  const result = await exportToOopMdf(options);
  
  // Generate filename with 'exp' suffix
  const companyName = result.configuration.company_details.company_full_name || 'Company';
  const sanitizedName = companyName.replace(/[^a-zA-Z0-9]/g, '_');
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 16);
  const filename = `${sanitizedName}_${timestamp}_exp.json`;
  
  return {
    ...result,
    suggestedFilename: filename
  };
}

/**
 * Export a single entity (item or category) to OOP-POS-MDF format for editing
 * @param {string} entityType - 'item' or 'category'
 * @param {number} entityId - Entity ID
 * @returns {Promise<Object>} - Single entity in OOP-POS-MDF format
 */
async function exportEntityToOopMdf(entityType, entityId) {
  logger.info('Exporting single entity for editing', { entityType, entityId });
  const dbClient = db.client.config.client;

  try {
    if (entityType === 'item') {
      let query = db('items')
        .leftJoin('categories', 'items.associated_category_unique_identifier', 'categories.id')
        .where('items.id', entityId);

      if (dbClient === 'pg') {
        query = query
          .leftJoin('item_embeddings', 'items.id', 'item_embeddings.item_id')
          .select('items.*', 'categories.source_unique_identifier as category_source_id', 'categories.id as category_internal_id', 'item_embeddings.item_embedding as embedding_vector');
      } else {
        query = query
          .leftJoin('vec_items', 'items.id', 'vec_items.rowid')
          .select('items.*', 'categories.source_unique_identifier as category_source_id', 'categories.id as category_internal_id', 'vec_items.item_embedding as embedding_vector');
      }

      const item = await query.first();
      if (!item) throw new Error(`Item with ID ${entityId} not found`);
      
      const processedItem = processItems([item], true, dbClient)[0];
      return { success: true, entity: processedItem, entityType: 'item', entityId };

    } else if (entityType === 'category') {
      // Export a single category
      const category = await db('categories')
        .select('*')
        .where('id', entityId)
        .first();

      if (!category) {
        throw new Error(`Category with ID ${entityId} not found`);
      }

      const processedCategory = processCategories([category])[0];
      return { success: true, entity: processedCategory, entityType: 'category', entityId };

    } else {
      throw new Error(`Unsupported entity type: ${entityType}`);
    }

  } catch (error) {
    logger.error('Failed to export entity for editing', { entityType, entityId, error: error.message, stack: error.stack });
    throw error;
  }
}

module.exports = {
  exportToOopMdf,
  exportToOopMdfWithFileName,
  exportEntityToOopMdf
};