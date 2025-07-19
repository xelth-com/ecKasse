const db = require('../db/knex');
const logger = require('../config/logger');

/**
 * Saves the current state of categories as a new layout version.
 * @param {string} name - The name for the new layout (e.g., "Summer Menu").
 * @param {Array} categories - The array of category objects to save.
 * @param {string} sourceType - The source of the layout ('AI_OPTIMIZED', 'ORIGINAL_MENU', etc.).
 */
async function saveLayout(name, categories, sourceType = 'USER_CREATED') {
  logger.info({ name, sourceType }, 'Saving new menu layout...');
  const layoutData = JSON.stringify(categories);
  const [newLayout] = await db('menu_layouts').insert({
    name,
    layout_data: layoutData,
    source_type: sourceType,
    is_active: false // New layouts are not active by default
  }).returning('*');
  return newLayout;
}

/**
 * Lists all available layout versions.
 */
async function listLayouts() {
  return await db('menu_layouts').select('id', 'name', 'created_at', 'is_active', 'source_type').orderBy('created_at', 'desc');
}

/**
 * Activates a specific layout version.
 * @param {number} layoutId - The ID of the layout to activate.
 */
async function activateLayout(layoutId) {
  return db.transaction(async (trx) => {
    // Deactivate all other layouts
    await trx('menu_layouts').update({ is_active: false });
    // Activate the selected one
    await trx('menu_layouts').where({ id: layoutId }).update({ is_active: true });
  });
}

/**
 * Gets the currently active layout.
 */
async function getActiveLayout() {
    const activeLayout = await db('menu_layouts').where({ is_active: true }).first();
    if (!activeLayout) {
        // Fallback to the most recent layout if none are active
        return db('menu_layouts').orderBy('created_at', 'desc').first();
    }
    return activeLayout;
}

module.exports = { saveLayout, listLayouts, activateLayout, getActiveLayout };