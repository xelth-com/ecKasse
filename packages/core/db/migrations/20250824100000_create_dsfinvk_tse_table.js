exports.up = function(knex) {
  return knex.schema.createTable('dsfinvk_tse', (table) => {
    table.increments('id').primary();
    table.string('tse_id').notNullable().unique();
    table.string('tse_serial').notNullable();
    table.string('tse_sig_algo').notNullable();
    table.string('tse_zeitformat').notNullable();
    table.string('tse_pd_encoding').notNullable();
    table.text('tse_public_key').notNullable();
    table.text('tse_zertifikat_i').notNullable();
    table.text('tse_zertifikat_ii');
    table.integer('pos_device_id').unsigned().references('id').inTable('pos_devices').onDelete('CASCADE');
    table.timestamps(true, true);
  });
};

exports.down = function(knex) {
  return knex.schema.dropTableIfExists('dsfinvk_tse');
};