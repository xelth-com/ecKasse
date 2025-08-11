/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
  return knex.schema.createTable('system_log', (table) => {
    table.increments('id').primary();
    table.timestamp('timestamp', { useTz: true }).defaultTo(knex.fn.now()).index();
    table.string('level').notNullable().index();
    table.text('message').notNullable();
    table.jsonb('context');
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
  return knex.schema.dropTableIfExists('system_log');
};
