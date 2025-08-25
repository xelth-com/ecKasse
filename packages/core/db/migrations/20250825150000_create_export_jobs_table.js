/**
 * Migration to create export_jobs table for asynchronous DSFinV-K export processing
 */

exports.up = function(knex) {
  return knex.schema.createTable('export_jobs', function(table) {
    table.increments('id').primary();
    table.string('job_id').notNullable().unique().index(); // UUID for job identification
    table.enum('status', ['PENDING', 'PROCESSING', 'COMPLETE', 'FAILED']).notNullable().defaultTo('PENDING');
    table.enum('export_type', ['dsfinvk']).notNullable(); // Future extensibility for other export types
    table.json('parameters'); // Store export parameters (start_date, end_date, etc.)
    table.string('file_path').nullable(); // Path to the generated file when complete
    table.string('download_token').nullable().unique(); // Secure token for downloading
    table.text('error_message').nullable(); // Error details if status is FAILED
    table.timestamp('expires_at').nullable(); // When the generated file expires
    table.integer('created_by').unsigned().references('id').inTable('users').onDelete('SET NULL');
    table.timestamps(true, true); // created_at, updated_at with automatic timestamps
  });
};

exports.down = function(knex) {
  return knex.schema.dropTable('export_jobs');
};