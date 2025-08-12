#!/usr/bin/env node

require('dotenv').config({ path: '../../.env' });
const db = require('../db/knex');

async function fixFTSTable() {
    try {
        console.log('Fixing FTS table...');
        
        // Drop existing FTS table and triggers
        await db.raw(`DROP TABLE IF EXISTS items_fts`);
        await db.raw(`DROP TRIGGER IF EXISTS items_after_insert`);
        await db.raw(`DROP TRIGGER IF EXISTS items_after_delete`);  
        await db.raw(`DROP TRIGGER IF EXISTS items_after_update`);
        
        console.log('Dropped old FTS table and triggers');
        
        // Create new FTS table with proper structure
        await db.raw(`
            CREATE VIRTUAL TABLE items_fts USING fts5(
                display_names_text
            );
        `);
        
        console.log('Created new FTS table');
        
        // Create triggers that extract text from JSON
        await db.raw(`
            CREATE TRIGGER items_after_insert AFTER INSERT ON items BEGIN
                INSERT INTO items_fts(rowid, display_names_text) 
                VALUES (
                    new.id, 
                    COALESCE(json_extract(new.display_names, '$.menu.de'), '') || ' ' ||
                    COALESCE(json_extract(new.display_names, '$.button.de'), '') || ' ' ||
                    COALESCE(json_extract(new.display_names, '$.receipt.de'), '')
                );
            END;
        `);
        
        await db.raw(`
            CREATE TRIGGER items_after_delete AFTER DELETE ON items BEGIN
                DELETE FROM items_fts WHERE rowid = old.id;
            END;
        `);
        
        await db.raw(`
            CREATE TRIGGER items_after_update AFTER UPDATE ON items BEGIN
                DELETE FROM items_fts WHERE rowid = old.id;
                INSERT INTO items_fts(rowid, display_names_text) 
                VALUES (
                    new.id, 
                    COALESCE(json_extract(new.display_names, '$.menu.de'), '') || ' ' ||
                    COALESCE(json_extract(new.display_names, '$.button.de'), '') || ' ' ||
                    COALESCE(json_extract(new.display_names, '$.receipt.de'), '')
                );
            END;
        `);
        
        console.log('Created triggers');
        
        // Populate FTS table with existing data
        await db.raw(`
            INSERT INTO items_fts(rowid, display_names_text)
            SELECT 
                id,
                COALESCE(json_extract(display_names, '$.menu.de'), '') || ' ' ||
                COALESCE(json_extract(display_names, '$.button.de'), '') || ' ' ||
                COALESCE(json_extract(display_names, '$.receipt.de'), '')
            FROM items;
        `);
        
        console.log('Populated FTS table with existing data');
        
        // Test the results
        const testResult = await db.raw(`
            SELECT items.id, items.display_names 
            FROM items_fts 
            JOIN items ON items.id = items_fts.rowid 
            WHERE items_fts.display_names_text MATCH 'Widget'
        `);
        
        console.log('Test search for "Widget":', testResult);
        
    } catch (error) {
        console.error('Error fixing FTS table:', error);
    } finally {
        await db.destroy();
    }
}

fixFTSTable();