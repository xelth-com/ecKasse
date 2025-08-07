# Руководство по развертыванию ecKasse на сервере Netcup

Этот документ содержит пошаговую инструкцию по развертыванию приложения ecKasse на чистом Debian/Ubuntu сервере, основанную на опыте решения всех возникших проблем.

## 1. Предварительные требования

- Доступ к серверу по SSH с правами `root`.
- Установленный Node.js (рекомендуется v20+) и npm.
- Доменное имя, направленное на IP-адрес вашего сервера (A-запись).
- Git для клонирования репозитория.

---

## 2. Начальная настройка сервера

Эти шаги подготавливают сервер и код проекта.

1. **Клонирование репозитория:**
   Клонируем проект в стандартную веб-директорию `/var/www`.

   ```bash
   cd /var/www
   git clone https://github.com/xelth-com/eckasse.git eckasse.com
   cd eckasse.com
   ```

2. **Установка инструментов для сборки:**
   Некоторые npm-пакеты (например, `sqlite3`) требуют компиляции. Установим все необходимое для этого.

   ```bash
   sudo apt update
   sudo apt install -y build-essential python3
   ```

---

## 3. Конфигурация проекта

Настраиваем переменные окружения для продакшн-режима.

1. **Создаем файл `.env`:**
   Копируем пример и открываем для редактирования.

   ```bash
   cp .env.example .env
   nano .env
   ```

2. **Заполняем `.env`:**
   Убедитесь, что установлены следующие значения:

   ```env
   NODE_ENV=production
   APP_MODE=production
   GEMINI_API_KEY=ВАШ_КЛЮЧ_ОТ_GEMINI
   # ВАЖНО: Указываем полный путь к файлу продакшн-базы
   DB_FILENAME=/var/www/eckasse.com/packages/backend/src/db/eckasse_prod.sqlite3
   ```

---

## 4. Установка зависимостей

Устанавливаем все npm-пакеты.

```bash
npm install
```

---

## 5. Подготовка базы данных

Создаем и наполняем базу данных для продакшена.

1. **Исправляем конфигурацию Knex (`knexfile.js`):**
   Нужно убедиться, что секция `production` раскомментирована и содержит хук для загрузки векторного модуля.

   Откройте файл:
   `nano packages/backend/src/db/knexfile.js`

   Приведите его к следующему виду:

   ```javascript
   const path = require('path');
   const sqliteVec = require('sqlite-vec');
   require('dotenv').config({ path: path.resolve(__dirname, '../../../../.env') });

   module.exports = {
     development: {
       // ... секция development остается без изменений
     },

     production: {
       client: 'sqlite3',
       connection: {
         filename: process.env.DB_FILENAME || './eckasse_prod.sqlite3'
       },
       useNullAsDefault: true,
       migrations: {
         directory: './migrations'
       },
       seeds: {
         directory: './seeds'
       },
       pool: {
         afterCreate: function(connection, done) {
           try {
             sqliteVec.load(connection);
             console.log('sqlite-vec extension loaded for production');
             done();
           } catch (error) {
             console.error('Failed to load sqlite-vec extension for production:', error);
             done(error);
           }
         }
       }
     }
   };
   ```

2. **Выполняем миграции и сиды для продакшена:**
   Префикс `NODE_ENV=production` заставляет `knex` использовать правильную секцию из `knexfile.js`.

   ```bash
   NODE_ENV=production npm run migrate:backend
   NODE_ENV=production npm run seed:backend
   ```

---

## 6. Сборка фронтенда и исправление WebSocket

