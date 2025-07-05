// File: /packages/backend/src/db/migrations/20250706120000_create_oop_pos_mdf_tables.js
exports.up = function (knex) {
  return knex.schema
    .createTable('companies', (table) => {
      table.increments('id').primary();
      table.string('company_full_name').notNullable();
      table.jsonb('meta_information').notNullable();
      table.jsonb('global_configurations').notNullable();
      table.timestamps(true, true);
    })
    .createTable('branches', (table) => {
      table.increments('id').primary();
      table.integer('company_id').unsigned().references('id').inTable('companies').onDelete('CASCADE');
      table.string('branch_name').notNullable();
      table.string('branch_address');
      table.timestamps(true, true);
    })
    .createTable('pos_devices', (table) => {
      table.increments('id').primary();
      table.integer('branch_id').unsigned().references('id').inTable('branches').onDelete('CASCADE');
      table.string('pos_device_name').notNullable();
      table.string('pos_device_type').notNullable();
      table.integer('pos_device_external_number').notNullable();
      table.jsonb('pos_device_settings');
      table.timestamps(true, true);
    })
    .createTable('categories', (table) => {
      table.increments('id').primary();
      table.integer('pos_device_id').unsigned().references('id').inTable('pos_devices').onDelete('CASCADE');
      table.jsonb('category_names').notNullable();
      table.string('category_type').notNullable();
      table.integer('parent_category_id').unsigned().references('id').inTable('categories').onDelete('SET NULL');
      table.integer('default_linked_main_group_unique_identifier');
      table.jsonb('audit_trail');
      table.timestamps(true, true);
    })
    .createTable('items', (table) => {
      table.increments('id').primary();
      table.integer('pos_device_id').unsigned().references('id').inTable('pos_devices').onDelete('CASCADE');
      table.integer('associated_category_unique_identifier').unsigned().references('id').inTable('categories').onDelete('CASCADE');
      table.jsonb('display_names').notNullable();
      table.decimal('item_price_value', 10, 2).notNullable();
      table.jsonb('pricing_schedules');
      table.jsonb('availability_schedule');
      table.jsonb('additional_item_attributes');
      table.jsonb('item_flags').notNullable();
      table.jsonb('audit_trail').notNullable();
      table.timestamps(true, true);
    });
};

exports.down = function (knex) {
  return knex.schema
    .dropTableIfExists('items')
    .dropTableIfExists('categories')
    .dropTableIfExists('pos_devices')
    .dropTableIfExists('branches')
    .dropTableIfExists('companies');
};