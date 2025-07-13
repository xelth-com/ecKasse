// C:\Users\xelth\eckasse\src\backend\db\knexfile.js
const path = require('path');
const sqliteVec = require('sqlite-vec');
require('dotenv').config({ path: path.resolve(__dirname, '../../../../.env') }); // Загрузка .env из корня проекта

module.exports = {
  development: {
    client: 'sqlite3',
    connection: {
      filename: process.env.DB_FILENAME ? path.resolve(__dirname, '../../../../', process.env.DB_FILENAME) : path.resolve(__dirname, 'eckasse_dev.sqlite3')
    },
    useNullAsDefault: true,
    migrations: {
      directory: path.resolve(__dirname, 'migrations')
    },
    seeds: {
      directory: path.resolve(__dirname, 'seeds')
    },
    pool: {
      afterCreate: function(connection, done) {
        try {
          sqliteVec.load(connection);
          console.log('sqlite-vec extension loaded for migration');
          done();
        } catch (error) {
          console.error('Failed to load sqlite-vec extension:', error);
          done(error);
        }
      }
    }
  },
  // production: {
  //   client: 'sqlite3',
  //   connection: {
  //     filename: process.env.DB_FILENAME || './eckasse_prod.sqlite3' // Путь для продакшена может отличаться
  //   },
  //   useNullAsDefault: true,
  //   migrations: {
  //     directory: './migrations'
  //   }
  // }
};