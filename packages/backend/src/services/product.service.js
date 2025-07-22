// Product management service with real database logic

const db = require('../db/knex');
const logger = require('../config/logger');
const { generateEmbedding, embeddingToBuffer } = require('./embedding.service');

/**
 * Create a new product in the database
 * @param {Object} productData - Product details (name, price, categoryName, description)
 * @returns {Object} Created product data
 */
async function createProduct(productData) {
    const { name, price, categoryName, description } = productData;
    
    logger.info({ service: 'ProductService', function: 'createProduct', productData }, 'Creating new product...');

    try {
        return await db.transaction(async (trx) => {
            // Step 1: Find the category ID by searching for matching categoryName
            logger.info({ categoryName, type: typeof categoryName }, 'Looking up category');
            
            const category = await trx('categories')
                .whereRaw("JSON_EXTRACT(category_names, '$.de') = ?", [categoryName])
                .first();

            if (!category) {
                throw new Error(`Category '${categoryName}' not found. Available categories should be queried first.`);
            }

            logger.info({ categoryId: category.id, categoryName }, 'Found matching category');

            // Step 2: Get the pos_device_id from the category (we'll use the same one)
            const posDeviceId = category.pos_device_id;

            // Step 3: Generate a unique identifier for the new product
            const sourceUniqueIdentifier = `product_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

            // Step 4: Prepare display names in the required JSON format
            const displayNames = JSON.stringify({
                menu: { de: name },
                button: { de: name },
                receipt: { de: name }
            });

            // Step 5: Prepare item flags and audit trail
            const itemFlags = JSON.stringify({
                is_sellable: true,
                has_negative_price: false
            });

            const auditTrail = JSON.stringify({
                created_at: new Date().toISOString(),
                created_by: 'ai_agent',
                version: 1
            });

            // Step 6: Insert the new item into the database
            const [newItemResult] = await trx('items').insert({
                pos_device_id: posDeviceId,
                source_unique_identifier: sourceUniqueIdentifier,
                associated_category_unique_identifier: category.id,
                display_names: displayNames,
                item_price_value: parseFloat(price),
                item_flags: itemFlags,
                audit_trail: auditTrail
            }).returning('id');

            // Extract the actual ID value (could be object or number depending on database)
            const newItemId = typeof newItemResult === 'object' ? newItemResult.id : newItemResult;
            logger.info({ newItemId }, 'Product inserted into items table');

            // Step 7: Generate and insert vector embedding
            const embeddingText = `Product: ${name}. Category: ${categoryName}. Description: ${description || name}. Price: ${price}`;
            
            logger.info({ embeddingText }, 'Generating embedding for new product');
            const embedding = await generateEmbedding(embeddingText);
            const embeddingBuffer = embeddingToBuffer(embedding);

            // Step 8: Insert the vector into vec_items table with the same rowid as the item ID
            await trx.raw(`
                INSERT INTO vec_items(rowid, item_embedding) 
                VALUES (?, ?)
            `, [newItemId, embeddingBuffer]);

            logger.info({ newItemId }, 'Vector embedding inserted into vec_items table');

            // Step 9: Return success response
            const result = {
                success: true,
                data: {
                    id: newItemId,
                    name: name,
                    price: parseFloat(price),
                    categoryName: categoryName,
                    categoryId: category.id,
                    sourceUniqueIdentifier: sourceUniqueIdentifier,
                    description: description || name,
                    createdAt: new Date().toISOString()
                }
            };

            logger.info({ service: 'ProductService', result }, 'Product created successfully');
            return result;
        });

    } catch (error) {
        logger.error({ service: 'ProductService', error: error.message, stack: error.stack }, 'Failed to create product');
        return {
            success: false,
            message: 'Error creating product: ' + error.message,
            error: error.message
        };
    }
}

/**
 * Legacy function name for backward compatibility
 * @param {Object} details - Product details
 * @returns {Object} Created product data
 */
async function createNewProduct(details) {
    // Map old parameter names to new function
    return await createProduct({
        name: details.name,
        price: details.price,
        categoryName: details.category,
        description: details.description
    });
}

/**
 * Update an existing product with permission checking
 * @param {Number} id - Product ID
 * @param {Object} updates - Updates to apply (name, price, categoryName, description)
 * @param {String} sessionId - User session ID for permission checking
 * @returns {Object} Updated product data or pending change creation result
 */
async function updateExistingProduct(id, updates, sessionId) {
    logger.info({ 
        service: 'ProductService', 
        function: 'updateExistingProduct', 
        productId: id, 
        updates,
        sessionId
    }, 'Processing product update request');

    try {
        return await db.transaction(async (trx) => {
            // Get current user session and permissions
            const userSession = await trx('user_sessions')
                .select([
                    'user_sessions.*',
                    'users.*',
                    'roles.role_name',
                    'roles.permissions',
                    'roles.can_approve_changes',
                    'roles.can_manage_users'
                ])
                .join('users', 'user_sessions.user_id', 'users.id')
                .join('roles', 'users.role_id', 'roles.id')
                .where('user_sessions.session_id', sessionId)
                .where('user_sessions.is_active', true)
                .where('user_sessions.expires_at', '>', new Date())
                .where('users.is_active', true)
                .first();

            if (!userSession) {
                throw new Error('Invalid session or user not authenticated');
            }

            // Get current product data
            const currentProduct = await trx('items').where('id', id).first();
            if (!currentProduct) {
                throw new Error('Product not found');
            }

            const permissions = JSON.parse(userSession.permissions);
            const canEditProducts = permissions.includes('products.edit') || 
                                   permissions.includes('system.admin') || 
                                   userSession.can_approve_changes;

            if (canEditProducts) {
                // Manager/Admin: Apply changes immediately
                return await applyProductUpdateDirectly(trx, id, updates, userSession, currentProduct);
            } else {
                // Cashier: Create pending change for approval
                return await createPendingProductUpdate(trx, id, updates, userSession, currentProduct);
            }
        });

    } catch (error) {
        logger.error({ 
            service: 'ProductService', 
            function: 'updateExistingProduct',
            productId: id,
            error: error.message 
        }, 'Failed to update product');
        
        return {
            success: false,
            message: 'Error updating product: ' + error.message,
            error: error.message
        };
    }
}

/**
 * Apply product update directly (for managers/admins)
 * @param {Object} trx - Database transaction
 * @param {Number} id - Product ID
 * @param {Object} updates - Updates to apply
 * @param {Object} userSession - User session data
 * @param {Object} currentProduct - Current product data
 * @returns {Object} Update result
 */
async function applyProductUpdateDirectly(trx, id, updates, userSession, currentProduct) {
    const updateData = {};
    
    // Handle name update
    if (updates.name && updates.name !== JSON.parse(currentProduct.display_names).menu.de) {
        updateData.display_names = JSON.stringify({
            menu: { de: updates.name },
            button: { de: updates.name },
            receipt: { de: updates.name }
        });
    }
    
    // Handle price update
    if (updates.price !== undefined && parseFloat(updates.price) !== parseFloat(currentProduct.item_price_value)) {
        updateData.item_price_value = parseFloat(updates.price);
    }
    
    // Handle category update
    if (updates.categoryName) {
        const newCategory = await trx('categories')
            .whereRaw("JSON_EXTRACT(category_names, '$.de') = ?", [updates.categoryName])
            .first();
        
        if (!newCategory) {
            throw new Error(`Category '${updates.categoryName}' not found`);
        }
        
        if (newCategory.id !== currentProduct.associated_category_unique_identifier) {
            updateData.associated_category_unique_identifier = newCategory.id;
        }
    }

    // Update audit trail
    updateData.audit_trail = JSON.stringify({
        last_modified_at: new Date().toISOString(),
        last_modified_by: userSession.username,
        version: Date.now(),
        change_log: [{
            timestamp: new Date().toISOString(),
            user: userSession.username,
            action: 'direct_update',
            changes: updates,
            user_role: userSession.role_name
        }]
    });

    // Apply updates if any
    if (Object.keys(updateData).length > 0) {
        await trx('items').where('id', id).update(updateData);
        
        logger.info({ 
            productId: id,
            userId: userSession.user_id,
            username: userSession.username,
            role: userSession.role_name,
            updates: updateData
        }, 'Product updated directly by manager/admin');
    }

    return {
        success: true,
        type: 'direct_update',
        productId: id,
        updated: true,
        changes: updates,
        appliedBy: {
            username: userSession.username,
            role: userSession.role_name,
            timestamp: new Date().toISOString()
        },
        message: 'Product updated successfully'
    };
}

/**
 * Create pending change for product update (for cashiers)
 * @param {Object} trx - Database transaction
 * @param {Number} id - Product ID
 * @param {Object} updates - Updates to apply
 * @param {Object} userSession - User session data
 * @param {Object} currentProduct - Current product data
 * @returns {Object} Pending change creation result
 */
async function createPendingProductUpdate(trx, id, updates, userSession, currentProduct) {
    const changeId = require('crypto').randomUUID();
    
    // Prepare original data
    const originalData = {
        id: currentProduct.id,
        name: JSON.parse(currentProduct.display_names).menu.de,
        price: parseFloat(currentProduct.item_price_value),
        category_id: currentProduct.associated_category_unique_identifier
    };

    // Prepare proposed data
    const proposedData = { ...originalData, ...updates };
    
    // Determine priority based on type of change
    let priority = 'normal';
    if (updates.price !== undefined) {
        const priceDiff = Math.abs(parseFloat(updates.price) - parseFloat(currentProduct.item_price_value));
        if (priceDiff > 10) { // Price change > €10
            priority = 'high';
        }
    }

    // Create pending change record
    await trx('pending_changes').insert({
        change_id: changeId,
        requested_by_user_id: userSession.user_id,
        change_type: 'product_update',
        target_entity_type: 'product',
        target_entity_id: id,
        original_data: JSON.stringify(originalData),
        proposed_data: JSON.stringify(proposedData),
        reason: updates.reason || 'Product update requested',
        priority: priority,
        status: 'pending',
        requires_admin_approval: true,
        audit_trail: JSON.stringify({
            created_at: new Date().toISOString(),
            created_by: userSession.username,
            version: 1,
            action: 'pending_change_creation'
        })
    });

    logger.info({ 
        productId: id,
        changeId,
        userId: userSession.user_id,
        username: userSession.username,
        role: userSession.role_name,
        priority,
        updates
    }, 'Pending product update created for manager approval');

    return {
        success: true,
        type: 'pending_change',
        productId: id,
        changeId: changeId,
        status: 'pending_approval',
        changes: updates,
        priority: priority,
        requestedBy: {
            username: userSession.username,
            role: userSession.role_name,
            timestamp: new Date().toISOString()
        },
        message: 'Product update request submitted for manager approval',
        note: 'Changes will be applied after manager approval'
    };
}

/**
 * Get products by category ID
 * @param {string|number} categoryId - Category ID to filter products
 * @returns {Array} List of products in the category
 */
async function getProductsByCategoryId(categoryId) {
    logger.info({ service: 'ProductService', function: 'getProductsByCategoryId', categoryId }, 'Fetching products for category...');

    try {
        const products = await db('items')
            .where('associated_category_unique_identifier', categoryId)
            .select('*');

        logger.info({ service: 'ProductService', categoryId, count: products.length }, 'Products fetched successfully');
        
        return products;
    } catch (error) {
        logger.error({ service: 'ProductService', error: error.message, categoryId }, 'Failed to fetch products by category');
        throw error;
    }
}

/**
 * Create a price modifier for products
 * @param {Object} details - Modifier details (name, type, value, conditions)
 * @returns {Object} Created modifier data
 */
async function createPriceModifier(details) {
    console.log(`(SERVICE STUB) Creating price modifier: ${details.name} of type ${details.type}...`);
    return { 
        success: true, 
        modifierId: 'mod_mock_' + Date.now(),
        name: details.name,
        type: details.type,
        value: details.value
    };
}

module.exports = { 
    createProduct,
    createNewProduct, 
    updateExistingProduct, 
    createPriceModifier,
    getProductsByCategoryId
};