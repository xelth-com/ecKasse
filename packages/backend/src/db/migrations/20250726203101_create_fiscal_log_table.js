/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
  return knex.schema.createTable('fiscal_log', (table) => {
    table.increments('id').primary();
    table.uuid('log_id').unique().notNullable().index();
    table.timestamp('timestamp_utc', { useTz: true }).notNullable().index();
    table.string('event_type').notNullable().index();
    table.bigInteger('transaction_number_tse').unsigned().notNullable().index();
    table.integer('user_id').unsigned().references('id').inTable('users').onDelete('SET NULL');
    table.jsonb('payload_for_tse').notNullable();
    table.jsonb('tse_response').notNullable();
    table.string('previous_log_hash').notNullable().index();
    table.string('current_log_hash').notNullable().unique().index();
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
  return knex.schema.dropTableIfExists('fiscal_log');
};
