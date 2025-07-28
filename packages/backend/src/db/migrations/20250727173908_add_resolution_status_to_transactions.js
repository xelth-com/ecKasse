/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
  return knex.schema.alterTable('active_transactions', (table) => {
    table.string('resolution_status').defaultTo('none').index();
    // Possible values: 'none', 'pending', 'postponed', 'resolved'
    // 'none' - normal transaction, no resolution needed
    // 'pending' - transaction needs user resolution
    // 'postponed' - user chose to deal with it later
    // 'resolved' - user has taken action on this transaction
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
  return knex.schema.alterTable('active_transactions', (table) => {
    table.dropColumn('resolution_status');
  });
};