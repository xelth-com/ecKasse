/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
  // Only create table if we're using PostgreSQL
  if (knex.client.config.client === 'pg') {
    return knex.schema.createTable('item_embeddings', function (table) {
      table.integer('item_id').primary().references('id').inTable('items').onDelete('CASCADE');
      table.specificType('item_embedding', 'vector(768)'); // pgvector type for 768-dimensional embeddings
      table.timestamps(true, true);
      
      // Create index for vector similarity search
      table.index(['item_embedding'], 'item_embeddings_vector_idx', {
        indexType: 'ivfflat',
        storageParameters: {
          lists: 100
        }
      });
    });
  }
  // For SQLite, no action needed as vec_items virtual table is already created
  return Promise.resolve();
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
  if (knex.client.config.client === 'pg') {
    return knex.schema.dropTableIfExists('item_embeddings');
  }
  return Promise.resolve();
};