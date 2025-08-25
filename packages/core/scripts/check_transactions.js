require('dotenv').config({ path: require('path').resolve(__dirname, '../../../.env') });
const db = require('../db/knex');
const logger = require('../config/logger');

async function checkRecentTransactions() {
  logger.info('Starting transaction check...');
  try {
    const transactions = await db('active_transactions')
      .select('id', 'uuid', 'status', 'total_amount', 'payment_type', 'created_at', 'updated_at')
      .orderBy('id', 'desc')
      .limit(5);

    if (transactions.length === 0) {
      console.log('\n🟡 No transactions found in the database.\n');
      return;
    }

    console.log('\n--- Last 5 Transactions ---');
    transactions.forEach(tx => {
      console.log(`
  ID:         ${tx.id}
  UUID:       ${tx.uuid}
  Status:     ${tx.status === 'finished' ? '✅ Finished' : `⚠️  ${tx.status}`}
  Total:      €${tx.total_amount}
  Payment:    ${tx.payment_type || 'N/A'}
  Created:    ${new Date(tx.created_at).toLocaleString('de-DE')}
  Updated:    ${new Date(tx.updated_at).toLocaleString('de-DE')}`);
    });
    console.log('\n--- End of Report ---\n');

  } catch (error) {
    logger.error('Error checking transactions:', error);
    console.error('\n❌ Failed to check transactions:', error.message);
  } finally {
    await db.destroy();
    logger.info('Database connection closed.');
  }
}

checkRecentTransactions();