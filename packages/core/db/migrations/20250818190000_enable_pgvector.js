/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
  // Skip pgvector extension for now - it needs to be installed separately
  // Only run this migration if we're using PostgreSQL and vector extension is available
  if (knex.client.config.client === 'pg') {
    // Skip for now - vector extension not installed
    return Promise.resolve();
    // return knex.raw('CREATE EXTENSION IF NOT EXISTS vector');
  }
  // For SQLite, no action needed as it already has vec extension
  return Promise.resolve();
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
  // Only run this migration if we're using PostgreSQL
  if (knex.client.config.client === 'pg') {
    return knex.raw('DROP EXTENSION IF EXISTS vector');
  }
  return Promise.resolve();
};