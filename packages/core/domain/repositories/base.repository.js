const db = require('../../db/knex');

/**
 * Base Repository with database-agnostic JSON handling
 */
class BaseRepository {
  constructor() {
    this.db = db;
    this.client = db.client.config.client;
  }

  /**
   * Prepare JSON data for database storage
   * PostgreSQL: Stores as object (JSONB)
   * SQLite: Stores as JSON string (TEXT)
   */
  prepareJsonForStorage(data) {
    if (this.client === 'pg') {
      // PostgreSQL handles JSON natively
      return data;
    } else {
      // SQLite requires JSON string
      return typeof data === 'string' ? data : JSON.stringify(data);
    }
  }

  /**
   * Parse JSON data from database
   * PostgreSQL: Already an object
   * SQLite: Parse JSON string
   */
  parseJsonFromStorage(data) {
    if (this.client === 'pg') {
      // PostgreSQL returns objects directly
      return data;
    } else {
      // SQLite returns strings that need parsing
      if (typeof data === 'string') {
        try {
          return JSON.parse(data);
        } catch (e) {
          return data; // Return as-is if not valid JSON
        }
      }
      return data;
    }
  }

  /**
   * Format JSON data for final logging/storage where JSON string is required
   * Both databases: Convert to JSON string for consistent logging
   */
  formatJsonForLogging(data) {
    return typeof data === 'string' ? data : JSON.stringify(data);
  }

  /**
   * Insert record with JSON handling
   */
  async insertWithJson(table, data, jsonFields = []) {
    const processedData = { ...data };
    
    jsonFields.forEach(field => {
      if (processedData[field] !== undefined) {
        processedData[field] = this.prepareJsonForStorage(processedData[field]);
      }
    });

    return await this.db(table).insert(processedData).returning('*');
  }

  /**
   * Update record with JSON handling
   */
  async updateWithJson(table, whereClause, data, jsonFields = []) {
    const processedData = { ...data };
    
    jsonFields.forEach(field => {
      if (processedData[field] !== undefined) {
        processedData[field] = this.prepareJsonForStorage(processedData[field]);
      }
    });

    return await this.db(table).where(whereClause).update(processedData).returning('*');
  }

  /**
   * Select records with JSON parsing
   */
  async selectWithJson(table, whereClause = {}, jsonFields = []) {
    const results = await this.db(table).where(whereClause);
    
    if (jsonFields.length === 0) {
      return results;
    }

    return results.map(record => {
      const processedRecord = { ...record };
      jsonFields.forEach(field => {
        if (processedRecord[field] !== undefined) {
          processedRecord[field] = this.parseJsonFromStorage(processedRecord[field]);
        }
      });
      return processedRecord;
    });
  }
}

module.exports = BaseRepository;