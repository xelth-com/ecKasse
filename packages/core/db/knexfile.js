const path = require('path');
const sqliteVec = require('sqlite-vec');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });

// Определяем корневую директорию проекта (3 уровня вверх от packages/core/db)
const PROJECT_ROOT = path.resolve(__dirname, '../../../');


module.exports = {
  development: process.env.DB_CLIENT === 'pg' ? {
    client: 'pg',
    connection: {
      host: process.env.PG_HOST || 'localhost',
      port: parseInt(process.env.PG_PORT) || 5432,
      user: process.env.PG_USERNAME,
      password: String(process.env.PG_PASSWORD),
      database: process.env.PG_DATABASE
    },
    migrations: {
      directory: path.resolve(__dirname, 'migrations')
    },
    seeds: {
      directory: path.resolve(__dirname, 'seeds')
    },
    pool: {
      min: 2,
      max: 10,
      acquireTimeoutMillis: 5000,
      createTimeoutMillis: 3000,
      destroyTimeoutMillis: 5000,
      idleTimeoutMillis: 30000,
      reapIntervalMillis: 1000
    }
  } : {
    client: 'sqlite3',
    connection: {
      filename: process.env.DB_FILENAME ? 
        path.resolve(PROJECT_ROOT, process.env.DB_FILENAME) : 
        path.resolve(__dirname, 'eckasse_dev.sqlite3')
    },
    pool: {
      afterCreate: (conn, cb) => {
        // Load sqlite-vec extension
        try {
          sqliteVec.load(conn);
        } catch (error) {
          console.error('Failed to load sqlite-vec extension:', error);
        }
        cb();
      }
    },
    migrations: {
      directory: path.resolve(__dirname, 'migrations')
    },
    seeds: {
      directory: path.resolve(__dirname, 'seeds')
    },
    useNullAsDefault: true
  },
  production: {
    client: 'pg',
    connection: {
      host: process.env.PG_HOST || 'localhost',
      port: parseInt(process.env.PG_PORT) || 5432,
      user: process.env.PG_USERNAME,
      password: String(process.env.PG_PASSWORD),
      database: process.env.PG_DATABASE
    },
    migrations: {
      directory: path.resolve(__dirname, 'migrations')
    },
    seeds: {
      directory: path.resolve(__dirname, 'seeds')
    },
    pool: {
      min: 2,
      max: 10,
      acquireTimeoutMillis: 5000,
      createTimeoutMillis: 3000,
      destroyTimeoutMillis: 5000,
      idleTimeoutMillis: 30000,
      reapIntervalMillis: 1000
    }
  }
};