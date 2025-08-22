// File: /packages/core/db/knex.js

const knex = require('knex');
const config = require('./knexfile.js');

const environment = process.env.NODE_ENV || 'development';
const knexConfig = config[environment];


const db = knex(knexConfig);

// PostgreSQL is used for both development and production
// Vector search functionality is handled by PostgreSQL extensions (pgvector)

module.exports = db;