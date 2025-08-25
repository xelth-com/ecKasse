exports.up = function(knex) {
  return knex.schema.createTable('dsfinvk_locations', (table) => {
    table.increments('location_id').primary();
    table.string('loc_name').notNullable();
    table.string('loc_strasse');
    table.string('loc_plz');
    table.string('loc_ort');
    table.string('loc_land');
    table.string('loc_ustid');
    table.integer('pos_device_id').unsigned().references('id').inTable('pos_devices').onDelete('SET NULL');
    table.timestamps(true, true);
  });
};

exports.down = function(knex) {
  return knex.schema.dropTableIfExists('dsfinvk_locations');
};