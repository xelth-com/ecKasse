#!/usr/bin/env node

require('dotenv').config({ path: '../../.env' });
const db = require('../db/knex');
const { generateEmbedding, embeddingToBuffer } = require('../services/embedding.service');

async function generateTestEmbeddings() {
    try {
        console.log('Generating embeddings for test products...');
        
        // Get all items that don't have embeddings
        const items = await db('items').select('id', 'display_names');
        console.log(`Found ${items.length} items to process`);
        
        for (const item of items) {
            try {
                // Extract text from display names
                const displayNames = JSON.parse(item.display_names);
                const textToEmbed = displayNames.menu?.de || displayNames.receipt?.de || displayNames.button?.de || 'Unknown Product';
                
                console.log(`Generating embedding for item ${item.id}: "${textToEmbed}"`);
                
                // Generate embedding with correct task type
                const embedding = await generateEmbedding(textToEmbed, { taskType: 'RETRIEVAL_DOCUMENT' });
                const embeddingBuffer = embeddingToBuffer(embedding);
                
                // Check if embedding exists
                const existingEmbedding = await db('vec_items').where('rowid', item.id).first();
                
                if (existingEmbedding) {
                    // Update existing embedding
                    await db('vec_items')
                        .where('rowid', item.id)
                        .update({
                            item_embedding: embeddingBuffer
                        });
                    console.log(`  ✓ Updated embedding for item ${item.id}`);
                } else {
                    // Insert new embedding
                    await db('vec_items').insert({
                        rowid: item.id,
                        item_embedding: embeddingBuffer
                    });
                    console.log(`  ✓ Created embedding for item ${item.id}`);
                }
                
            } catch (itemError) {
                console.error(`Error processing item ${item.id}:`, itemError);
            }
        }
        
        // Test vector search
        console.log('\nTesting vector search...');
        const testQuery = 'Widget';
        const queryEmbedding = await generateEmbedding(testQuery, { taskType: 'RETRIEVAL_QUERY' });
        const queryEmbeddingBuffer = embeddingToBuffer(queryEmbedding);
        
        const vectorResults = await db.raw(`
            SELECT 
                items.id,
                items.display_names,
                distance
            FROM vec_items 
            JOIN items ON items.id = vec_items.rowid 
            WHERE item_embedding MATCH ? AND k = 5
            ORDER BY distance
        `, [queryEmbeddingBuffer]);
        
        console.log(`Vector search for "${testQuery}":`, vectorResults);
        
    } catch (error) {
        console.error('Error generating embeddings:', error);
    } finally {
        await db.destroy();
    }
}

generateTestEmbeddings();