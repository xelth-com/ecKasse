/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
  return knex.schema.createTable('active_transactions', (table) => {
    table.increments('id').primary();
    table.uuid('uuid').unique().notNullable().index();
    table.string('status').notNullable().defaultTo('active').index(); // e.g., active, finished, cancelled
    table.integer('user_id').unsigned().references('id').inTable('users').onDelete('SET NULL');
    table.decimal('total_amount', 12, 2).notNullable().defaultTo(0.00);
    table.decimal('tax_amount', 12, 2).notNullable().defaultTo(0.00);
    table.date('business_date').notNullable().index();
    table.jsonb('metadata'); // For table number, customer info, etc.
    table.timestamps(true, true);
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
  return knex.schema.dropTableIfExists('active_transactions');
};
