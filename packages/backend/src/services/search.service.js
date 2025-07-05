// File: /packages/backend/src/services/search.service.js

const db = require('../db/knex');
const { generateEmbedding, embeddingToBuffer } = require('./embedding.service');
const { calculateLevenshtein, isSimilar } = require('../utils/levenshtein');

/**
 * Hybrid search combining FTS, vector search, and Levenshtein distance
 * @param {string} query - Search query
 * @param {Object} options - Search options
 * @returns {Promise<Object>} - Search results with metadata
 */
async function hybridSearch(query, options = {}) {
  const {
    maxResults = 10,
    ftsOnly = false,
    vectorOnly = false,
    levenshteinThreshold = 2,
    vectorDistanceThreshold = 30.0  // Relaxed for mock embeddings
  } = options;

  console.log(`🔍 Hybrid search for: "${query}"`);
  const startTime = Date.now();
  let searchMethod = 'none';
  let results = [];

  try {
    // Step 1: FTS Search (fastest, exact word matches)
    if (!vectorOnly) {
      const ftsStart = Date.now();
      const ftsResults = await performFTSSearch(query, maxResults);
      const ftsTime = Date.now() - ftsStart;
      console.log(`⚡ FTS search: ${ftsResults.length} results in ${ftsTime}ms`);

      if (ftsResults.length > 0) {
        results = ftsResults;
        searchMethod = 'fts';
        console.log(`✅ FTS found results, returning early`);
      } else {
        console.log(`❌ FTS found no results, falling back to vector search`);
      }
    }

    // Step 2: Vector Search (semantic similarity)
    if (results.length === 0 && !ftsOnly) {
      const vectorStart = Date.now();
      const vectorResults = await performVectorSearch(query, maxResults, vectorDistanceThreshold);
      const vectorTime = Date.now() - vectorStart;
      console.log(`🧠 Vector search: ${vectorResults.length} results in ${vectorTime}ms`);

      if (vectorResults.length > 0) {
        searchMethod = 'vector';
        
        // Step 3: Levenshtein filtering (refine vector results)
        const levenshteinStart = Date.now();
        results = await applyLevenshteinFilter(vectorResults, query, levenshteinThreshold);
        const levenshteinTime = Date.now() - levenshteinStart;
        console.log(`📏 Levenshtein filtering: ${results.length} results in ${levenshteinTime}ms`);
        
        if (results.length > 0) {
          searchMethod = 'hybrid';
        }
      }
    }

    const totalTime = Date.now() - startTime;
    console.log(`🏁 Search completed in ${totalTime}ms using ${searchMethod} method`);

    return {
      results: results.slice(0, maxResults),
      metadata: {
        query,
        searchMethod,
        totalResults: results.length,
        executionTime: totalTime,
        options
      }
    };

  } catch (error) {
    console.error('Error in hybrid search:', error);
    throw error;
  }
}

/**
 * Perform Full-Text Search
 * @param {string} query - Search query
 * @param {number} limit - Maximum results
 * @returns {Promise<Array>} - FTS results
 */
async function performFTSSearch(query, limit = 10) {
  try {
    const ftsQuery = query.replace(/[^\w\s]/g, '').trim();
    if (!ftsQuery) return [];

    const ftsResults = await db.raw(`
      SELECT 
        items.id,
        items.display_names,
        items.item_price_value as price,
        items.associated_category_unique_identifier as category_id,
        'fts' as search_type,
        0 as distance,
        100 as similarity
      FROM items_fts 
      JOIN items ON items.id = items_fts.rowid 
      WHERE items_fts MATCH ?
      ORDER BY rank
      LIMIT ?
    `, [ftsQuery, limit]);

    return ftsResults.map(row => ({
      ...row,
      productName: JSON.parse(row.display_names).menu?.de || 'Unknown Product'
    }));

  } catch (error) {
    console.error('FTS search error:', error);
    return [];
  }
}

/**
 * Perform Vector Search
 * @param {string} query - Search query
 * @param {number} limit - Maximum results
 * @param {number} distanceThreshold - Maximum vector distance
 * @returns {Promise<Array>} - Vector search results
 */
