// Подключаем конфигурацию базы данных из нашего проекта
const db = require('./packages/backend/src/db/knex.js');
const logger = require('./packages/backend/src/config/logger.js');

async function clearTransactions() {
  logger.info('Запуск скрипта для принудительной очистки транзакций...');
  try {
    // Используем Knex для удаления всех записей из таблицы
    const deletedRows = await db('active_transactions').del();
    logger.info(`Успешно удалено ${deletedRows} незавершенных транзакций.`);

    // Оптимизируем файл базы данных после удаления
    await db.raw('VACUUM;');
    logger.info('База данных успешно очищена и оптимизирована.');
    
    console.log('\n✅ Все незавершенные транзакции были успешно удалены.');

  } catch (error) {
    logger.error('Произошла ошибка при очистке транзакций:', error);
    console.error('\n❌ Не удалось очистить транзакции. Ошибка:', error.message);
  } finally {
    // Важно: закрываем соединение с базой данных
    await db.destroy();
    logger.info('Соединение с базой данных закрыто.');
  }
}

// Запускаем функцию
clearTransactions();
