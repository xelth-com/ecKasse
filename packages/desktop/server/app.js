// Desktop-specific server
// Connects core business logic to SQLite adapter
// Based on original backend/src/app.js but restructured for new architecture

const express = require('express');
const path = require('path');
const cors = require('cors');

// Import core business logic
const { DatabaseFactory } = require('../adapters/database/DatabaseFactory');

class DesktopServer {
  constructor() {
    this.app = express();
    this.adapter = null;
  }

  async initialize() {
    // Create SQLite adapter for desktop deployment
    this.adapter = DatabaseFactory.createAdapter('desktop', {
      // TODO: Load SQLite configuration from core/db/knexfile.js
      database: path.join(__dirname, '../core/db/eckasse_dev.sqlite3')
    });

    await this.adapter.connect();
    this.setupMiddleware();
    this.setupRoutes();
  }

  setupMiddleware() {
    this.app.use(cors());
    this.app.use(express.json());
    this.app.use(express.static(path.join(__dirname, '../frontend/dist')));
  }

  setupRoutes() {
    // API routes (to be implemented)
    this.app.get('/api/health', (req, res) => {
      res.json({ status: 'ok', adapter: 'sqlite' });
    });

    // Serve frontend for all non-API routes
    this.app.get('*', (req, res) => {
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
