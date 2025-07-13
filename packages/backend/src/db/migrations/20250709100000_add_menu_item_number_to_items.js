// packages/backend/src/db/migrations/20250709100000_add_menu_item_number_to_items.js
exports.up = function(knex) {
  return knex.schema.table('items', function(table) {
    table.string('menu_item_number').nullable().index();
  });
};

exports.down = function(knex) {
  return knex.schema.table('items', function(table) {
    table.dropColumn('menu_item_number');
  });
};