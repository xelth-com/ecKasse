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
 * @version 2.0.0
 */

const db = require('../db/knex');
const logger = require('../config/logger');
const crypto = require('crypto');
const { bufferToEmbedding } = require('./embedding.service');

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

    // Step 4: Build final oop-pos-mdf structure
    const exportedConfig = {
      "$schema": "https://schemas.eckasse.com/oop-pos-mdf/v2.0.0/schema.json",
      company_details: {
        company_unique_identifier: company.id,
        company_full_name: company.company_full_name,
        
        // Parse and update meta information
        meta_information: {
          ...JSON.parse(company.meta_information || '{}'),
          export_timestamp: new Date().toISOString(),
          exported_by: "eckasse-cli-export-v2.0.0",
          export_version: "2.0.0"
        },
        
        // Parse global configurations
        global_configurations: JSON.parse(company.global_configurations || '{}'),
        
        // Add branches
        branches: branches
      }
    };

    const duration = Date.now() - startTime;
    
    logger.info('OOP-POS-MDF export completed', {
      duration,
      companies: companies.length,
      branches: branches.length,
      totalPosDevices: branches.reduce((sum, b) => sum + b.point_of_sale_devices.length, 0),
      totalCategories: branches.reduce((sum, b) => 
        sum + b.point_of_sale_devices.reduce((s, p) => s + p.categories_for_this_pos.length, 0), 0),
      totalItems: branches.reduce((sum, b) => 
        sum + b.point_of_sale_devices.reduce((s, p) => s + p.items_for_this_pos.length, 0), 0)
    });

    return {
      success: true,
      configuration: exportedConfig,
      metadata: {
        exportedAt: new Date().toISOString(),
        exportVersion: "2.0.0",
        duration,
        stats: {
          companies: companies.length,
          branches: branches.length,
          posDevices: branches.reduce((sum, b) => sum + b.point_of_sale_devices.length, 0),
          categories: branches.reduce((sum, b) => 
            sum + b.point_of_sale_devices.reduce((s, p) => s + p.categories_for_this_pos.length, 0), 0),
          items: branches.reduce((sum, b) => 
            sum + b.point_of_sale_devices.reduce((s, p) => s + p.items_for_this_pos.length, 0), 0)
        }
      }
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
  const startTime = Date.now();
  
  // Step 1: Get all branches for this company
  const branches = await db('branches')
    .select('*')
    .where('company_id', companyId);
  
  if (branches.length === 0) {
    return { branches: [] };
  }
  
  const branchIds = branches.map(b => b.id);
  
  // Step 2: Get all POS devices for all branches in one query
  const posDevices = await db('pos_devices')
    .select('*')
    .whereIn('branch_id', branchIds);
  
  const posDeviceIds = posDevices.map(p => p.id);
  
  // Step 3: Get all categories for all POS devices in one query
  const categories = await db('categories')
    .select('*')
    .whereIn('pos_device_id', posDeviceIds);
  
  // Step 4: Get all items with optimized query (conditional embedding join)
  let itemsQuery = db('items')
    .leftJoin('categories', 'items.associated_category_unique_identifier', 'categories.id')
    .whereIn('items.pos_device_id', posDeviceIds);

  if (includeEmbeddings) {
    itemsQuery = itemsQuery
      .leftJoin('vec_items', 'items.id', 'vec_items.rowid')
      .select('items.*', 'categories.source_unique_identifier as category_source_id', 'vec_items.item_embedding as embedding_vector');
  } else {
    itemsQuery = itemsQuery
      .select('items.*', 'categories.source_unique_identifier as category_source_id');
  }

  const items = await itemsQuery;
  
  // Step 5: Create lookup maps for efficient grouping
  const posDevicesByBranch = new Map();
  const categoriesByPosDevice = new Map();
  const itemsByPosDevice = new Map();
  
  // Group POS devices by branch
  posDevices.forEach(device => {
    if (!posDevicesByBranch.has(device.branch_id)) {
      posDevicesByBranch.set(device.branch_id, []);
    }
    posDevicesByBranch.get(device.branch_id).push(device);
  });
  
  // Group categories by POS device
  categories.forEach(category => {
    if (!categoriesByPosDevice.has(category.pos_device_id)) {
      categoriesByPosDevice.set(category.pos_device_id, []);
    }
    categoriesByPosDevice.get(category.pos_device_id).push(category);
  });
  
  // Group items by POS device
  items.forEach(item => {
    if (!itemsByPosDevice.has(item.pos_device_id)) {
      itemsByPosDevice.set(item.pos_device_id, []);
    }
    itemsByPosDevice.get(item.pos_device_id).push(item);
  });
  
  // Step 6: Build hierarchical structure
  const processedBranches = branches.map(branch => {
    const branchPosDevices = posDevicesByBranch.get(branch.id) || [];
    
    const processedPosDevices = branchPosDevices.map(device => {
      const deviceCategories = categoriesByPosDevice.get(device.id) || [];
      const deviceItems = itemsByPosDevice.get(device.id) || [];
      
      return {
        pos_device_unique_identifier: device.id,
        pos_device_names: JSON.parse(device.pos_device_name || '{}'),
        pos_device_type: device.pos_device_type,
        pos_device_external_number: device.pos_device_external_number,
        pos_device_settings: JSON.parse(device.pos_device_settings || '{}'),
        categories_for_this_pos: processCategories(deviceCategories),
        items_for_this_pos: processItems(deviceItems, includeEmbeddings)
      };
    });
    
    return {
      branch_unique_identifier: branch.id,
      branch_names: JSON.parse(branch.branch_name || '{}'),
      branch_address: branch.branch_address,
      point_of_sale_devices: processedPosDevices
    };
  });
  
  const duration = Date.now() - startTime;
  logger.info('Optimized hierarchical export completed', {
    duration,
    branches: branches.length,
    posDevices: posDevices.length,
    categories: categories.length,
    items: items.length
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
  
  return categories.map(category => ({
    category_unique_identifier: parseInt(category.source_unique_identifier),
    category_names: JSON.parse(category.category_names || '{}'),
    category_type: category.category_type,
    parent_category_unique_identifier: category.parent_category_id ? 
      parseInt(categoryIdMap.get(category.parent_category_id)) : null,
    default_linked_main_group_unique_identifier: category.default_linked_main_group_unique_identifier,
    audit_trail: JSON.parse(category.audit_trail || '{}')
  }));
}

/**
 * Process items data in memory with conditional embedding handling
 */
function processItems(items, includeEmbeddings) {
  return items.map(item => {
    const exportedItem = {
      item_unique_identifier: parseInt(item.source_unique_identifier),
      associated_category_unique_identifier: parseInt(item.category_source_id),
      display_names: JSON.parse(item.display_names || '{}'),
      item_price_value: parseFloat(item.item_price_value),
      pricing_schedules: JSON.parse(item.pricing_schedules || '[]'),
      availability_schedule: JSON.parse(item.availability_schedule || '{}'),
      additional_item_attributes: JSON.parse(item.additional_item_attributes || '{}'),
      item_flags: JSON.parse(item.item_flags || '{}'),
      audit_trail: JSON.parse(item.audit_trail || '{}')
    };

    // Include embedding data if available and requested
    if (includeEmbeddings && item.embedding_vector) {
      // Reconstruct semantic string for hash validation
      const displayNames = JSON.parse(item.display_names || '{}');
      const additionalAttrs = JSON.parse(item.additional_item_attributes || '{}');
      const semanticString = [
        displayNames.de || displayNames.en || '',
        displayNames.en || '',
        additionalAttrs.description || '',
        additionalAttrs.ingredients || ''
      ].filter(Boolean).join(' ').trim();
      
      // Calculate hash of the semantic string
      const sourceHash = crypto.createHash('sha256').update(semanticString).digest('hex');
      
      exportedItem.embedding_data = {
        model: "gemini-embedding-exp-03-07",
        vector: bufferToEmbedding(item.embedding_vector),
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
  const companies = await db('companies').select('*');
  return companies;
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

module.exports = {
  exportToOopMdf,
  exportToOopMdfWithFileName
};