// File: /packages/backend/src/utils/levenshtein.js

/**
 * Calculate Levenshtein distance between two strings
 * @param {string} str1 - First string
 * @param {string} str2 - Second string
 * @returns {number} - Edit distance between the strings
 */
function calculateLevenshtein(str1, str2) {
  // Convert to lowercase for case-insensitive comparison
  const a = str1.toLowerCase();
  const b = str2.toLowerCase();
  
  const len1 = a.length;
  const len2 = b.length;
  
  // Create matrix
  const matrix = [];
  
  // Initialize first row and column
  for (let i = 0; i <= len2; i++) {
    matrix[i] = [i];
  }
  
  for (let j = 0; j <= len1; j++) {
    matrix[0][j] = j;
  }
  
  // Fill the matrix
  for (let i = 1; i <= len2; i++) {
    for (let j = 1; j <= len1; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j] + 1      // deletion
        );
      }
    }
  }
  
  return matrix[len2][len1];
}

/**
 * Calculate normalized Levenshtein distance (0-1 scale)
 * @param {string} str1 - First string
 * @param {string} str2 - Second string
 * @returns {number} - Normalized distance between 0 (identical) and 1 (completely different)
 */
function normalizedLevenshtein(str1, str2) {
  const maxLength = Math.max(str1.length, str2.length);
  if (maxLength === 0) return 0;
  
  const distance = calculateLevenshtein(str1, str2);
  return distance / maxLength;
}

/**
 * Calculate similarity percentage based on Levenshtein distance
 * @param {string} str1 - First string
 * @param {string} str2 - Second string
 * @returns {number} - Similarity percentage (0-100)
 */
function levenshteinSimilarity(str1, str2) {
  const normalized = normalizedLevenshtein(str1, str2);
  return Math.round((1 - normalized) * 100);
}

/**
 * Check if two strings are similar based on Levenshtein distance threshold
 * @param {string} str1 - First string
 * @param {string} str2 - Second string
 * @param {number} threshold - Maximum allowed edit distance (default: 2)
 * @returns {boolean} - True if strings are similar
 */
function isSimilar(str1, str2, threshold = 2) {
  return calculateLevenshtein(str1, str2) <= threshold;
}

module.exports = {
  calculateLevenshtein,
  normalizedLevenshtein,
  levenshteinSimilarity,
  isSimilar
};