// File: /packages/backend/src/services/search.service.js

const db = require('../db/knex');
const { generateEmbedding, embeddingToBuffer } = require('./embedding.service');
const { calculateLevenshtein, isSimilar } = require('../utils/levenshtein');

/**
 * Generates a consistent, canonical cache key for a query and its filters.
 * @param {string} query - The base search query.
 * @param {object} filters - The filter object ({ excludeAllergens, dietaryFilter }).
 * @returns {string} A consistent string key.
 */
function generateCacheKey(query, filters) {
  const sortedFilters = {};
  // Sort keys to ensure consistency
  Object.keys(filters).sort().forEach(key => {
    // Only include non-empty/non-null filters in the key
    if (filters[key] && (!Array.isArray(filters[key]) || filters[key].length > 0)) {
      sortedFilters[key] = filters[key];
    }
  });
  return `${query}_${JSON.stringify(sortedFilters)}`;
}

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
    levenshteinThreshold = 8,  // Increased threshold for better cafe/coffee matching
    vectorDistanceThreshold = 0.5  // Fixed threshold for proper embeddings
  } = options;

  console.log(`🔍 Hybrid search for: "${query}"`);
  const startTime = Date.now();
  let searchMethod = 'none';
  let results = [];

  try {
    // Step 1: FTS Search (fastest, exact word matches)
    let ftsResults = [];
    if (!vectorOnly) {
      const ftsStart = Date.now();
      ftsResults = await performFTSSearch(query, maxResults);
      const ftsTime = Date.now() - ftsStart;
      console.log(`⚡ FTS search: ${ftsResults.length} results in ${ftsTime}ms`);

      if (ftsResults.length > 0) {
        console.log(`✅ FTS found exact matches, will combine with vector suggestions`);
      } else {
        console.log(`❌ FTS found no results, will try vector search`);
      }
    }

    // Step 2: Vector Search (semantic similarity) - try if API available
    let vectorResults = [];
    let vectorFailed = false;
    
    if (!ftsOnly) {
      // Check if we have embeddings available
      const embeddingCount = await db('item_embeddings').count('* as count').first();
      const hasEmbeddings = embeddingCount && embeddingCount.count > 0;
      
      if (hasEmbeddings) {
        try {
          const vectorStart = Date.now();
          vectorResults = await performVectorSearch(query, maxResults, vectorDistanceThreshold);
          const vectorTime = Date.now() - vectorStart;
          console.log(`🧠 Vector search: ${vectorResults.length} results in ${vectorTime}ms`);
          
          if (vectorResults.length > 0) {
            console.log(`✅ Vector found semantic matches`);
          }
        } catch (vectorError) {
          console.log(`⚠️ Vector search failed (${vectorError.message}), will use Levenshtein fallback`);
          vectorFailed = true;
        }
      } else {
        console.log(`⚠️ No embeddings available, will use Levenshtein fallback`);
        vectorFailed = true;
      }
    }

    // Step 2b: Levenshtein as universal fallback for Vector (always runs if Vector fails or has no results)
    let levenshteinSuggestions = [];
    if (vectorResults.length === 0 || vectorFailed) {
      console.log(`🔄 Getting Levenshtein suggestions as Vector fallback`);
      const levenshteinStart = Date.now();
      
      // Get all items and calculate Levenshtein distance  
      const allItems = await db('items')
        .select('id', 'display_names', 'item_price_value', 'associated_category_unique_identifier');
      
      const levenshteinResults = [];
      
      for (const item of allItems) {
        const menuName = item.display_names?.menu?.de || '';
        if (menuName) {
          const distance = require('../utils/levenshtein').calculateLevenshtein(
            query.toLowerCase(), 
            menuName.toLowerCase()
          );
          
          // More generous threshold for suggestions
          if (distance <= 8) {
            // Coffee boost for cafe searches
            let adjustedDistance = distance;
            if (query.toLowerCase().includes('cafe') || query.toLowerCase().includes('coffee')) {
              const lowerName = menuName.toLowerCase();
              if (lowerName.includes('coffee') || lowerName.includes('cafe') || 
                  lowerName.includes('cappuccino') || lowerName.includes('espresso') ||
                  lowerName.includes('latte') || lowerName.includes('creme')) {
                adjustedDistance = Math.max(0, distance - 3);
              }
            }
            
            levenshteinResults.push({
              id: item.id,
              display_names: item.display_names,
              price: item.item_price_value,
              category_id: item.associated_category_unique_identifier,
              search_type: 'levenshtein',
              distance: adjustedDistance,
              originalDistance: distance,
              similarity: Math.max(0, 1 - distance / Math.max(query.length, menuName.length)),
              productName: menuName
            });
          }
        }
      }
      
      // Sort by adjusted distance
      levenshteinResults.sort((a, b) => a.distance - b.distance);
      levenshteinSuggestions = levenshteinResults.slice(0, 3); // Top 3 suggestions
      
      const levenshteinTime = Date.now() - levenshteinStart;
      console.log(`📏 Levenshtein fallback: ${levenshteinSuggestions.length} suggestions in ${levenshteinTime}ms`);
    }

    // Step 3: Combine FTS, Vector and Levenshtein results intelligently
    if (ftsResults.length > 0 && (vectorResults.length > 0 || levenshteinSuggestions.length > 0)) {
      // Best case: exact match + semantic suggestions (Vector or Levenshtein)
      const suggestionSource = vectorResults.length > 0 ? 'vector' : 'levenshtein';
      searchMethod = `fts+${suggestionSource}`;
      
      // Take the first FTS result as primary
      results = [ftsResults[0]];
      
      // Add suggestions that aren't already in FTS results
      const ftsIds = new Set(ftsResults.map(item => item.id));
      const suggestions = (vectorResults.length > 0 ? vectorResults : levenshteinSuggestions)
        .filter(item => !ftsIds.has(item.id))
        .slice(0, 3); // Top 3 suggestions
      
      results = [...results, ...suggestions];
      console.log(`✅ Combined: 1 exact match + ${suggestions.length} ${suggestionSource} suggestions`);
      
    } else if (ftsResults.length > 0 && vectorResults.length === 0 && levenshteinSuggestions.length === 0) {
      // Only FTS results, no suggestions available
      results = ftsResults;
      searchMethod = 'fts';
      console.log(`✅ Using FTS results only (no suggestions available)`);
      
    } else if (vectorResults.length > 0) {
      // Only vector results
      searchMethod = 'vector';
      
      // Apply Levenshtein filtering to vector results
      const levenshteinStart = Date.now();
      results = await applyLevenshteinFilter(vectorResults, query, levenshteinThreshold);
      const levenshteinTime = Date.now() - levenshteinStart;
      console.log(`📏 Levenshtein filtering: ${results.length} results in ${levenshteinTime}ms`);
      
      if (results.length > 0) {
        searchMethod = 'hybrid';
      }
    } else if (levenshteinSuggestions.length > 0) {
      // Only Levenshtein suggestions (Vector failed or no Vector results)
      results = levenshteinSuggestions;
      searchMethod = 'levenshtein';
      console.log(`✅ Using Levenshtein fallback suggestions`);
    }

    // Levenshtein is now integrated above as universal fallback

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
    const ftsQuery = query.trim();
    if (!ftsQuery) return [];

    const clientType = db.client.config.client;
    let ftsResults;

    if (clientType === 'pg') {
      // PostgreSQL with simplified tsquery for full-text search
      ftsResults = await db.raw(`
        SELECT 
          items.id,
          items.display_names,
          items.item_price_value as price,
          items.associated_category_unique_identifier as category_id,
          'fts' as search_type,
          0 as distance,
          100 as similarity
        FROM items 
        WHERE to_tsvector('english', display_names::text || ' ' || COALESCE(additional_item_attributes::text, '')) 
          @@ plainto_tsquery('english', ?)
        ORDER BY ts_rank(to_tsvector('english', display_names::text || ' ' || COALESCE(additional_item_attributes::text, '')), 
          plainto_tsquery('english', ?)) DESC
        LIMIT ?
      `, [ftsQuery, ftsQuery, limit]);
    } else {
      // SQLite with FTS5
      ftsResults = await db.raw(`
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
        WHERE items_fts.display_names_text MATCH ?
        ORDER BY rank
        LIMIT ?
      `, [ftsQuery, limit]);
    }

    const results = clientType === 'pg' ? ftsResults.rows : ftsResults;
    return results.map(row => ({
      ...row,
      productName: (typeof row.display_names === 'string' ? 
        JSON.parse(row.display_names) : row.display_names).menu?.de || 'Unknown Product'
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
    const queryEmbedding = await generateEmbedding(query, { taskType: 'RETRIEVAL_QUERY' });
    const queryEmbeddingBuffer = embeddingToBuffer(queryEmbedding);

    const clientType = db.client.config.client;
    let vectorResults;

    if (clientType === 'pg') {
      // PostgreSQL with pgvector for semantic similarity search (if available)
      const vectorString = `[${queryEmbedding.join(',')}]`;
      
      try {
        // Try to use pgvector first
        vectorResults = await db.raw(`
          SELECT 
            items.id,
            items.display_names,
            items.item_price_value as price,
            items.associated_category_unique_identifier as category_id,
            'vector' as search_type,
            (item_embeddings.item_embedding <=> ?::vector) as distance
          FROM item_embeddings 
          JOIN items ON items.id = item_embeddings.item_id 
          WHERE item_embeddings.item_embedding IS NOT NULL
          ORDER BY item_embeddings.item_embedding <=> ?::vector
          LIMIT ?
        `, [vectorString, vectorString, limit]);
      } catch (error) {
        console.warn('pgvector not available, using text-based fallback for vector search');
        // Fallback: return random sample when pgvector is not available
        // This provides some results but not true semantic search
        vectorResults = await db.raw(`
          SELECT 
            items.id,
            items.display_names,
            items.item_price_value as price,
            items.associated_category_unique_identifier as category_id,
            'vector_fallback' as search_type,
            0.5 as distance
          FROM item_embeddings 
          JOIN items ON items.id = item_embeddings.item_id 
          WHERE item_embeddings.item_embedding IS NOT NULL
          ORDER BY RANDOM()
          LIMIT ?
        `, [limit]);
      }
    } else {
      // SQLite with sqlite-vec
      vectorResults = await db.raw(`
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
    }

    const results = clientType === 'pg' ? vectorResults.rows : vectorResults;
    return results.map(row => ({
      ...row,
      productName: (typeof row.display_names === 'string' ? 
        JSON.parse(row.display_names) : row.display_names).menu?.de || 'Unknown Product',
      similarity: clientType === 'pg' ? 
        Math.round(row.similarity_score * 100) : 
        Math.round((1 - row.distance) * 100)
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
 * Search products by name with hybrid approach, caching, and filtering
 * @param {string} productName - Product name to search for
 * @param {Object} filters - Filter options (excludeAllergens, dietaryFilter)
 * @returns {Promise<Object>} - Search results with response message
 */
async function searchProducts(productName, filters = {}) {
  try {
    const { excludeAllergens = [], dietaryFilter = null } = filters;
    const cacheKey = generateCacheKey(productName, filters);
    const CACHE_TTL_MS = 3600 * 1000; // 1 hour

    // --- 1. Refined Cache Check ---
    const cached = await db('search_cache')
      .where({ query_text: cacheKey })
      .where('created_at', '>', new Date(Date.now() - CACHE_TTL_MS))
      .first();

    if (cached) {
      console.log(`✅ Cache hit for key: ${cacheKey}`);
      // The cached response is already what we need. Return it directly.
      return JSON.parse(cached.full_response_text);
    }
    
    console.log(`🔍 Cache miss for key: ${cacheKey}, performing search`);

    // --- 2. Perform Hybrid Search (if no cache hit) ---
    const searchResult = await hybridSearch(productName, {
      maxResults: 5,
      levenshteinThreshold: 8,  // Increased for better fuzzy matching
      vectorDistanceThreshold: 0.5  // Fixed threshold for proper embeddings
    });

    let { results, metadata } = searchResult;

    // --- 3. Apply Filters ---
    if ((excludeAllergens.length > 0 || dietaryFilter) && results.length > 0) {
      const itemIds = results.map(item => item.id);
      const fullItems = await db('items').whereIn('id', itemIds);

      const filteredItems = fullItems.filter(item => {
        let attributes = {};
        try {
          attributes = item.additional_item_attributes ? JSON.parse(item.additional_item_attributes) : {};
        } catch (e) {
          console.warn(`Failed to parse additional_item_attributes for item ${item.id}`);
        }

        // Check allergen exclusions
        if (excludeAllergens.length > 0 && attributes.allergens) {
          const hasExcludedAllergen = excludeAllergens.some(allergen => 
            attributes.allergens.includes(allergen)
          );
          if (hasExcludedAllergen) return false;
        }

        // Check dietary filter
        if (dietaryFilter && attributes.dietary_info) {
          if (!attributes.dietary_info.includes(dietaryFilter)) {
            return false;
          }
        }

        return true;
      });

      // Update results with filtered items, preserving search metadata
      results = results.filter(result => 
        filteredItems.some(item => item.id === result.id)
      );

      metadata = { ...metadata, filtersApplied: true };
    }

    // --- 4. Formulate Response ---
    let finalResponse;
    if (results.length === 0) {
      finalResponse = {
        success: false,
        message: `Товар "${productName}" не найден. Попробуйте поискать по другому названию.`,
        results: [],
        metadata
      };
    } else {
      // Check for exact or very close matches
      const exactMatch = results.find(r => 
        r.search_type === 'fts' || 
        r.search_type === 'levenshtein' ||
        (r.levenshteinDistance !== undefined && r.levenshteinDistance <= 1)
      );

      if (exactMatch) {
        // For Levenshtein results, return all found items, not just the first
        if (exactMatch.search_type === 'levenshtein' && results.length > 1) {
          const topResults = results.slice(0, 3); // Show top 3 results
          finalResponse = {
            success: true,
            message: `Gefunden: ${topResults.map(r => r.productName).join(', ')}`,
            results: topResults,
            metadata
          };
        } else {
          finalResponse = {
            success: true,
            message: `Найден товар: "${exactMatch.productName}" - ${exactMatch.price}€`,
            results: [exactMatch],
            metadata
          };
        }
      } else {
        // Check for close matches (including good vector matches)
        const closeMatches = results.filter(r => {
          const isClose = r.isCloseMatch;
          const isHighSimilarity = r.similarity > 80;
          const isGoodVector = (r.distance !== undefined && r.distance <= 0.35);
          
          return isClose || isHighSimilarity || isGoodVector;
        });

        if (closeMatches.length > 0) {
          const bestMatch = closeMatches[0];
          finalResponse = {
            success: true,
            message: `Точное совпадение не найдено, но есть похожий товар: "${bestMatch.productName}" - ${bestMatch.price}€`,
            results: closeMatches,
            metadata
          };
        } else {
          // Return semantic suggestions
          const suggestions = results.slice(0, 3).map(r => r.productName);
          finalResponse = {
            success: false,
            message: `Товар "${productName}" не найден. Возможно, вы имели в виду: ${suggestions.join(', ')}?`,
            results: results.slice(0, 3),
            metadata
          };
        }
      }
    }

    // --- 5. Save to Cache ---
    await db('search_cache').insert({
      query_text: cacheKey,
      full_response_text: JSON.stringify(finalResponse),
      result_item_ids: JSON.stringify(results.map(item => item.id)),
      model_used: 'hybrid-search-v1'
    });
    console.log(`💾 Saved search result to cache for key: ${cacheKey}`);

    // --- 6. Return a fresh result ---
    return finalResponse;

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
  searchProducts,
  generateCacheKey
};