async function performVectorSearch(query, limit = 10, distanceThreshold = 0.8) {
  try {
    // Generate embedding for query
    const queryEmbedding = await generateEmbedding(query);
    const queryEmbeddingBuffer = embeddingToBuffer(queryEmbedding);

    // Perform vector search using correct sqlite-vec KNN syntax
    const vectorResults = await db.raw(`
      SELECT 
        items.id,
        items.display_names,
        items.item_price_value as price,
        items.associated_category_unique_identifier as category_id,
        'vector' as search_type,
        distance
      FROM vec_items 
      JOIN items ON items.id = vec_items.rowid 
      WHERE item_embedding MATCH ? AND k = ?
        AND distance <= ?
      ORDER BY distance
    `, [queryEmbeddingBuffer, limit, distanceThreshold]);

    return vectorResults.map(row => ({
      ...row,
      productName: JSON.parse(row.display_names).menu?.de || 'Unknown Product',
      similarity: Math.round((1 - row.distance) * 100)
    }));

  } catch (error) {
    console.error('Vector search error:', error);
    return [];
  }
}

/**
 * Apply Levenshtein distance filtering to vector search results
 * @param {Array} vectorResults - Results from vector search
 * @param {string} query - Original search query
 * @param {number} threshold - Levenshtein distance threshold
 * @returns {Promise<Array>} - Filtered results with Levenshtein scores
 */
async function applyLevenshteinFilter(vectorResults, query, threshold = 2) {
  const filteredResults = vectorResults.map(result => {
    const levenshteinDistance = calculateLevenshtein(query, result.productName);
    const isCloseMatch = isSimilar(query, result.productName, threshold);

    return {
      ...result,
      levenshteinDistance,
      isCloseMatch,
      search_type: 'hybrid'
    };
  });

  // Sort by semantic distance first, then by Levenshtein distance
  filteredResults.sort((a, b) => {
    if (a.distance !== b.distance) {
      return a.distance - b.distance; // Lower semantic distance is better
    }
    return a.levenshteinDistance - b.levenshteinDistance; // Lower edit distance is better
  });

  return filteredResults;
}

/**
 * Search products by name with hybrid approach
 * @param {string} productName - Product name to search for
 * @returns {Promise<Object>} - Search results with response message
 */
async function searchProducts(productName) {
  try {
    const searchResult = await hybridSearch(productName, {
      maxResults: 5,
      levenshteinThreshold: 3,
      vectorDistanceThreshold: 30.0  // Relaxed for mock embeddings
    });

    const { results, metadata } = searchResult;

    if (results.length === 0) {
      return {
        success: false,
        message: `Товар "${productName}" не найден. Попробуйте поискать по другому названию.`,
        results: [],
        metadata
      };
    }

    // Check for exact or very close matches
    const exactMatch = results.find(r => 
      r.search_type === 'fts' || 
      (r.levenshteinDistance !== undefined && r.levenshteinDistance <= 1)
    );

    if (exactMatch) {
      const displayNames = JSON.parse(exactMatch.display_names);
      return {
        success: true,
        message: `Найден товар: "${exactMatch.productName}" - ${exactMatch.price}€`,
        results: [exactMatch],
        metadata
      };
    }

    // Check for close matches
    const closeMatches = results.filter(r => 
      r.isCloseMatch || r.similarity > 80
    );

    if (closeMatches.length > 0) {
      const bestMatch = closeMatches[0];
      return {
        success: true,
        message: `Точное совпадение не найдено, но есть похожий товар: "${bestMatch.productName}" - ${bestMatch.price}€`,
        results: closeMatches,
        metadata
      };
    }

    // Return semantic suggestions
    const suggestions = results.slice(0, 3).map(r => r.productName);
    return {
      success: false,
      message: `Товар "${productName}" не найден. Возможно, вы имели в виду: ${suggestions.join(', ')}?`,
      results: results.slice(0, 3),
      metadata
    };

  } catch (error) {
    console.error('Error in product search:', error);
    return {
      success: false,
      message: `Ошибка поиска: ${error.message}`,
      results: [],
      metadata: { error: error.message }
    };
  }
}

module.exports = {
  hybridSearch,
  performFTSSearch,
  performVectorSearch,
  applyLevenshteinFilter,
  searchProducts
};