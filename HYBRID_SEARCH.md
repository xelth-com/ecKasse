# HYBRID_SEARCH.md

## Цель: Реализация гибридного поиска в ecKasse

Создать многоуровневую систему поиска, которая объединяет **Full-Text Search (FTS)**, **семантический векторный поиск** и **расстояние Левенштейна** для обеспечения быстрого, точного и отказоустойчивого поиска, способного понимать смысл запроса и исправлять опечатки.

### Общая логика работы:

1. **FTS-поиск**: Быстрая проверка на точное совпадение слов
2. **Векторный поиск (Fallback)**: Если точных совпадений нет, выполняется поиск по смысловой близости
3. **Расстояние Левенштейна (Фильтрация)**: Результаты векторного поиска дополнительно проверяются на схожесть написания, чтобы отсеять семантически близкие, но лексически далекие результаты и обработать опечатки

---

## Фаза 1: Интеграция векторного поиска в SQLite

Цель этой фазы — подготовить базу данных и приложение для работы с векторами.

### Задача 1.1: Обновление зависимости sqlite3

Стандартный пакет `sqlite3` усложняет загрузку расширений. Мы заменим его на `@journeyapps/sqlcipher`, который является drop-in заменой и упрощает этот процесс.

**Действие**:
1. Удалить `sqlite3` из зависимостей `packages/backend/package.json`
2. Добавить `@journeyapps/sqlcipher` в зависимости
```bash
npm uninstall sqlite3 --workspace=@eckasse/backend
npm install @journeyapps/sqlcipher --workspace=@eckasse/backend
```

### Задача 1.2: Настройка загрузки расширения sqlite-vss

