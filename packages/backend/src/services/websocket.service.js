/**
 * WebSocket Service for Broadcasting Messages
 * 
 * Centralized service for broadcasting WebSocket messages to all connected clients.
 * This service is initialized in server.js with the WebSocket server instance
 * and can be imported by other services to send updates.
 * 
 * @author ecKasse Development Team
 */

const logger = require('../config/logger');

class WebSocketService {
  constructor() {
    this.wss = null;
  }

  /**
   * Initialize the service with a WebSocket server instance
   * @param {WebSocket.Server} wss - The WebSocket server instance
   */
  init(wss) {
    this.wss = wss;
    logger.info('WebSocket service initialized');
  }

  /**
   * Broadcast a message to all connected clients
   * @param {string} command - The command/message type
   * @param {object} payload - The message payload
   * @param {string} operationId - Optional operation ID for tracking
   */
  broadcast(command, payload = {}, operationId = null) {
    if (!this.wss) {
      logger.warn('WebSocket service not initialized, cannot broadcast message');
      return;
    }

    const message = {
      command,
      payload,
      timestamp: new Date().toISOString()
    };

    if (operationId) {
      message.operationId = operationId;
    }

    const messageStr = JSON.stringify(message);
    let clientCount = 0;
    let sentCount = 0;

    this.wss.clients.forEach((client) => {
      clientCount++;
      if (client.readyState === client.OPEN) {
        try {
          client.send(messageStr);
          sentCount++;
        } catch (error) {
          logger.error('Failed to send message to WebSocket client:', error.message);
        }
      }
    });

    logger.info('WebSocket message broadcasted', {
      command,
      totalClients: clientCount,
      successfulSends: sentCount,
      operationId
    });
  }

  /**
   * Send a UI refresh request to all connected clients
   */
  requestUiRefresh() {
    this.broadcast('ui-refresh-request', {
      message: 'Menu data has been updated, please refresh your interface'
    });
  }

  /**
   * Get the number of connected clients
   * @returns {number} Number of connected clients
   */
  getClientCount() {
    if (!this.wss) {
      return 0;
    }
    return this.wss.clients.size;
  }
}

// Export a singleton instance
module.exports = new WebSocketService();