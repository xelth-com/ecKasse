// File: 20250909000001_fix_categories_unique_constraint.js
// Fix UNIQUE constraint on categories.source_unique_identifier to be scoped by pos_device_id

exports.up = function (knex) {
  return knex.schema.alterTable('categories', (table) => {
    // Drop the existing unique constraint on source_unique_identifier
    table.dropUnique(['source_unique_identifier']);
    
    // Add a composite unique constraint on pos_device_id + source_unique_identifier
    table.unique(['pos_device_id', 'source_unique_identifier'], 'categories_pos_device_source_unique');
  });
};

exports.down = function (knex) {
  return knex.schema.alterTable('categories', (table) => {
    // Drop the composite unique constraint
    table.dropUnique(['pos_device_id', 'source_unique_identifier'], 'categories_pos_device_source_unique');
    
    // Restore the global unique constraint
    table.unique(['source_unique_identifier']);
  });
};