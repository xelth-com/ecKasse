exports.up = function(knex) {
  return knex.schema.createTable('dsfinvk_vat_mapping', (table) => {
    table.increments('id').primary();
    table.decimal('internal_tax_rate', 5, 2).notNullable().unique();
    table.integer('dsfinvk_ust_schluessel').notNullable().index();
    table.string('description').notNullable();
  });
};

exports.down = function(knex) {
  return knex.schema.dropTableIfExists('dsfinvk_vat_mapping');
};