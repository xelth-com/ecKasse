// File: /packages/backend/src/db/migrations/20250706150000_create_fts_table.js

exports.up = function(knex) {
  // This migration is only for SQLite - skip for PostgreSQL
  if (knex.client.config.client !== 'sqlite3') {
    return Promise.resolve();
  }
  
  return knex.schema.raw(`
    -- Создаем виртуальную FTS5 таблицу для индексации названий товаров
    -- Создаем отдельную таблицу, не связанную с content= для лучшего контроля
    CREATE VIRTUAL TABLE items_fts USING fts5(
      display_names_text
    );

    -- Создаем триггеры для автоматической синхронизации FTS-таблицы с основной таблицей 'items'
    -- Извлекаем текст из JSON структуры display_names для правильного индексирования
    
    -- После вставки нового товара в 'items', добавляем его в индекс
    CREATE TRIGGER items_after_insert AFTER INSERT ON items BEGIN
      INSERT INTO items_fts(rowid, display_names_text) 
      VALUES (
        new.id, 
        COALESCE(json_extract(new.display_names, '$.menu.de'), '') || ' ' ||
        COALESCE(json_extract(new.display_names, '$.button.de'), '') || ' ' ||
        COALESCE(json_extract(new.display_names, '$.receipt.de'), '')
      );
    END;

    -- Перед удалением товара из 'items', удаляем его из индекса
    CREATE TRIGGER items_after_delete AFTER DELETE ON items BEGIN
      DELETE FROM items_fts WHERE rowid = old.id;
    END;

    -- При обновлении товара в 'items', обновляем и индекс
    CREATE TRIGGER items_after_update AFTER UPDATE ON items BEGIN
      DELETE FROM items_fts WHERE rowid = old.id;
      INSERT INTO items_fts(rowid, display_names_text) 
      VALUES (
        new.id, 
        COALESCE(json_extract(new.display_names, '$.menu.de'), '') || ' ' ||
        COALESCE(json_extract(new.display_names, '$.button.de'), '') || ' ' ||
        COALESCE(json_extract(new.display_names, '$.receipt.de'), '')
      );
    END;

    -- Заполняем FTS таблицу существующими данными
    INSERT INTO items_fts(rowid, display_names_text)
    SELECT 
      id,
      COALESCE(json_extract(display_names, '$.menu.de'), '') || ' ' ||
      COALESCE(json_extract(display_names, '$.button.de'), '') || ' ' ||
      COALESCE(json_extract(display_names, '$.receipt.de'), '')
    FROM items;
  `);
};

exports.down = function(knex) {
  // This migration is only for SQLite - skip for PostgreSQL
  if (knex.client.config.client !== 'sqlite3') {
    return Promise.resolve();
  }
  
  return knex.schema.dropTableIfExists('items_fts');
};