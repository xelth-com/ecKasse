// Desktop-specific server
// Connects core business logic to SQLite adapter
// Based on original backend/src/app.js but restructured for new architecture

const express = require('express');
const path = require('path');
const cors = require('cors');

// Import core business logic
const { DatabaseFactory } = require('../../adapters/database/DatabaseFactory');
const { services, db, dbInit } = require('../../core');
const logger = require('../../core/config/logger');

class DesktopServer {
  constructor() {
    this.app = express();
    this.adapter = null;
  }

  async initialize() {
    // Create SQLite adapter for desktop deployment
    this.adapter = DatabaseFactory.createAdapter('desktop', {
      // Load SQLite configuration from core/db/knexfile.js
      database: path.join(__dirname, '../../core/db/eckasse_dev.sqlite3')
    });

    try {
      await this.adapter.connect();
      logger.info('Database adapter connected successfully');
    } catch (error) {
      logger.error('Failed to connect database adapter:', error);
      throw error;
    }
    
    this.setupMiddleware();
    this.setupRoutes();
  }

  setupMiddleware() {
    this.app.use(cors());
    this.app.use(express.json());
    this.app.use(express.static(path.join(__dirname, '../frontend/dist')));
  }

  setupRoutes() {
    // Health check endpoint
    this.app.get('/api/health', (req, res) => {
      res.json({ 
        status: 'ok', 
        adapter: 'sqlite',
        services: Object.keys(services),
        timestamp: new Date().toISOString()
      });
    });

    // API routes using core services
    this.app.get('/api/ping', (req, res) => {
      const operationId = req.query.operationId || Date.now().toString();
      logger.info({ operationId, endpoint: '/api/ping' }, 'Ping request received');
      
      res.json({
        operationId,
        status: 'success',
        payload: { 
          message: 'pong from ecKasse desktop server!', 
          timestamp: new Date().toISOString() 
        },
        channel: 'http'
      });
    });

    // Serve frontend for all non-API routes
    this.app.get('*', (req, res) => {
      if (req.originalUrl.startsWith('/api')) {
        return res.status(404).json({ error: 'API endpoint not found' });
      }
      res.sendFile(path.join(__dirname, '../frontend/dist/index.html'));
    });
  }

  async start(port = 3030) {
    await this.initialize();
    return this.app.listen(port, () => {
      console.log(`Desktop server running on port ${port}`);
    });
  }
}

module.exports = { DesktopServer };
