// File: /packages/backend/src/db/migrations/20250706160000_create_vec_items_table.js

exports.up = function(knex) {
  return knex.schema.raw(`
    -- Create virtual table for vector search using sqlite-vec
    -- Each row stores a vector embedding for item names
    CREATE VIRTUAL TABLE IF NOT EXISTS vec_items USING vec0(
      item_embedding FLOAT[768]
    );
  `);
};

exports.down = function(knex) {
  return knex.schema.dropTableIfExists('vec_items');
};