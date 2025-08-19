const logger = require('../config/logger');

/**
 * Safely parses a field that may be a JSON string (from SQLite) or already an object (from PostgreSQL).
 * @param {*} field - The database field to parse.
 * @returns {object | null} The parsed object, an empty object on error, or null if input is null/undefined.
 */
function parseJsonIfNeeded(field) {
  if (field === null || typeof field === 'undefined') {
    return null;
  }
  if (typeof field === 'object') {
    return field; // Already an object
  }
  if (typeof field === 'string') {
    try {
      return JSON.parse(field);
    } catch (e) {
      logger.warn({ value: field, error: e.message }, 'Failed to parse JSON string field from database, returning empty object.');
      return {}; // Return empty object on parsing error to prevent downstream issues
    }
  }
  return {}; // Return empty object for other unexpected types
}

module.exports = { parseJsonIfNeeded };