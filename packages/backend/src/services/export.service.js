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

/**
 * Export current database state to OOP-POS-MDF JSON format
 * @param {Object} options - Export options
 * @returns {Promise<Object>} - Complete oop-pos-mdf configuration
 */
async function exportToOopMdf(options = {}) {
  const startTime = Date.now();
  
  logger.info('Starting OOP-POS-MDF export', { 
    timestamp: new Date().toISOString(),
    options
  });

  try {
    // Step 1: Export companies with global configurations
    const companies = await exportCompanies();
    
    if (companies.length === 0) {
      throw new Error('No companies found in database - nothing to export');
    }

    // For now, export the first company (single-company system)
    const company = companies[0];
    
    // Step 2: Export branches for this company
    const branches = await exportBranches(company.id);
    
    // Step 3: Export POS devices, categories, and items for each branch
    for (const branch of branches) {
      branch.point_of_sale_devices = await exportPosDevices(branch.branch_unique_identifier);
      
      for (const posDevice of branch.point_of_sale_devices) {
        posDevice.categories_for_this_pos = await exportCategories(posDevice.pos_device_unique_identifier);
        posDevice.items_for_this_pos = await exportItems(posDevice.pos_device_unique_identifier);
      }
    }

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
 * Export companies from database
 */
async function exportCompanies() {
  const companies = await db('companies').select('*');
  return companies;
}

/**
 * Export branches for a specific company
 */
async function exportBranches(companyId) {
  const branches = await db('branches')
    .select('*')
    .where('company_id', companyId);
  
  return branches.map(branch => ({
    branch_unique_identifier: branch.id,
    branch_names: JSON.parse(branch.branch_name || '{}'),
    branch_address: branch.branch_address,
    point_of_sale_devices: [] // Will be populated later
  }));
}

/**
 * Export POS devices for a specific branch
 */
async function exportPosDevices(branchId) {
  const posDevices = await db('pos_devices')
    .select('*')
    .where('branch_id', branchId);
  
  return posDevices.map(device => ({
    pos_device_unique_identifier: device.id,
    pos_device_names: JSON.parse(device.pos_device_name || '{}'),
    pos_device_type: device.pos_device_type,
    pos_device_external_number: device.pos_device_external_number,
    pos_device_settings: JSON.parse(device.pos_device_settings || '{}'),
    categories_for_this_pos: [], // Will be populated later
    items_for_this_pos: [] // Will be populated later
  }));
}

/**
 * Export categories for a specific POS device
 */
async function exportCategories(posDeviceId) {
  // Get categories and their parent relationships
  const categories = await db('categories')
    .select('*')
    .where('pos_device_id', posDeviceId);
  
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
 * Export items for a specific POS device
 */
async function exportItems(posDeviceId) {
  // Get items with their associated category information
  const items = await db('items')
    .leftJoin('categories', 'items.associated_category_unique_identifier', 'categories.id')
    .select('items.*', 'categories.source_unique_identifier as category_source_id')
    .where('items.pos_device_id', posDeviceId);
  
  return items.map(item => ({
    item_unique_identifier: parseInt(item.source_unique_identifier),
    associated_category_unique_identifier: parseInt(item.category_source_id),
    display_names: JSON.parse(item.display_names || '{}'),
    item_price_value: parseFloat(item.item_price_value),
    pricing_schedules: JSON.parse(item.pricing_schedules || '[]'),
    availability_schedule: JSON.parse(item.availability_schedule || '{}'),
    additional_item_attributes: JSON.parse(item.additional_item_attributes || '{}'),
    item_flags: JSON.parse(item.item_flags || '{}'),
    audit_trail: JSON.parse(item.audit_trail || '{}')
  }));
}

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