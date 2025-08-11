/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
  return knex.schema.createTable('operational_log', (table) => {
    table.increments('id').primary();
    table.uuid('log_id').unique().notNullable();
    table.timestamp('timestamp_utc', { useTz: true }).notNullable().index();
    table.string('event_type').notNullable().index();
    table.integer('user_id').unsigned().references('id').inTable('users').onDelete('SET NULL');
    table.jsonb('details');
    table.string('previous_log_hash').notNullable().index();
    table.string('current_log_hash').notNullable().unique().index();
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
  return knex.schema.dropTableIfExists('operational_log');
};
