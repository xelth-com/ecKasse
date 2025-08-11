const {
  Client, 
  TopicMessageSubmitTransaction,
  PrivateKey,
  AccountId,
  Hbar
} = require('@hashgraph/sdk');
const logger = require('../config/logger');
const crypto = require('crypto');

/**
 * HieroService handles all interactions with the Hiero Consensus Service (HCS).
 * It implements a sponsored transaction model where:
 * 1. Backend prepares and pays for transactions (sponsor role)
 * 2. Client adds payload and signs the transaction
 * 3. Backend submits the final co-signed transaction to HCS
 */
class HieroService {
  constructor() {
    this.client = null;
    this.operatorId = null;
    this.operatorKey = null;
    this.topicId = null;
    this.isInitialized = false;
  }

  /**
   * Initializes the Hiero client with operator credentials from environment variables.
   * The operator account will sponsor (pay for) all HCS transactions.
   */
  async initialize() {
    try {
      // Load configuration from environment
      this.operatorId = process.env.HIERO_OPERATOR_ID;
      this.operatorKey = process.env.HIERO_OPERATOR_KEY;
      this.topicId = process.env.HIERO_TOPIC_ID;

      if (!this.operatorId || !this.operatorKey || !this.topicId) {
        throw new Error('Missing required Hiero environment variables: HIERO_OPERATOR_ID, HIERO_OPERATOR_KEY, HIERO_TOPIC_ID');
      }

      // Parse the operator key
      const privateKey = PrivateKey.fromString(this.operatorKey);
      const accountId = AccountId.fromString(this.operatorId);

      // Create client for testnet (use Client.forMainnet() for production)
      this.client = Client.forTestnet();
      this.client.setOperator(accountId, privateKey);

      // Set default max transaction fee
      this.client.setDefaultMaxTransactionFee(new Hbar(2));

      this.isInitialized = true;
      logger.info({ 
        msg: 'Hiero service initialized successfully',
        operatorId: this.operatorId,
        topicId: this.topicId 
      });

      return { success: true };
    } catch (error) {
      logger.error({ 
        msg: 'Failed to initialize Hiero service',
        error: error.message 
      });
      return { success: false, error: error.message };
    }
  }

  /**
   * Prepares a sponsored HCS transaction that can be signed by a client.
   * This simulates the remote backend preparing a transaction for the POS client.
   * 
   * @param {string} message - The message to be submitted to HCS (will be set by client)
   * @returns {Promise<{success: boolean, transactionBytes?: string, error?: string}>}
   */
  async prepareTransaction(message = '') {
    try {
      if (!this.isInitialized) {
        const initResult = await this.initialize();
        if (!initResult.success) {
          throw new Error(`Initialization failed: ${initResult.error}`);
        }
      }

      // Create the HCS transaction
      const transaction = new TopicMessageSubmitTransaction()
        .setTopicId(this.topicId)
        .setMessage(message);

      // Sign with operator (sponsor) account
      const signedTransaction = await transaction.sign(PrivateKey.fromString(this.operatorKey));

      // Serialize transaction for client signing
      const transactionBytes = Buffer.from(signedTransaction.toBytes()).toString('base64');

      logger.info({ 
        msg: 'Transaction prepared successfully',
        topicId: this.topicId,
        messageLength: message.length
      });

      return { 
        success: true, 
        transactionBytes,
        transactionId: signedTransaction.transactionId?.toString()
      };
    } catch (error) {
      logger.error({ 
        msg: 'Failed to prepare transaction',
        error: error.message 
      });
      return { success: false, error: error.message };
    }
  }

  /**
   * Simulates client-side signing of a prepared transaction.
   * In the actual implementation, this would happen on the POS client side.
   * 
   * @param {string} transactionBytes - Base64 encoded transaction bytes from prepareTransaction
   * @param {string} clientMessage - The actual message/payload from the client
   * @param {string} clientPrivateKey - Client's private key (simulated)
   * @returns {Promise<{success: boolean, signedTransactionBytes?: string, error?: string}>}
   */
  async simulateClientSigning(transactionBytes, clientMessage, clientPrivateKey = null) {
    try {
      // Generate a temporary client key for simulation if none provided
      if (!clientPrivateKey) {
        clientPrivateKey = PrivateKey.generateED25519().toString();
        logger.info({ msg: 'Generated temporary client key for simulation' });
      }

      // Deserialize the transaction
      const transactionBuffer = Buffer.from(transactionBytes, 'base64');
      const transaction = TopicMessageSubmitTransaction.fromBytes(transactionBuffer);

      // Update the message with client payload
      transaction.setMessage(clientMessage);

      // Sign with client key (this would happen on the client side)
      const clientKey = PrivateKey.fromString(clientPrivateKey);
      const clientSignedTransaction = await transaction.sign(clientKey);

      // Serialize the client-signed transaction
      const signedTransactionBytes = Buffer.from(clientSignedTransaction.toBytes()).toString('base64');

      logger.info({ 
        msg: 'Client signing simulation completed',
        messageLength: clientMessage.length
      });

      return { 
        success: true, 
        signedTransactionBytes,
        clientPrivateKey // Return for reference in simulation
      };
    } catch (error) {
      logger.error({ 
        msg: 'Failed to simulate client signing',
        error: error.message 
      });
      return { success: false, error: error.message };
    }
  }

