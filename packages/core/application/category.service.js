// Category management service with real database logic

const logger = require('../config/logger');
const loggingService = require('./logging.service');

let db = null;

// Initialize the database connection
function initialize(database) {
    db = database;
}

/**
 * Create a new product category
 * @param {Object} details - Category details (name, type)
 * @returns {Object} Created category data
 */
async function createNewCategory(details) {
    console.log(`(SERVICE STUB) Creating category: ${details.name} of type ${details.type}...`);
    return { 
        success: true, 
        categoryId: 'cat_mock_' + Date.now(),
        name: details.name,
        type: details.type
    };
}

/**
 * Update an existing category
 * @param {string} id - Category ID
 * @param {Object} updates - Fields to update
 * @returns {Object} Updated category data
 */
async function updateExistingCategory(id, updates) {
    if (!db) {
        throw new Error('Database not initialized. Call initialize(db) first.');
    }
    
    logger.info({ service: 'CategoryService', function: 'updateExistingCategory', categoryId: id, updates }, 'Updating category...');

    try {
        return await db.transaction(async (trx) => {
            // Find the existing category
            const currentCategory = await trx('categories').where('id', id).first();
            
            if (!currentCategory) {
                throw new Error(`Category with ID ${id} not found`);
            }

            const updateData = {};
            
            // Handle name update
            if (updates.name) {
                const currentNames = JSON.parse(currentCategory.category_names || '{}');
                updateData.category_names = JSON.stringify({
                    ...currentNames,
                    de: updates.name
                });
            }
            
            // Handle type update
            if (updates.type) {
                updateData.category_type = updates.type;
            }
            
            // Update audit trail
            const currentAudit = JSON.parse(currentCategory.audit_trail || '{}');
            updateData.audit_trail = JSON.stringify({
                ...currentAudit,
                updated_at: new Date().toISOString(),
                last_modified_by: 'system', // TODO: Use actual user when auth is available
                version: (currentAudit.version || 0) + 1,
                change_log: [
                    ...(currentAudit.change_log || []),
                    {
                        timestamp: new Date().toISOString(),
                        action: 'category_update',
                        changes: updates
                    }
                ]
            });

            // Apply updates if any
            if (Object.keys(updateData).length > 0) {
                await trx('categories').where('id', id).update(updateData);
                
                // Log fiscal event for master data change
                await loggingService.logFiscalEvent('master_data_change_update', null, {
                    entity: 'category',
                    category_id: id,
                    changes: updates,
                    initiator: { type: 'system', id: null }
                }, trx);
                
                logger.info({ 
                    categoryId: id,
                    updates: updateData
                }, 'Category updated successfully');
            }

            return {
                success: true,
                categoryId: id,
                updated: true,
                changes: updates,
                message: 'Category updated successfully'
            };
        });

    } catch (error) {
        logger.error({ 
            service: 'CategoryService', 
            function: 'updateExistingCategory',
            categoryId: id,
            error: error.message 
        }, 'Failed to update category');
        
        return {
            success: false,
            message: 'Error updating category: ' + error.message,
            error: error.message
        };
    }
}

/**
 * Get all categories
 * @returns {Object} List of all categories
 */
async function getAllCategories() {
    console.log(`(SERVICE STUB) Getting all categories...`);
    return { 
        success: true, 
        categories: [
            { id: 'cat_mock_1', name: 'Drinks', type: 'drink' },
            { id: 'cat_mock_2', name: 'Food', type: 'food' },
            { id: 'cat_mock_3', name: 'Desserts', type: 'food' }
        ]
    };
}

module.exports = { 
    initialize,
    createNewCategory, 
    updateExistingCategory, 
    getAllCategories 
};