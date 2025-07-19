// File: /packages/backend/src/db/knex.js

const knex = require('knex');
const config = require('./knexfile.js');
const sqliteVec = require('sqlite-vec');

const environment = process.env.NODE_ENV || 'development';
const knexConfig = config[environment];

const db = knex(knexConfig);

// Hook into connection pool to load sqlite-vec extension
const originalAcquireConnection = db.client.acquireConnection;
db.client.acquireConnection = function() {
  return originalAcquireConnection.call(this).then(connection => {
    if (connection && !connection._vecLoaded) {
      try {
        sqliteVec.load(connection);
        connection._vecLoaded = true;
        console.log('sqlite-vec extension loaded on connection');
      } catch (error) {
        console.error('Failed to load sqlite-vec extension on connection:', error);
      }
    }
    return connection;
  });
};

module.exports = db;