  /**
   * Submits a co-signed transaction to the Hiero Consensus Service.
   * This represents the final step where the backend submits the transaction
   * that has been signed by both the sponsor (backend) and the client.
   * 
   * @param {string} signedTransactionBytes - Base64 encoded co-signed transaction
   * @returns {Promise<{success: boolean, transactionId?: string, receipt?: object, error?: string}>}
   */
  async submitTransaction(signedTransactionBytes) {
    try {
      if (!this.isInitialized) {
        const initResult = await this.initialize();
        if (!initResult.success) {
          throw new Error(`Initialization failed: ${initResult.error}`);
        }
      }

      // Deserialize the co-signed transaction
      const transactionBuffer = Buffer.from(signedTransactionBytes, 'base64');
      const transaction = TopicMessageSubmitTransaction.fromBytes(transactionBuffer);

      // Submit the transaction to the network
      const response = await transaction.execute(this.client);
      
      // Get the receipt to confirm success
      const receipt = await response.getReceipt(this.client);

      logger.info({ 
        msg: 'Transaction submitted successfully to HCS',
        transactionId: response.transactionId.toString(),
        status: receipt.status.toString(),
        topicId: this.topicId
      });

      return { 
        success: true, 
        transactionId: response.transactionId.toString(),
        receipt: {
          status: receipt.status.toString(),
          topicId: receipt.topicId?.toString(),
          topicSequenceNumber: receipt.topicSequenceNumber?.toString(),
          topicRunningHash: receipt.topicRunningHash ? Buffer.from(receipt.topicRunningHash).toString('hex') : null
        }
      };
    } catch (error) {
      logger.error({ 
        msg: 'Failed to submit transaction to HCS',
        error: error.message 
      });
      return { success: false, error: error.message };
    }
  }

  /**
   * Complete workflow method that combines prepare, client-sign, and submit.
   * This is primarily for testing and demonstrates the full sponsored transaction flow.
   * 
   * @param {string} message - The message to submit to HCS
   * @param {string} clientPrivateKey - Optional client private key (generates one if not provided)
   * @returns {Promise<{success: boolean, result?: object, error?: string}>}
   */
  async submitWithClientSigning(message, clientPrivateKey = null) {
    try {
      // Step 1: Backend prepares sponsored transaction
      const prepareResult = await this.prepareTransaction('');
      if (!prepareResult.success) {
        throw new Error(`Prepare failed: ${prepareResult.error}`);
      }

      // Step 2: Client adds message and signs transaction
      const clientSignResult = await this.simulateClientSigning(
        prepareResult.transactionBytes, 
        message, 
        clientPrivateKey
      );
      if (!clientSignResult.success) {
        throw new Error(`Client signing failed: ${clientSignResult.error}`);
      }

      // Step 3: Backend submits co-signed transaction
      const submitResult = await this.submitTransaction(clientSignResult.signedTransactionBytes);
      if (!submitResult.success) {
        throw new Error(`Submit failed: ${submitResult.error}`);
      }

      logger.info({ 
        msg: 'Complete sponsored transaction workflow successful',
        transactionId: submitResult.transactionId
      });

      return {
        success: true,
        result: {
          transactionId: submitResult.transactionId,
          receipt: submitResult.receipt,
          clientPrivateKey: clientSignResult.clientPrivateKey
        }
      };
    } catch (error) {
      logger.error({ 
        msg: 'Sponsored transaction workflow failed',
        error: error.message 
      });
      return { success: false, error: error.message };
    }
  }

  /**
   * Creates a hash of daily fiscal data for blockchain anchoring.
   * This method calculates a cryptographic hash of all fiscal events within a day.
   * 
   * @param {Array} fiscalLogs - Array of fiscal log entries for the day
   * @returns {string} SHA-256 hash of the daily fiscal data
   */
  createDailyHash(fiscalLogs) {
    try {
      if (!fiscalLogs || fiscalLogs.length === 0) {
        logger.warn({ msg: 'No fiscal logs provided for daily hash calculation' });
        return crypto.createHash('sha256').update('NO_FISCAL_DATA').digest('hex');
      }

      // Sort logs by timestamp to ensure consistent ordering
      const sortedLogs = fiscalLogs.sort((a, b) => new Date(a.timestamp_utc) - new Date(b.timestamp_utc));

      // Create canonical string from all fiscal events
      const canonicalData = sortedLogs.map(log => {
        return `${log.log_id}:${log.timestamp_utc}:${log.event_type}:${log.transaction_number_tse}:${log.current_log_hash}`;
      }).join('|');

      const dailyHash = crypto.createHash('sha256').update(canonicalData).digest('hex');

      logger.info({ 
        msg: 'Daily hash calculated successfully',
        logCount: fiscalLogs.length,
        hashPreview: dailyHash.substring(0, 16) + '...'
      });

      return dailyHash;
    } catch (error) {
      logger.error({ 
        msg: 'Failed to create daily hash',
        error: error.message 
      });
      throw error;
    }
  }

  /**
   * Cleanup method to close the Hiero client connection.
   */
  async close() {
    if (this.client) {
      this.client.close();
      this.isInitialized = false;
      logger.info({ msg: 'Hiero client connection closed' });
    }
  }
}

// Export a singleton instance
module.exports = new HieroService();