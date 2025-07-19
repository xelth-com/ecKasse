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
 * Update an existing product's attributes
 * @param {string} id - Product ID or name
 * @param {Object} updates - Fields to update
 * @returns {Object} Updated product data
 */
async function updateExistingProduct(id, updates) {
    console.log(`(SERVICE STUB) Updating product ${id} with:`, updates);
    return { 
        success: true, 
        productId: id,
        updated: true,
        changes: updates
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