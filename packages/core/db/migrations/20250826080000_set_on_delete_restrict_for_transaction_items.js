/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
  // This migration corrects the ON DELETE behavior for transaction items.
  // It changes ON DELETE CASCADE to ON DELETE RESTRICT to prevent items
  // from being deleted if they are part of any active transaction.
  console.log('Altering foreign key on active_transaction_items to use ON DELETE RESTRICT...');
  return knex.raw(`
    ALTER TABLE active_transaction_items
    DROP CONSTRAINT active_transaction_items_item_id_foreign,
    ADD CONSTRAINT active_transaction_items_item_id_foreign
      FOREIGN KEY (item_id)
      REFERENCES items(id)
      ON DELETE RESTRICT;
  `);
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
  // This reverts the change, restoring the problematic ON DELETE CASCADE behavior.
  console.log('Reverting foreign key on active_transaction_items to use ON DELETE CASCADE...');
  return knex.raw(`
    ALTER TABLE active_transaction_items
    DROP CONSTRAINT active_transaction_items_item_id_foreign,
    ADD CONSTRAINT active_transaction_items_item_id_foreign
      FOREIGN KEY (item_id)
      REFERENCES items(id)
      ON DELETE CASCADE;
  `);
};