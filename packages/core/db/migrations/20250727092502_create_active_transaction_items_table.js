/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
  return knex.schema.createTable('active_transaction_items', (table) => {
    table.increments('id').primary();
    table.integer('active_transaction_id').unsigned().notNullable().references('id').inTable('active_transactions').onDelete('CASCADE');
    table.integer('item_id').unsigned().notNullable().references('id').inTable('items');
    table.decimal('quantity', 10, 3).notNullable();
    table.decimal('unit_price', 10, 2).notNullable();
    table.decimal('total_price', 12, 2).notNullable();
    table.decimal('tax_rate', 5, 2).notNullable();
    table.decimal('tax_amount', 12, 2).notNullable();
    table.text('notes').nullable();
    table.timestamps(true, true);

    table.index('active_transaction_id');
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
  return knex.schema.dropTableIfExists('active_transaction_items');
};
