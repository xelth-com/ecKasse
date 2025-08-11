exports.up = function(knex) {
  return knex.schema.createTable('menu_layouts', (table) => {
    table.increments('id').primary();
    table.string('name').notNullable();
    table.text('description');
    table.jsonb('layout_data').notNullable(); // Stores the category tree for this layout
    table.boolean('is_active').defaultTo(false).index();
    table.string('source_type').notNullable().defaultTo('USER_CREATED'); // e.g., 'AI_OPTIMIZED', 'ORIGINAL_MENU', 'USER_CREATED'
    table.timestamps(true, true);
  });
};

exports.down = function(knex) {
  return knex.schema.dropTableIfExists('menu_layouts');
};