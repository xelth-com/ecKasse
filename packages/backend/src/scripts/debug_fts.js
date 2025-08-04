#!/usr/bin/env node

/**
 * Diagnostic script for troubleshooting Full-Text Search (FTS) issues.
 */

require('dotenv').config({ path: '../../.env' });
const db = require('../db/knex');
const chalk = require('chalk');

async function debugFTS() {
    console.log(chalk.blue('--- FTS Diagnostic Script ---'));

    try {
        console.log(chalk.yellow('\n🔍 Step 1: Checking Table Counts...'));
        const itemsCount = await db('items').count('* as count').first();
        const ftsCount = await db('items_fts').count('* as count').first();

        console.log(`   Items in 'items' table: ${chalk.bold(itemsCount.count)}`);
        console.log(`   Items in 'items_fts' index: ${chalk.bold(ftsCount.count)}`);

        if (itemsCount.count === ftsCount.count && itemsCount.count > 0) {
            console.log(chalk.green('   ✅ Counts match. The FTS trigger is likely working.'));
        } else {
            console.log(chalk.red('   ❌ Counts do NOT match or are zero. The FTS index is not synchronized!'));
        }

        console.log(chalk.yellow('\n🔍 Step 2: Running Raw FTS MATCH Queries...'));

        const queries = ['Eco Mug', 'eco mug', 'Super Widget', 'widget'];
        for (const query of queries) {
            try {
                const result = await db.raw(`
                    SELECT items.id, items.display_names 
                    FROM items_fts 
                    JOIN items ON items.id = items_fts.rowid 
                    WHERE items_fts MATCH ?
                `, [query]);
                
                console.log(`   Query for "${chalk.cyan(query)}": ${result.length > 0 ? chalk.green(`${result.length} result(s) found.`) : chalk.red('0 results.')}`);
                if (result.length > 0) {
                    console.log(`      -> Found ID: ${result[0].id}, Name: ${result[0].display_names}`);
                }
            } catch (e) {
                console.log(`   Query for "${chalk.cyan(query)}": ${chalk.red('ERROR')} -> ${e.message}`);
            }
        }
        
        console.log(chalk.yellow('\n🔍 Step 3: Inspecting FTS Index Content...'));
        
        const ftsSample = await db('items_fts').select('rowid', 'display_names_text').limit(3);

        if (ftsSample.length > 0) {
            console.log('   Sample rows from `items_fts`:');
            ftsSample.forEach(row => {
                console.log(`      RowID: ${chalk.bold(row.rowid)}, Content: ${chalk.gray(row.display_names_text)}`);
            });
        } else {
            console.log(chalk.red('   The `items_fts` table appears to be empty.'));
        }
        
        console.log(chalk.blue('\n--- Diagnostic Complete ---'));

    } catch (error) {
        console.error(chalk.red('\n💥 An error occurred during the diagnostic test:'), error);
        process.exit(1);
    } finally {
        await db.destroy();
    }
}

debugFTS();