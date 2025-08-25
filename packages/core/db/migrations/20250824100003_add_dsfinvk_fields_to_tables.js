exports.up = function(knex) {
  return knex.schema.alterTable('active_transactions', (table) => {
    table.timestamp('bon_start').nullable();
    table.timestamp('bon_end').nullable();
    table.integer('bon_nr').nullable();
  })
  .then(() => {
    return knex.schema.alterTable('pos_devices', (table) => {
      table.string('kasse_brand').nullable();
      table.string('kasse_modell').nullable();
      table.string('kasse_seriennr').nullable().unique();
      table.string('kasse_sw_brand').nullable();
      table.string('kasse_sw_version').nullable();
    });
  })
  .then(() => {
    return knex.schema.alterTable('users', (table) => {
      table.string('bediener_id').nullable().unique();
    });
  });
};

exports.down = function(knex) {
  return knex.schema.alterTable('active_transactions', (table) => {
    table.dropColumn('bon_start');
    table.dropColumn('bon_end');
    table.dropColumn('bon_nr');
  })
  .then(() => {
    return knex.schema.alterTable('pos_devices', (table) => {
      table.dropColumn('kasse_brand');
      table.dropColumn('kasse_modell');
      table.dropColumn('kasse_seriennr');
      table.dropColumn('kasse_sw_brand');
      table.dropColumn('kasse_sw_version');
    });
  })
  .then(() => {
    return knex.schema.alterTable('users', (table) => {
      table.dropColumn('bediener_id');
    });
  });
};