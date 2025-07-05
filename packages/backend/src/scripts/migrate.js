// File: /packages/backend/src/scripts/migrate.js

const db = require('../db/knex');

async function runMigrations() {
  try {
    console.log('Running database migrations...');
    
    // Check if vec_items table already exists
    const exists = await db.schema.hasTable('vec_items');
    
    if (!exists) {
      console.log('Creating vec_items virtual table...');
      
      // Create the virtual table using raw SQL since the extension is loaded
      await db.raw(`
        CREATE VIRTUAL TABLE vec_items USING vec0(
          item_embedding FLOAT[768]
        )
      `);
      
      console.log('✓ vec_items table created successfully');
    } else {
      console.log('vec_items table already exists');
    }
    
    // Test the table by inserting a sample vector
    console.log('Testing vector operations...');
    
    const testVector = new Float32Array(768).fill(0.1);
    const testVectorJson = JSON.stringify(Array.from(testVector));
    
    await db.raw(
      'INSERT INTO vec_items(rowid, item_embedding) VALUES (?, ?)',
      [999999, testVectorJson]
    );
    
    // Query it back
    const result = await db.raw('SELECT rowid FROM vec_items WHERE rowid = 999999');
    console.log('✓ Vector operations working, test row:', result[0]);
    
    // Clean up test data
    await db.raw('DELETE FROM vec_items WHERE rowid = 999999');
    console.log('✓ Test data cleaned up');
    
    console.log('Migration completed successfully!');
    
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  } finally {
    await db.destroy();
  }
}

// Run migrations if this script is executed directly
if (require.main === module) {
  runMigrations();
}

module.exports = runMigrations;