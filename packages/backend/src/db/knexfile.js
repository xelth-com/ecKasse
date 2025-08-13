// Database configuration for Knex.js
const path = require('path');

module.exports = {
  development: {
    client: 'sqlite3',
    connection: {
      filename: process.env.DB_FILENAME || path.join(__dirname, 'eckasse_dev.sqlite3')
    },
    useNullAsDefault: true,
    migrations: {
      directory: path.join(__dirname, '../../../core/db/migrations')
    },
    seeds: {
      directory: path.join(__dirname, '../../../core/db/seeds')
    }
  },
  
  production: {
    client: 'sqlite3',
    connection: {
      filename: process.env.DB_FILENAME || path.join(__dirname, 'eckasse_prod.sqlite3')
    },
    useNullAsDefault: true,
    migrations: {
      directory: path.join(__dirname, '../../../core/db/migrations')
    }
  },
  
  test: {
    client: 'sqlite3',
    connection: ':memory:',
    useNullAsDefault: true,
    migrations: {
      directory: path.join(__dirname, '../../../core/db/migrations')
    }
  }
};