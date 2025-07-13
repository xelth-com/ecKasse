exports.up = function(knex) {
  return knex.schema.createTable('search_cache', (table) => {
    table.increments('id').primary();
    table.text('query_text').notNullable().index();
    table.specificType('query_embedding', 'BLOB');
    table.string('model_used').notNullable();
    table.jsonb('result_item_ids').notNullable();
    table.text('full_response_text').notNullable();
    table.timestamps(true, true);
  });
};

exports.down = function(knex) {
  return knex.schema.dropTableIfExists('search_cache');
};