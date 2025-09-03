/**
 * Migration to create item_embeddings table
 * This prepares the database for semantic search functionality
 * Note: Uses TEXT column as fallback when pgvector extension is not available
 */

exports.up = async function(knex) {
  // Check if item_embeddings table already exists
  const tableExists = await knex.schema.hasTable('item_embeddings');
  
  if (tableExists) {
    console.log('✅ item_embeddings table already exists, skipping creation');
    
    // Try to enable the vector extension anyway for future use
    try {
      await knex.raw('CREATE EXTENSION IF NOT EXISTS vector');
      console.log('✅ pgvector extension enabled successfully');
    } catch (error) {
      console.log('⚠️  pgvector extension not available');
    }
    return;
  }
  
  // Try to enable the vector extension for PostgreSQL, but continue if it fails
  try {
    await knex.raw('CREATE EXTENSION IF NOT EXISTS vector');
    console.log('✅ pgvector extension enabled successfully');
    
    // Create the item_embeddings table with proper vector column type
    await knex.schema.createTable('item_embeddings', function (table) {
      table.integer('item_id').primary().references('id').inTable('items').onDelete('CASCADE');
      table.specificType('item_embedding', 'vector(768)'); // 768-dimensional vector for embeddings
      table.timestamps(true, true);
    });
    console.log('✅ item_embeddings table created with vector(768) column type');
    
  } catch (error) {
    console.log('⚠️  pgvector extension not available, falling back to TEXT column');
    
    // Create the item_embeddings table with text column as fallback
    await knex.schema.createTable('item_embeddings', function (table) {
      table.integer('item_id').primary().references('id').inTable('items').onDelete('CASCADE');
      table.text('item_embedding'); // Store as text for now, can be upgraded later
      table.timestamps(true, true);
    });
    console.log('✅ item_embeddings table created with TEXT column (can be upgraded when pgvector is installed)');
  }
};

exports.down = async function(knex) {
  // Drop the table first
  await knex.schema.dropTableIfExists('item_embeddings');
  
  // Note: We don't drop the vector extension as it might be used by other tables
  // If you need to drop it, uncomment the following line:
  // await knex.raw('DROP EXTENSION IF EXISTS vector');
};