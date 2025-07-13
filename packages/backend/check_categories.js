#!/usr/bin/env node

/**
 * Check available categories in the database
 */

require('dotenv').config({ path: '../../.env' });
const db = require('./src/db/knex');

async function checkCategories() {
    console.log('🔍 Checking available categories...');
    
    try {
        const categories = await db('categories').select('*');
        console.log(`\nFound ${categories.length} categories:`);
        
        categories.forEach((cat, index) => {
            console.log(`${index + 1}. ID: ${cat.id}`);
            console.log(`   Names: ${cat.category_names}`);
            console.log(`   Type: ${cat.category_type}`);
            console.log(`   POS Device ID: ${cat.pos_device_id}`);
            console.log('');
        });
        
        // Test the JSON extraction query
        console.log('Testing JSON extraction query...');
        const testResult = await db('categories')
            .whereRaw("JSON_EXTRACT(category_names, '$.de') = ?", ['Getränke'])
            .first();
            
        console.log('Result for Getränke:', testResult);
        
        // Try different approaches
        const allResults = await db('categories').whereRaw("category_names LIKE '%Getränke%'");
        console.log('LIKE query results:', allResults);
        
        process.exit(0);
    } catch (error) {
        console.error('Error:', error.message);
        process.exit(1);
    }
}

checkCategories();