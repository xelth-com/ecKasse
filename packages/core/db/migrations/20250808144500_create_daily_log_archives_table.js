/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
  return knex.schema.createTable('daily_log_archives', (table) => {
    table.increments('id').primary();
    table.date('business_date').notNullable().unique().index();
    table.text('original_data_hash').notNullable();
    table.integer('data_shards_count').notNullable();
    table.integer('parity_shards_count').notNullable();
    table.text('shards_json').notNullable(); // Compressed JSON of shards
    table.jsonb('log_ids_json').notNullable(); // Array of fiscal_log IDs included
    table.timestamps(true, true);
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
  return knex.schema.dropTableIfExists('daily_log_archives');
};