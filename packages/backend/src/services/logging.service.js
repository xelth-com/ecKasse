const db = require('../db/knex');
const logger = require('../config/logger');
const crypto = require('crypto');

/**
 * LoggingService provides a centralized interface for all logging activities:
 * 1. Fiscal Log (TSE-signed, internal hash chain)
 * 2. Operational Log (user/system actions, internal hash chain)
 * 3. System Log (debugging, performance)
 */
class LoggingService {

  /**
   * Logs a fiscal event, ensuring atomicity and dual integrity (TSE + internal hash chain).
   * @param {string} event_type The type of event (e.g., 'finishTransaction').
   * @param {number} user_id The ID of the user performing the action.
   * @param {object} payload_for_tse The data to be sent to the TSE.
   * @returns {Promise<{success: boolean, log?: object, error?: string}>}
   */
  async logFiscalEvent(event_type, user_id, payload_for_tse) {
    const operation_id = crypto.randomUUID();
    let pendingOperationId;

    try {
      // Step 1: Create 'PENDING' record in the write-ahead log.
      const [pendingOp] = await db('pending_fiscal_operations').insert({
        operation_id,
        status: 'PENDING',
        payload_for_tse: JSON.stringify(payload_for_tse)
      }).returning('id');
      pendingOperationId = pendingOp.id || pendingOp;

      // Step 2: Simulate the call to the external TSE API.
      const tse_response = await this.simulateTseSign(payload_for_tse);
      if (!tse_response.success) {
        throw new Error(tse_response.error);
      }

      // Step 3: Update the pending record to 'TSE_SUCCESS'.
      await db('pending_fiscal_operations')
        .where('id', pendingOperationId)
        .update({
          status: 'TSE_SUCCESS',
          tse_response: JSON.stringify(tse_response.data)
        });

      // Step 4-8: Commit the successful operation to the final fiscal log.
      return await this.commitFiscalOperation(pendingOperationId, event_type, user_id);

    } catch (error) {
      logger.error({
        msg: 'Fiscal event logging failed.',
        operation_id,
        error: error.message,
      });

      if (pendingOperationId) {
        await db('pending_fiscal_operations')
          .where('id', pendingOperationId)
          .update({
            status: 'TSE_FAILED',
            last_error: error.message
          });
      }
      return { success: false, error: error.message };
    }
  }

  /**
   * Commits a TSE-successful operation from the pending log to the final fiscal_log.
   * This function is idempotent and can be called by the recovery process.
   * @param {number} pendingOpId The ID of the record in the pending_fiscal_operations table.
   * @param {string} event_type The type of event being logged.
   * @param {number} user_id The ID of the user performing the action.
   */
  async commitFiscalOperation(pendingOpId, event_type, user_id) {
    return await db.transaction(async (trx) => {
      const operation = await trx('pending_fiscal_operations').where('id', pendingOpId).first();

      if (!operation) throw new Error(`Pending operation with ID ${pendingOpId} not found.`);
      if (operation.status === 'COMMITTED') {
        logger.warn({ msg: 'Attempted to re-commit an already committed fiscal operation.', operation_id: operation.operation_id });
        return { success: true, message: 'Operation already committed.' };
      }
      if (operation.status !== 'TSE_SUCCESS') throw new Error(`Cannot commit operation with status '${operation.status}'.`);

      const lastLog = await trx('fiscal_log').orderBy('id', 'desc').first();
      const previous_log_hash = lastLog ? lastLog.current_log_hash : '0'.repeat(64);

      const tseResponseData = JSON.parse(operation.tse_response);
      const newLogEntry = {
        log_id: operation.operation_id,
        timestamp_utc: new Date().toISOString(),
        event_type,
        user_id,
        transaction_number_tse: tseResponseData.transaction_number,
        payload_for_tse: operation.payload_for_tse,
        tse_response: operation.tse_response,
        previous_log_hash
      };
      
      const canonicalString = `${newLogEntry.log_id}${newLogEntry.timestamp_utc}${newLogEntry.event_type}${newLogEntry.transaction_number_tse}${newLogEntry.payload_for_tse}${newLogEntry.previous_log_hash}`;
      const current_log_hash = crypto.createHash('sha256').update(canonicalString).digest('hex');

      const [insertedLog] = await trx('fiscal_log').insert({ ...newLogEntry, current_log_hash }).returning('*');

      await trx('pending_fiscal_operations').where('id', pendingOpId).update({ status: 'COMMITTED' });

      logger.info({ msg: 'Fiscal event committed successfully.', log_id: insertedLog.log_id });
      return { success: true, log: insertedLog };
    });
  }

  /**
   * Logs an operational event with an internal hash chain for integrity.
   */
  async logOperationalEvent(event_type, user_id, details = {}) {
    try {
      return await db.transaction(async (trx) => {
        const lastLog = await trx('operational_log').orderBy('id', 'desc').first();
        const previous_log_hash = lastLog ? lastLog.current_log_hash : '0'.repeat(64);

        const newLogEntry = {
          log_id: crypto.randomUUID(),
          timestamp_utc: new Date().toISOString(),
          event_type,
          user_id,
          details: JSON.stringify(details),
          previous_log_hash
        };

        const canonicalString = `${newLogEntry.log_id}${newLogEntry.timestamp_utc}${newLogEntry.event_type}${newLogEntry.user_id}${newLogEntry.details}${newLogEntry.previous_log_hash}`;
        const current_log_hash = crypto.createHash('sha256').update(canonicalString).digest('hex');

        const [insertedLog] = await trx('operational_log').insert({ ...newLogEntry, current_log_hash }).returning('*');

        logger.info({ msg: 'Operational event logged successfully', event_type, log_id: insertedLog.log_id });
        return { success: true, log: insertedLog };
      });
    } catch (error) {
      logger.error({ msg: 'CRITICAL: Failed to write to operational_log table.', db_error: error.message, original_log: { event_type, user_id, details } });
      return { success: false, error: error.message };
    }
  }

  /**
   * Logs a system/debug event.
   */
  async logSystemEvent(level, message, context = {}) {
    try {
      await db('system_log').insert({
        timestamp: new Date(),
        level: level,
        message: message,
        context: JSON.stringify(context)
      });
      return { success: true };
    } catch (error) {
      logger.error({ msg: 'CRITICAL: Failed to write to system_log table.', db_error: error.message, original_log: { level, message, context } });
      return { success: false, error: error.message };
    }
  }

  /**
   * Simulates a call to a TSE provider.
   * @returns {Promise<object>} A simulated successful TSE response.
   */
  async simulateTseSign(payload) {
    await new Promise(resolve => setTimeout(resolve, 20)); // Simulate network latency
    return {
      success: true,
      data: {
        transaction_number: Math.floor(Date.now() / 1000) - 1700000000 + Math.floor(Math.random() * 100),
        signature_counter: Math.floor(Math.random() * 100000),
        log_time: new Date().toISOString(),
        signature: crypto.createHash('sha256').update(JSON.stringify(payload)).digest('base64'),
        tse_serial_number: 'mock-tse-serial-12345'
      }
    };
  }
}

// Export a singleton instance of the service
module.exports = new LoggingService();