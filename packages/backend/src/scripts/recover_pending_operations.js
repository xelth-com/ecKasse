const db = require('../db/knex');
const loggingService = require('../services/logging.service');
const logger = require('../config/logger');

/**
 * Scans the write-ahead log for pending fiscal operations and ensures they are committed.
 * This script is designed to be run on application startup to recover from unexpected shutdowns.
 */
async function recoverPendingFiscalOperations() {
  logger.info('Starting recovery process for pending fiscal operations...');

  try {
    // Find operations that were successfully signed by TSE but not yet committed to the final fiscal log.
    const operationsToCommit = await db('pending_fiscal_operations')
      .where('status', 'TSE_SUCCESS')
      .select('*');

    if (operationsToCommit.length > 0) {
      logger.warn({ count: operationsToCommit.length }, `Found ${operationsToCommit.length} pending fiscal operations to recover.`);
      for (const operation of operationsToCommit) {
        try {
          // The event_type and user_id are not stored in the pending log, which is a design limitation we accept for now.
          // For recovery, we'll use generic values.
          const recovered_event_type = 'recovered_transaction';
          const recovered_user_id = null; // We cannot know the user from the pending log alone.

          await loggingService.commitFiscalOperation(operation.id, recovered_event_type, recovered_user_id);
          logger.info({ operation_id: operation.operation_id }, `Successfully recovered and committed operation.`);
        } catch (commitError) {
          logger.error({ 
            msg: 'CRITICAL: Failed to commit a recovered fiscal operation.',
            operation_id: operation.operation_id,
            error: commitError.message
          });
        }
      }
    } else {
      logger.info('No pending fiscal operations found. System is clean.');
    }

    // Additionally, log operations that failed or are stuck in pending for manual review.
    const failedOperations = await db('pending_fiscal_operations')
      .whereIn('status', ['PENDING', 'TSE_FAILED']);
    
    if (failedOperations.length > 0) {
        logger.warn({ count: failedOperations.length }, `Found ${failedOperations.length} failed or stuck operations requiring review.`);
    }

  } catch (error) {
    logger.error({ msg: 'Recovery process failed.', error: error.message, stack: error.stack });
    // We allow the server to continue starting, but the issue is logged as critical.
  }
}

// Allow direct execution for testing purposes
if (require.main === module) {
  recoverPendingFiscalOperations().finally(() => db.destroy());
}

module.exports = { recoverPendingFiscalOperations };