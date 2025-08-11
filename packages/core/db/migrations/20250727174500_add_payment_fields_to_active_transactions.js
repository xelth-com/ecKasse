/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
  return knex.schema.table('active_transactions', (table) => {
    table.string('payment_type').nullable(); // e.g., 'Bar', 'Karte', 'Zwischenrechnung'
    table.decimal('payment_amount', 12, 2).nullable(); // Amount paid
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
  return knex.schema.table('active_transactions', (table) => {
    table.dropColumn('payment_type');
    table.dropColumn('payment_amount');
  });
};