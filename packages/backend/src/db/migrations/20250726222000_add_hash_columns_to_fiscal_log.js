/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
  return knex.schema.alterTable('fiscal_log', (table) => {
    table.string('previous_log_hash').notNullable().index().defaultTo('0000000000000000000000000000000000000000000000000000000000000000');
    table.string('current_log_hash').notNullable().unique().index();
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
  return knex.schema.alterTable('fiscal_log', (table) => {
    table.dropColumn('previous_log_hash');
    table.dropColumn('current_log_hash');
  });
};