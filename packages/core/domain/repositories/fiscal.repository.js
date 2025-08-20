const BaseRepository = require('./base.repository');

/**
 * Fiscal Repository with database-agnostic JSON handling for fiscal operations
 */
class FiscalRepository extends BaseRepository {
  constructor() {
    super();
  }

  /**
   * Create pending fiscal operation with proper JSON handling
   */
  async createPendingOperation(operationData) {
    const [result] = await this.insertWithJson(
      'pending_fiscal_operations',
      operationData,
      ['payload_for_tse'] // JSON fields that need special handling
    );
    return result;
  }

  /**
   * Update pending operation with TSE response
   */
  async updatePendingOperationWithTseResponse(id, tseResponse) {
    const [result] = await this.updateWithJson(
      'pending_fiscal_operations',
      { id },
      { 
        status: 'TSE_SUCCESS',
        tse_response: tseResponse
      },
      ['tse_response'] // JSON fields that need special handling
    );
    return result;
  }

  /**
   * Get pending operation by ID with parsed JSON
   */
  async getPendingOperationById(id) {
    const [result] = await this.selectWithJson(
      'pending_fiscal_operations',
      { id },
      ['payload_for_tse', 'tse_response'] // JSON fields to parse
    );
    return result;
  }

  /**
   * Create final fiscal log entry
   * Note: fiscal_log table stores JSON as strings for consistent hashing
   */
  async createFiscalLogEntry(logData) {
    // For fiscal log, we always store as JSON strings for consistent hashing
    const processedData = {
      ...logData,
      payload_for_tse: this.formatJsonForLogging(logData.payload_for_tse),
      tse_response: this.formatJsonForLogging(logData.tse_response)
    };

    const [result] = await this.db('fiscal_log').insert(processedData).returning('*');
    return result;
  }

  /**
   * Update pending operation status
   */
  async updatePendingOperationStatus(id, status, error = null) {
    const updateData = { status };
    if (error) {
      updateData.last_error = error;
    }

    const [result] = await this.db('pending_fiscal_operations')
      .where({ id })
      .update(updateData)
      .returning('*');
    
    return result;
  }

  /**
   * Get latest fiscal log entry
   */
  async getLatestFiscalLogEntry() {
    return await this.db('fiscal_log').orderBy('id', 'desc').first();
  }
}

module.exports = FiscalRepository;