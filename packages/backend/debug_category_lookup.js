#!/usr/bin/env node

/**
 * Debug category lookup issue
 */

require('dotenv').config({ path: '../../.env' });
const db = require('./src/db/knex');

async function debugCategoryLookup() {
    console.log('🔍 Debugging category lookup...');
    
    try {
        // Check all categories
        const allCategories = await db('categories').select('*');
        console.log('\nAll categories:');
        allCategories.forEach(cat => {
            console.log(`ID: ${cat.id}, Names: ${cat.category_names}, Type: ${cat.category_type}`);
        });
        
        // Test different JSON extraction methods
        console.log('\n🧪 Testing JSON extraction methods...');
        
        // Method 1: JSON_EXTRACT
        console.log('1. Using JSON_EXTRACT...');
        const result1 = await db('categories')
            .whereRaw("JSON_EXTRACT(category_names, '$.de') = ?", ['EXTRAS'])
            .first();
        console.log('Result:', result1);
        
        // Method 2: Using knex json operators
        console.log('2. Using Knex JSON operators...');
        try {
            const result2 = await db('categories')
                .where('category_names->de', 'EXTRAS')
                .first();
            console.log('Result:', result2);
        } catch (err) {
            console.log('JSON operator failed:', err.message);
        }
        
        // Method 3: LIKE query
        console.log('3. Using LIKE query...');
        const result3 = await db('categories')
            .whereRaw("category_names LIKE ?", ['%EXTRAS%'])
            .first();
        console.log('Result:', result3);
        
        // Method 4: Raw query to test database
        console.log('4. Raw SQL query...');
        const rawResult = await db.raw("SELECT * FROM categories WHERE JSON_EXTRACT(category_names, '$.de') = 'EXTRAS'");
        console.log('Raw result:', rawResult);
        
        process.exit(0);
    } catch (error) {
        console.error('Error:', error.message);
        console.error('Stack:', error.stack);
        process.exit(1);
    }
}

debugCategoryLookup();