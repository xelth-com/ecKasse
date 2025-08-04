#!/usr/bin/env node

require('dotenv').config({ path: '../../.env' });
const db = require('../db/knex');

async function checkTableStructure() {
    try {
        console.log('Checking items_fts table structure...');
        
        // Check what columns exist
        const result = await db.raw("PRAGMA table_info(items_fts)");
        console.log('FTS table columns:', result);
        
        // Try to get sample data
        const sample = await db.raw("SELECT * FROM items_fts LIMIT 1");
        console.log('Sample FTS data:', sample);
        
    } catch (error) {
        console.error('Error:', error);
    } finally {
        await db.destroy();
    }
}

checkTableStructure();