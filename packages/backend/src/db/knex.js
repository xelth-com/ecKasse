// File: /packages/backend/src/db/knex.js

const knex = require('knex');
const config = require('./knexfile.js');

const environment = process.env.NODE_ENV || 'development';
const knexConfig = config[environment];

const db = knex(knexConfig);

module.exports = db;