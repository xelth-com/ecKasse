// Database Factory to select adapter based on environment
// Implements factory pattern for database adapter creation

const { SQLiteAdapter } = require('./sqlite');
const { PostgreSQLAdapter } = require('./postgresql');

class DatabaseFactory {
  static createAdapter(deploymentMode, config) {
    switch (deploymentMode) {
      case 'desktop':
        console.log('Creating SQLite adapter for desktop deployment');
        return new SQLiteAdapter(config);
      
      case 'web':
        console.log('Creating PostgreSQL adapter for web deployment');
        return new PostgreSQLAdapter(config);
      
      default:
        throw new Error(`Unsupported deployment mode: ${deploymentMode}`);
    }
  }

  static getAdapterType(deploymentMode) {
    switch (deploymentMode) {
      case 'desktop':
        return 'sqlite';
      case 'web':
        return 'postgresql';
      default:
        throw new Error(`Unsupported deployment mode: ${deploymentMode}`);
    }
  }
}

module.exports = { DatabaseFactory };
