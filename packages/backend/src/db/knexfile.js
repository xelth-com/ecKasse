// Database configuration for Knex.js with sqlite-vec extension support
const path = require('path');
const sqliteVec = require('sqlite-vec');
require('dotenv').config({ path: path.resolve(__dirname, '../../../../.env') });

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
    },
    pool: {
      afterCreate: function(connection, done) {
        try {
          sqliteVec.load(connection);
          console.log('sqlite-vec extension loaded for migration');
          done();
        } catch (error) {
          console.error('Failed to load sqlite-vec extension:', error);
          done(error);
        }
      }
    }
  },
  
  production: {
    client: process.env.DB_CLIENT || 'sqlite3',
    connection: process.env.DB_CLIENT === 'pg' ? {
      host: process.env.PG_HOST || 'localhost',
      port: process.env.PG_PORT || 5432,
      user: process.env.PG_USERNAME,
      password: process.env.PG_PASSWORD,
      database: process.env.PG_DATABASE
    } : {
      filename: process.env.DB_FILENAME || path.join(__dirname, 'eckasse_prod.sqlite3')
    },
    useNullAsDefault: process.env.DB_CLIENT !== 'pg',
    migrations: {
      directory: path.join(__dirname, '../../../core/db/migrations')
    },
    seeds: {
      directory: path.join(__dirname, '../../../core/db/seeds')
    },
    pool: process.env.DB_CLIENT === 'pg' ? {
      min: 2,
      max: 10
    } : {
      afterCreate: function(connection, done) {
        try {
          sqliteVec.load(connection);
          console.log('sqlite-vec extension loaded for production');
          done();
        } catch (error) {
          console.error('Failed to load sqlite-vec extension for production:', error);
          done(error);
        }
      }
    }
  },
  
  test: {
    client: 'sqlite3',
    connection: ':memory:',
    useNullAsDefault: true,
    migrations: {
      directory: path.join(__dirname, '../../../core/db/migrations')
    },
    pool: {
      afterCreate: function(connection, done) {
        try {
          sqliteVec.load(connection);
          console.log('sqlite-vec extension loaded for testing');
          done();
        } catch (error) {
          console.error('Failed to load sqlite-vec extension for testing:', error);
          done(error);
        }
      }
    }
  }
};