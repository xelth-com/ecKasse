const db = require('./packages/core/db/knex.js');
const logger = require('./packages/core/config/logger.js');

async function clearTransactions() {
  logger.info('Starting script to forcibly clear transactions...');
  try {
    // Use Knex to delete all records from the table
    const deletedRows = await db('active_transactions').del();
    logger.info(`Successfully deleted ${deletedRows} stale transactions.`);

    // Optimize the database file after deletion (for SQLite)
    if (db.client.config.client === 'sqlite3') {
      await db.raw('VACUUM;');
      logger.info('Database successfully cleaned and optimized.');
    }
    
    console.log(`\n✅ All ${deletedRows} active transactions have been successfully deleted.`);

  } catch (error) {
    logger.error('An error occurred while clearing transactions:', error);
    console.error('\n❌ Failed to clear transactions. Error:', error.message);
  } finally {
    // Important: close the database connection
    await db.destroy();
    logger.info('Database connection closed.');
  }
}

// Run the function
clearTransactions();