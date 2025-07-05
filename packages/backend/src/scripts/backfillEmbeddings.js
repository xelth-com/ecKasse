// File: /packages/backend/src/scripts/backfillEmbeddings.js

const db = require('../db/knex');
const { generateEmbedding, embeddingToBuffer } = require('../services/embedding.service');

async function backfillEmbeddings() {
  try {
    console.log('Starting embeddings backfill...');
    
    // Get all products from the database
    const products = await db('items').select('id', 'display_names');
    console.log(`Found ${products.length} products to process`);
    
    let processed = 0;
    let errors = 0;
    
    for (const product of products) {
      try {
        // Extract German product name from display_names JSON
        const displayNames = JSON.parse(product.display_names);
        const productName = displayNames.menu?.de || displayNames.menu?.en || 'Unknown Product';
        
        console.log(`Processing product ID ${product.id}: "${productName}"`);
        
        // Generate embedding
        const embedding = await generateEmbedding(productName);
        const embeddingBuffer = embeddingToBuffer(embedding);
        
        // Insert into vec_items table  
        await db.raw(
          'INSERT OR REPLACE INTO vec_items(rowid, item_embedding) VALUES (?, ?)',
          [product.id, embeddingBuffer]
        );
        
        processed++;
        console.log(`✓ Processed ${processed}/${products.length}: ${productName}`);
        
        // Add small delay to respect API rate limits
        await new Promise(resolve => setTimeout(resolve, 100));
        
      } catch (error) {
        console.error(`✗ Error processing product ID ${product.id}:`, error.message);
        errors++;
      }
    }
    
    console.log(`\nBackfill completed:`);
    console.log(`- Processed: ${processed} products`);
    console.log(`- Errors: ${errors} products`);
    console.log(`- Success rate: ${((processed / products.length) * 100).toFixed(1)}%`);
    
  } catch (error) {
    console.error('Fatal error during backfill:', error);
    process.exit(1);
  } finally {
    await db.destroy();
  }
}

// Run the backfill if this script is executed directly
if (require.main === module) {
  backfillEmbeddings();
}

module.exports = backfillEmbeddings;