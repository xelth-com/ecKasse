/**
 * System Controller
 * 
 * Handles system-level API requests including UI refresh notifications
 * and other system management operations.
 * 
 * @author ecKasse Development Team
 */

const websocketService = require('../services/websocket.service');
const logger = require('../config/logger');

const systemController = {
  /**
   * Handle UI refresh requests
   * This endpoint is called when the menu data has been updated
   * and all clients need to refresh their UI
   * 
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  handleUiRefreshRequest: async (req, res) => {
    try {
      logger.info('UI refresh request received');
      
      // Broadcast refresh request to all connected WebSocket clients
      websocketService.requestUiRefresh();
      
      const clientCount = websocketService.getClientCount();
      
      res.json({
        success: true,
        message: 'UI refresh request sent to all clients',
        clientsNotified: clientCount,
        timestamp: new Date().toISOString()
      });
      
      logger.info('UI refresh request processed successfully', {
        clientsNotified: clientCount
      });
      
    } catch (error) {
      logger.error('Failed to process UI refresh request:', error.message);
      
      res.status(500).json({
        success: false,
        message: 'Failed to send UI refresh request',
        error: error.message
      });
    }
  }
};

module.exports = systemController;