**Действие**:
1. Скачать последний релиз расширения `vector0` и `vss0` для вашей ОС (например, `vector0.so` и `vss0.so` для Linux) с [репозитория sqlite-vss](https://github.com/asg017/sqlite-vss/releases)
2. Поместить файлы расширения в новую директорию: `packages/backend/src/db/extensions/`
3. Модифицировать файл `packages/backend/src/db/knex.js`, чтобы он загружал расширение при каждом подключении к БД

**Пример кода для knex.js**:
```javascript
const knex = require('knex');
const config = require('./knexfile.js');
const path = require('path');

const environment = process.env.NODE_ENV || 'development';
const knexConfig = config[environment];

const db = knex(knexConfig);

// Загрузка расширения VSS
db.client.driver.on('open', (db) => {
  db.loadExtension(path.join(__dirname, 'extensions/vector0'));
  db.loadExtension(path.join(__dirname, 'extensions/vss0'));
  console.log('VSS extension loaded.');
});

module.exports = db;
```

### Задача 1.3: Создание миграции для векторной таблицы

**Действие**: Создать новый файл миграции Knex для создания виртуальной таблицы, которая будет хранить векторы.

**Код для новой миграции** (`..._create_vss_items_table.js`):
```javascript
exports.up = function(knex) {
  // Размерность 768 соответствует модели text-embedding-004 от Google
  return knex.schema.raw('CREATE VIRTUAL TABLE vss_items USING vss0(item_embedding(768))');
};

exports.down = function(knex) {
  return knex.schema.dropTableIfExists('vss_items');
};
```

---

## Фаза 2: Генерация и управление эмбеддингами

Цель этой фазы — преобразовать текстовые данные в векторы и поддерживать их в актуальном состоянии.

### Задача 2.1: Создание сервиса для генерации эмбеддингов

**Действие**: Создать новый файл `packages/backend/src/services/embedding.service.js`. Этот сервис будет инкапсулировать логику получения векторов от Google AI.

**Пример кода для embedding.service.js**:
```javascript
const { GoogleGenerativeAI } = require('@google/generative-ai');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "text-embedding-004" });

async function generateEmbedding(text) {
  const result = await model.embedContent(text);
  return result.embedding.values;
}

module.exports = { generateEmbedding };
```

### Задача 2.2: Создание скрипта для заполнения векторов

**Действие**: Написать отдельный скрипт (`npm run db:backfill:embeddings`), который пройдет по всем товарам в таблице `items`, сгенерирует для их названий эмбеддинги и заполнит таблицу `vss_items`.

**Псевдокод для скрипта**:
```javascript
// backfillEmbeddings.js
const db = require('./knex');
const { generateEmbedding } = require('../services/embedding.service');

async function backfill() {
  const products = await db('items').select('id', 'display_names');
  for (const product of products) {
    const name = JSON.parse(product.display_names).menu.de;
    const embedding = await generateEmbedding(name);
    await db.raw('INSERT INTO vss_items(rowid, item_embedding) VALUES (?, ?)', 
      [product.id, JSON.stringify(embedding)]);
    console.log(`Embedded product ID: ${product.id}`);
  }
  await db.destroy();
}

backfill();
```

### Задача 2.3: Обновление триггеров базы данных

**Действие**: Модифицировать миграцию `..._create_fts_table.js` (или создать новую), чтобы триггеры `items_after_insert` и `items_after_update` также обновляли данные в `vss_items`. Это потребует написания пользовательской SQL-функции, которую сможет вызывать триггер, так как триггеры не могут выполнять асинхронные JS-операции. *(Это сложная задача, для начала можно обойтись без триггеров и выполнять переиндексацию вручную)*.

---

## Фаза 3: Реализация гибридной логики поиска

Цель этой фазы — объединить все три метода поиска в одном инструменте.

### Задача 3.1: Полный рефакторинг инструмента findProduct

**Действие**: Заменить текущую логику `findProduct` в `llm.service.js` на новую, гибридную.

**Псевдокод новой логики findProduct**:
```javascript
async function findProduct(toolInput) {
  const searchQuery = toolInput.input;

  // --- 1. FTS Search ---
  let ftsResults = await knex.raw("SELECT rowid as id FROM items_fts WHERE items_fts MATCH ?", [searchQuery]);
  if (ftsResults.length > 0) {
    // Если есть точное совпадение, возвращаем его
    // ...
    return "Найден точный результат: ...";
  }

  // --- 2. Vector Search (Fallback) ---
  const queryEmbedding = await generateEmbedding(searchQuery);
  const vectorResults = await knex.raw(
    "SELECT rowid, distance FROM vss_items WHERE vss_search(item_embedding, ?)", 
    [JSON.stringify(queryEmbedding)]
  );

  if (vectorResults.length === 0) {
    return "К сожалению, похожих товаров не найдено.";
  }

  // --- 3. Levenshtein Distance refining ---
  const detailedCandidates = await Promise.all(vectorResults.map(async (v) => {
    const product = await knex('items').where('id', v.rowid).first();
    const productName = JSON.parse(product.display_names).menu.de;
    const levenshteinDist = calculateLevenshtein(searchQuery, productName);
    return { ...product, semanticDistance: v.distance, levenshteinDistance: levenshteinDist };
  }));
  
  detailedCandidates.sort((a, b) => a.semanticDistance - b.semanticDistance);

  // --- 4. Tiered Response Logic ---
  const bestMatch = detailedCandidates[0];

  if (bestMatch.levenshteinDistance <= 2) {
    return `Товар не найден, но есть очень похожий: "${bestMatch.name}". Вот информация...`;
  } else {
    const suggestions = detailedCandidates.slice(0, 3).map(c => c.name);
    return `Товар не найден. Возможно, вы имели в виду: ${suggestions.join(', ')}?`;
  }
}
```

### Задача 3.2: Реализация функции расстояния Левенштейна

**Действие**: Создать утилитарную функцию `calculateLevenshtein` для измерения текстовых различий.

**Пример кода**:
```javascript
function calculateLevenshtein(str1, str2) {
  const matrix = [];
  const len1 = str1.length;
  const len2 = str2.length;

  for (let i = 0; i <= len2; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= len1; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= len2; i++) {
    for (let j = 1; j <= len1; j++) {
      if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }

  return matrix[len2][len1];
}
```

---

## Фаза 4: Тестирование и настройка производительности

Цель этой фазы — убедиться, что система работает эффективно во всех сценариях.

### Задача 4.1: Создание тестовых сценариев

**Действие**: Создать набор тестовых запросов для проверки каждого уровня поиска.

**Примеры тестовых запросов**:
- **FTS**: "Кофе" (точное совпадение)
- **Vector**: "горячий напиток с кофеином" (семантическое совпадение)
- **Levenshtein**: "Кофе" → "Кофэ" (опечатка)
- **Комбинированный**: "пицца с сыром" (частичное совпадение + семантика)

### Задача 4.2: Мониторинг производительности

**Действие**: Добавить логирование времени выполнения для каждого этапа поиска.

**Пример кода для профилирования**:
```javascript
async function findProduct(toolInput) {
  const searchQuery = toolInput.input;
  const startTime = Date.now();

  // FTS Search
  const ftsStart = Date.now();
  let ftsResults = await knex.raw("SELECT rowid as id FROM items_fts WHERE items_fts MATCH ?", [searchQuery]);
  console.log(`FTS search took: ${Date.now() - ftsStart}ms`);

  if (ftsResults.length > 0) {
    console.log(`Total search time: ${Date.now() - startTime}ms`);
    return "Найден точный результат: ...";
  }

  // Vector Search
  const vectorStart = Date.now();
  // ... vector search logic
  console.log(`Vector search took: ${Date.now() - vectorStart}ms`);

  // Levenshtein filtering
  const levenshteinStart = Date.now();
  // ... levenshtein logic
  console.log(`Levenshtein filtering took: ${Date.now() - levenshteinStart}ms`);

  console.log(`Total search time: ${Date.now() - startTime}ms`);
  return result;
}
```

### Задача 4.3: Настройка параметров поиска

**Действие**: Определить оптимальные пороговые значения для каждого типа поиска.

**Параметры для настройки**:
- Максимальное расстояние для векторного поиска
- Максимальное расстояние Левенштейна для "близких" результатов
- Количество результатов для каждого этапа

---

## Фаза 5: Интеграция с пользовательским интерфейсом

Цель этой фазы — сделать гибридный поиск доступным через веб-интерфейс.

### Задача 5.1: Создание API-эндпоинта для поиска

**Действие**: Создать новый роут `/api/search` который будет использовать гибридный поиск.

**Пример кода для контроллера**:
```javascript
// packages/backend/src/controllers/search.controller.js
const { hybridSearch } = require('../services/search.service');

async function searchProducts(req, res) {
  try {
    const { query } = req.body;
    const results = await hybridSearch(query);
    res.json({
      success: true,
      results: results,
      searchMethod: results.searchMethod // 'fts', 'vector', 'hybrid'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

module.exports = { searchProducts };
```

### Задача 5.2: Обновление фронтенда

**Действие**: Добавить интерфейс для тестирования гибридного поиска в `packages/client-desktop/src/renderer/public/index.html`.

**Пример HTML-интерфейса**:
```html
<div class="search-section">
  <h3>Гибридный поиск товаров</h3>
  <input type="text" id="searchQuery" placeholder="Введите название товара...">
  <button onclick="performHybridSearch()">Поиск</button>
  <div id="searchResults"></div>
</div>
```

---

## Преимущества гибридного подхода

1. **Скорость**: FTS обеспечивает мгновенный ответ для точных совпадений
2. **Интеллектуальность**: Векторный поиск понимает смысл и синонимы
3. **Отказоустойчивость**: Расстояние Левенштейна исправляет опечатки
4. **Масштабируемость**: Каждый уровень может быть независимо оптимизирован

## Технические требования

- **Node.js**: v20+ (уже используется)
- **SQLite**: с поддержкой расширений
- **Доступ к Google AI**: для генерации эмбеддингов
- **Память**: ~100MB дополнительно для векторов (для небольшой базы товаров)

## Примерные метрики производительности

- **FTS поиск**: <5ms
- **Векторный поиск**: 20-50ms
- **Обработка Левенштейна**: 1-10ms
- **Общий Fallback**: 50-100ms

Этот план обеспечивает пошаговую реализацию интеллектуальной системы поиска, которая будет значительно превосходить текущие возможности ecKasse.