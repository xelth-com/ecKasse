// File: 20250909000000_fix_items_unique_constraint.js
// Fix UNIQUE constraint on items.source_unique_identifier to be scoped by pos_device_id

exports.up = function (knex) {
  return knex.schema.alterTable('items', (table) => {
    // Drop the existing unique constraint on source_unique_identifier
    table.dropUnique(['source_unique_identifier']);
    
    // Add a composite unique constraint on pos_device_id + source_unique_identifier
    table.unique(['pos_device_id', 'source_unique_identifier'], 'items_pos_device_source_unique');
  });
};

exports.down = function (knex) {
  return knex.schema.alterTable('items', (table) => {
    // Drop the composite unique constraint
    table.dropUnique(['pos_device_id', 'source_unique_identifier'], 'items_pos_device_source_unique');
    
    // Restore the global unique constraint
    table.unique(['source_unique_identifier']);
  });
};