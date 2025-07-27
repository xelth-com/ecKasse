/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
  return knex.schema.alterTable('operational_log', (table) => {
    table.string('current_log_hash').notNullable().unique().index();
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
  return knex.schema.alterTable('operational_log', (table) => {
    table.dropColumn('current_log_hash');
  });
};
