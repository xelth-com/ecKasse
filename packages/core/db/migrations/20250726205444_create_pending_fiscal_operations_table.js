/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
  return knex.schema.createTable('pending_fiscal_operations', (table) => {
    table.increments('id').primary();
    table.uuid('operation_id').unique().notNullable().index();
    table.string('status').notNullable().index(); // PENDING, TSE_SUCCESS, TSE_FAILED, COMMITTED
    table.jsonb('payload_for_tse').notNullable();
    table.jsonb('tse_response').nullable();
    table.text('last_error').nullable();
    table.integer('retry_count').defaultTo(0);
    table.timestamps(true, true);
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
  return knex.schema.dropTableIfExists('pending_fiscal_operations');
};