1. **Исправляем URL для WebSocket:**
   Чтобы приложение работало не только локально, нужно сделать URL динамическим.

   Откройте файл:
   `nano packages/client-desktop/src/renderer/src/lib/wsStore.js`

   Найдите строку `ws = new WebSocket('ws://localhost:3030');` и замените ее на:

   ```javascript
   const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
   const wsUrl = `${protocol}//${window.location.host}`;
   ws = new WebSocket(wsUrl);
   ```

2. **Собираем фронтенд:**
   Эта команда скомпилирует Svelte-приложение в статические файлы.

   ```bash
   npm run build --workspace=@eckasse/renderer-ui
   ```

---

## 7. Настройка Nginx

Настраиваем веб-сервер для работы с нашим приложением.

1. **Создаем файл конфигурации:**

   ```bash
   nano /etc/nginx/sites-available/eckasse.com.conf
   ```

2. **Вставляем конфигурацию:**
   Замените `eckasse.com www.eckasse.com` на ваши домены.

   ```nginx
   server {
       server_name eckasse.com www.eckasse.com;

       root /var/www/eckasse.com/html;
       index index.html index.htm;

       access_log /var/log/nginx/eckasse.com.access.log;
       error_log /var/log/nginx/eckasse.com.error.log warn;

       location / {
           proxy_pass http://127.0.0.1:3030;
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection 'upgrade';
           proxy_set_header Host $host;
           proxy_set_header X-Real-IP $remote_addr;
           proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
           proxy_set_header X-Forwarded-Proto $scheme;
           proxy_cache_bypass $http_upgrade;
       }
   }
   ```

3. **Активируем сайт:**

   ```bash
   sudo ln -s /etc/nginx/sites-available/eckasse.com.conf /etc/nginx/sites-enabled/
   ```

4. **Получаем SSL-сертификат:**

   ```bash
   sudo certbot --nginx -d eckasse.com -d www.eckasse.com
   ```

5. **Перезагружаем Nginx:**

   ```bash
   sudo systemctl reload nginx
   ```

---

## 8. Запуск приложения через PM2

Запускаем приложение как постоянный сервис, который не будет останавливаться после вашего отключения от сервера.

1. **Создаем `ecosystem.config.js`:**
   Этот файл-карта говорит PM2, как правильно запускать приложение.

   ```bash
   nano ecosystem.config.js
   ```

   Вставьте в него следующее:

   ```javascript
   module.exports = {
     apps: [{
       name: 'eckasse-backend',
       script: 'npm',
       args: 'run start:backend',
       cwd: '/var/www/eckasse.com',
       watch: false,
       env_production: {
         NODE_ENV: 'production'
       }
     }]
   };
   ```

2. **Настраиваем автозапуск PM2:**
   Это нужно сделать один раз.

   ```bash
   pm2 startup
   ```
   Скопируйте и выполните ту команду, которую вам выдаст `pm2`.

3. **Запускаем приложение через ecosystem-файл:**

   ```bash
   pm2 start ecosystem.config.js --env production
   ```

4. **Сохраняем процесс для автозапуска:**
   Это самый важный шаг.

   ```bash
   pm2 save
   ```

---

## 9. Полезные команды

- `pm2 status` - посмотреть статус всех приложений.
- `pm2 logs eckasse-backend` - посмотреть логи кассы.
- `pm2 flush eckasse-backend` - очистить логи.
- `pm2 restart eckasse-backend` - перезапустить приложение.
- `sudo nginx -t` - проверить конфигурацию Nginx.
- `sudo systemctl reload nginx` - перезагрузить Nginx.

---

## 10. Проверка развертывания

После выполнения всех шагов:

1. Проверьте статус PM2: `pm2 status`
2. Убедитесь, что Nginx работает: `sudo systemctl status nginx`
3. Откройте ваш домен в браузере и проверьте работоспособность приложения
4. Проверьте WebSocket соединение в разделе тестирования

---

## Устранение неполадок

### Проблемы с базой данных
- Убедитесь, что путь в `DB_FILENAME` существует и доступен для записи
- Проверьте, что миграции выполнились: `NODE_ENV=production npx knex migrate:status --cwd packages/backend/src/db`

### Проблемы с WebSocket
- Проверьте, что в `wsStore.js` используется динамический URL
- Убедитесь, что Nginx правильно проксирует WebSocket соединения

### Проблемы с PM2
- Проверьте логи: `pm2 logs eckasse-backend`
- Убедитесь, что `ecosystem.config.js` находится в корне проекта

### Проблемы с SSL
- Проверьте, что домен правильно указывает на IP сервера
- Убедитесь, что порт 80 и 443 открыты на сервере