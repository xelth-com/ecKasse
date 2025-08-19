const path = require('path');
// const sqliteVec = require('sqlite-vec'); // Temporarily disabled
require('dotenv').config({ path: path.resolve(__dirname, '../../../../.env') });

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
      max: 10
    }
  } : {
    client: 'sqlite3',
    connection: {
      filename: process.env.DB_FILENAME || path.resolve(__dirname, 'eckasse_dev.sqlite3')
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
      max: 10
    }
  }
};