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
const axios = require('axios');
const db = require('../db/knex');
const MenuParserLLM = require('../lib/menu_parser_llm');
const { importFromOopMdf } = require('../services/import.service');
const { enrichMdfData } = require('../services/enrichment.service');
const layoutService = require('../services/layout.service');
const logger = require('../config/logger');
const chalk = require('chalk');

// Standardized progress reporting function
function reportProgress(message, isComplete = false) {
  const prefix = isComplete ? '✅' : '⏳';
  console.log(`PROGRESS: ${prefix} ${message}`);
}

// Step progress tracking
function reportStep(currentStep, totalSteps, description, isComplete = false) {
  const prefix = isComplete ? '✅' : '⏳';
  console.log(`PROGRESS: ${prefix} Step ${currentStep}/${totalSteps}: ${description}`);
}

async function main() {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error(chalk.red('❌ Error: Please provide a path to the menu PDF file.'));
    console.log(chalk.yellow('Usage: npm run setup:restaurant -- <path_to_pdf>'));
    process.exit(1);
  }

  reportProgress(`Starting menu import from: ${path.basename(filePath)}`);
  logger.info(`🚀 Starting full initialization from: ${filePath}`);

  // Progress callback for detailed item tracking
  const progressCallback = (current, total, itemName) => {
    if (itemName) {
      reportProgress(`Processing item ${current}/${total}: ${itemName}`);
    } else {
      reportProgress(`Processing ${current}/${total} items`);
    }
  };

  try {
    // === Step 1: Parse Menu ===
    reportStep(1, 6, 'Parsing menu with AI');
    const parser = new MenuParserLLM();
    const restaurantName = path.basename(filePath, path.extname(filePath)).replace(/menu|karte/i, '').trim();
    const parsedResult = await parser.parseMenu(filePath, { restaurantName });
    const mdfData = parsedResult.configuration;
    reportStep(1, 6, 'Menu parsed successfully', true);

    // === Step 2: Clean Database ===
    reportStep(2, 6, 'Cleaning existing data');
    await db.transaction(async (trx) => {
        await trx('menu_layouts').del();
        await trx('vec_items').del();
        await trx('items').del();
        await trx('categories').del();
        await trx('pos_devices').del();
        await trx('branches').del();
        await trx('companies').del();
    });
    reportStep(2, 6, 'Database cleaned', true);

    // === Step 3: Import Parsed Data ===
    reportStep(3, 6, 'Importing data and generating embeddings');
    await importFromOopMdf(mdfData, progressCallback);
    reportStep(3, 6, 'Import completed', true);
    
    // === Step 4: Save "Original Menu" Layout ===
    reportStep(4, 6, 'Saving original menu layout');
    const originalCategories = await db('categories').select('*');
    const originalLayout = await layoutService.saveLayout('Original Menu Layout', originalCategories, 'ORIGINAL_MENU');
    await layoutService.activateLayout(originalLayout.id);
    reportStep(4, 6, 'Original layout saved and activated', true);

    // === Step 5: Enrich Data for "Smart" Layout ===
    reportStep(5, 6, 'Enriching data for AI optimization');
    const enrichedData = await enrichMdfData(mdfData, progressCallback);
    const enrichedCategories = enrichedData.company_details.branches[0].point_of_sale_devices[0].categories_for_this_pos;
    reportStep(5, 6, 'Data enrichment completed', true);

    // === Step 6: Save "AI Optimized" Layout ===
    reportStep(6, 6, 'Saving AI optimized layout');
    const aiLayout = await layoutService.saveLayout('AI Optimized Layout', enrichedCategories, 'AI_OPTIMIZED');
    reportStep(6, 6, 'AI optimized layout saved', true);
    
    reportProgress('🎉 Menu import completed successfully!', true);
    logger.info(chalk.green('\n🎉🎉🎉 Full initialization complete! The POS is ready.'));
    
    // === Signal UI to refresh ===
    try {
      reportProgress('Refreshing user interface...');
      const port = process.env.BACKEND_PORT || 3030;
      await axios.post(`http://localhost:${port}/api/system/request-ui-refresh`);
      console.log('PROGRESS: ✅ UI refresh signal sent successfully');
      logger.info('✅ UI refresh signal sent to all connected clients');
    } catch (refreshError) {
      console.log('PROGRESS: ⚠️ Failed to send UI refresh signal (clients may need manual refresh)');
      logger.warn('Failed to send UI refresh signal:', refreshError.message);
    }

  } catch (error) {
    logger.error('❌ Full initialization script failed:', { error: error.message, stack: error.stack });
    process.exit(1);
  } finally {
    await db.destroy();
  }
}

main();