#!/usr/bin/env node

/**
 * Universal script to parse a menu PDF and fully initialize the database.
 * 1. Parses the PDF to get structured data.
 * 2. Cleans the database.
 * 3. Imports the parsed data.
 * 4. Saves the "Original Menu" layout version.
 * 5. Enriches the data to create an "AI Optimized" layout version.
 * 6. Saves the "AI Optimized" layout version.
 * 
 * Usage: node packages/backend/src/scripts/parse_and_init.js <path_to_pdf>
 */

require('dotenv').config({ path: '../../../.env' });
const fs = require('fs').promises;
const path = require('path');
const db = require('../db/knex');
const MenuParserLLM = require('../lib/menu_parser_llm');
const { importFromOopMdf } = require('../services/import.service');
const { enrichMdfData } = require('../services/enrichment.service');
const layoutService = require('../services/layout.service');
const logger = require('../config/logger');
const chalk = require('chalk');

async function main() {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error(chalk.red('❌ Error: Please provide a path to the menu PDF file.'));
    console.log(chalk.yellow('Usage: npm run setup:restaurant -- <path_to_pdf>'));
    process.exit(1);
  }

  logger.info(`🚀 Starting full initialization from: ${filePath}`);

  try {
    // === Step 1: Parse Menu ===
    logger.info('Step 1: Parsing menu PDF with LLM...');
    const parser = new MenuParserLLM();
    const restaurantName = path.basename(filePath, path.extname(filePath)).replace(/menu|karte/i, '').trim();
    const parsedResult = await parser.parseMenu(filePath, { restaurantName });
    const mdfData = parsedResult.configuration;
    logger.info('✅ Menu parsed successfully.');

    // === Step 2: Clean Database ===
    logger.info('Step 2: Cleaning all existing data...');
    await db.transaction(async (trx) => {
        await trx('menu_layouts').del();
        await trx('vec_items').del();
        await trx('items').del();
        await trx('categories').del();
        await trx('pos_devices').del();
        await trx('branches').del();
        await trx('companies').del();
    });
    logger.info('✅ Database cleaned.');

    // === Step 3: Import Parsed Data ===
    logger.info('Step 3: Importing data and generating initial embeddings...');
    await importFromOopMdf(mdfData);
    logger.info('✅ Data imported successfully.');
    
    // === Step 4: Save "Original Menu" Layout ===
    logger.info('Step 4: Saving "Original Menu Layout" snapshot...');
    const originalCategories = await db('categories').select('*');
    const originalLayout = await layoutService.saveLayout('Original Menu Layout', originalCategories, 'ORIGINAL_MENU');
    await layoutService.activateLayout(originalLayout.id); // Activate the original layout by default
    logger.info(`✅ "Original Menu Layout" saved with ID: ${originalLayout.id} and activated.`);

    // === Step 5: Enrich Data for "Smart" Layout ===
    logger.info('Step 5: Enriching data for "AI Optimized Layout"...');
    const enrichedData = await enrichMdfData(mdfData);
    const enrichedCategories = enrichedData.company_details.branches[0].point_of_sale_devices[0].categories_for_this_pos;
    logger.info('✅ Enrichment complete.');

    // === Step 6: Save "AI Optimized" Layout ===
    logger.info('Step 6: Saving "AI Optimized Layout" snapshot...');
    const aiLayout = await layoutService.saveLayout('AI Optimized Layout', enrichedCategories, 'AI_OPTIMIZED');
    logger.info(`✅ "AI Optimized Layout" saved with ID: ${aiLayout.id}.`);
    
    logger.info(chalk.green('\n🎉🎉🎉 Full initialization complete! The POS is ready.'));

  } catch (error) {
    logger.error('❌ Full initialization script failed:', { error: error.message, stack: error.stack });
    process.exit(1);
  } finally {
    await db.destroy();
  }
}

main();