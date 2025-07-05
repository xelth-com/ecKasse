// File: /packages/backend/src/db/migrations/20250706150000_create_fts_table.js

exports.up = function(knex) {
  return knex.schema.raw(`
    -- Создаем виртуальную FTS5 таблицу для индексации названий товаров
    CREATE VIRTUAL TABLE items_fts USING fts5(
      display_names,
      content='items',
      content_rowid='id'
    );

    -- Создаем триггеры для автоматической синхронизации FTS-таблицы с основной таблицей 'items'
    
    -- После вставки нового товара в 'items', добавляем его в индекс
    CREATE TRIGGER items_after_insert AFTER INSERT ON items BEGIN
      INSERT INTO items_fts(rowid, display_names) VALUES (new.id, new.display_names);
    END;

    -- Перед удалением товара из 'items', удаляем его из индекса
    CREATE TRIGGER items_after_delete AFTER DELETE ON items BEGIN
      INSERT INTO items_fts(items_fts, rowid, display_names) VALUES ('delete', old.id, old.display_names);
    END;

    -- При обновлении товара в 'items', обновляем и индекс
    CREATE TRIGGER items_after_update AFTER UPDATE ON items BEGIN
      INSERT INTO items_fts(items_fts, rowid, display_names) VALUES ('delete', old.id, old.display_names);
      INSERT INTO items_fts(rowid, display_names) VALUES (new.id, new.display_names);
    END;
  `);
};

exports.down = function(knex) {
  return knex.schema.dropTableIfExists('items_fts');
};