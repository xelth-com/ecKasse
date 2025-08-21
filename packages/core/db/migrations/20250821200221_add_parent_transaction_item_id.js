/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
  return knex.schema.table('active_transaction_items', function(table) {
    table.integer('parent_transaction_item_id').nullable().references('id').inTable('active_transaction_items');
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
  return knex.schema.table('active_transaction_items', function(table) {
    table.dropColumn('parent_transaction_item_id');
  });
};
