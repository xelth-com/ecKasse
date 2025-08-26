/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
  return knex.schema.alterTable('active_transaction_items', function(table) {
    // Drop the existing foreign key constraint
    table.dropForeign('item_id');
    
    // Re-add the foreign key constraint with ON DELETE CASCADE
    table.foreign('item_id')
      .references('id')
      .inTable('items')
      .onDelete('CASCADE');
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
  return knex.schema.alterTable('active_transaction_items', function(table) {
    // Drop the CASCADE foreign key constraint
    table.dropForeign('item_id');
    
    // Re-add the original foreign key constraint without CASCADE
    table.foreign('item_id')
      .references('id')
      .inTable('items');
  });
};