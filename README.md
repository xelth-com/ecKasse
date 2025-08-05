# ecKasse - LLM-Powered Point of Sale System

> ### Eine Kasse, die hilft – nicht kostet.
> #### KI-Technologie zum Selbstkostenpreis – für mehr Zeit mit Ihren Gästen.

**Status:** In Development | **License:** EUPL-1.2 | **Developer:** Betruger Sp. z o.o.

LLM-powered desktop POS system built with Electron, React, and Node.js. Features natural language configuration via Google Gemini and German fiscal compliance (TSE/DSFinV-K).

## Architecture

### Technology Stack
- **Desktop:** Electron.js with a Svelte frontend
- **Mobile:** Native Android (Kotlin/Jetpack Compose) for standalone and client-only deployments
- **Backend:** Node.js + Express.js (local HTTP API)
- **Database:** SQLite with Knex.js migrations
- **LLM:** Google Gemini (Flash/Pro) via @google/genai
- **Communication:** WebSocket (primary) + HTTP (fallback)
- **Logging:** Pino with structured JSON output

### Communication Layers
1. **WebSocket** - Primary low-latency channel
2. **HTTP API** - Fallback with same operationId system
3. **Cloud Proxy** - Optional remote access via eck(1,2,3).com

All operations use UUID-based `operationId` for idempotency across channels.

## Key Features

### LLM Integration
- Natural language POS configuration
- Function calling for direct API execution
- Multi-language support with automatic adaptation
- Contextual help and error diagnostics
- Product and pricing management via conversation

### Data Management
- **Products:** Three naming levels (menu/button/receipt display)
- **Categories:** Hierarchical with automatic tax assignment  
- **Users & Roles:** Access control management
- **Modifiers:** Time/condition-based pricing rules
- **Table Management:** Bill splitting and item transfers

### Fiscal Compliance (Germany)
- **TSE Integration:** Technical Security Equipment support
- **DSFinV-K Export:** Tax authority data format
- **Time Control:** Mandatory TSE clock verification
- **Long-term Archival:** Hedera blockchain anchoring (daily for audit trail consistency)
- **GoBD Compliance:** Proper accounting record principles

### UI Innovation
- **Geometric Tessellation:** Optimized layout patterns
  - Hexagons (6.6.6): Categories - maximum space efficiency
  - Squares (4.4.4): Numbers - familiar input patterns
  - Octagons (4.8.8): Hierarchical relationships

## Project Structure

```
├── packages/
│   ├── backend/                 # Node.js Express API
│   │   ├── src/
│   │   │   ├── config/         # Logger, database config
│   │   │   ├── controllers/    # API endpoint handlers
│   │   │   ├── services/       # Business logic, LLM service
│   │   │   ├── routes/         # Express route definitions
│   │   │   └── db/             # Knex migrations and seeds
│   │   └── package.json
│   └── client-desktop/         # Electron wrapper
│       ├── electron/           # Main process, preload scripts
│       ├── src/renderer/       # React application
│       │   ├── src/
│       │   │   ├── hooks/      # Custom React hooks (WebSocket)
│       │   │   └── components/ # UI components
│       │   └── package.json
│       └── package.json
└── package.json               # Monorepo root
```

## Installation & Development

### Prerequisites
- Node.js 18+ (project tested with v24.2.0)
- Google Gemini API key
- Git

### Setup
```bash
git clone https://github.com/xelth-com/eckasse.git
cd eckasse
npm install
```

### Environment Configuration
Create `.env` in project root:
```env
GEMINI_API_KEY=your_google_gemini_api_key
BACKEND_PORT=3030
NODE_ENV=development
LOG_LEVEL=debug
DB_FILENAME=./packages/backend/src/db/eckasse_dev.sqlite3
```

### Development Commands
```bash
# Start all services (backend + React + Electron)
npm run dev

# Individual services
npm run dev:backend          # Backend API only
npm run dev:client:desktop:react  # React dev server only

# Database management
npm run migrate:backend      # Run database migrations
npm run seed:backend        # Seed development data

# Production builds
npm run build:client:desktop # Build Electron app
npm run dist:client:desktop  # Create distributable package
```

### Testing LLM Features
1. Start development environment: `npm run dev`
2. Open Electron app (automatically launches)
3. Test Gemini integration in the "Gemini Ping-Pong Test" section
4. Example queries:
   - "What are the details for product ID 123?"
   - "Tell me about the Super Widget product"
   - "Add a new coffee drink called Cappuccino for €3.50"

## API Structure

### LLM Service
Located in `packages/backend/src/services/llm.service.js`

- **Function Calling:** Direct API execution via Gemini tools
- **Product Management:** getProductDetails function for inventory queries
- **Conversation History:** Maintains context across requests
- **Error Handling:** Multi-model fallback (Gemini 2.5 Flash → 2.0 Flash → 1.5 Flash)

### WebSocket + HTTP Fallback
Located in `packages/client-desktop/src/renderer/src/hooks/useWebSocket.js`

- **Primary:** WebSocket for real-time communication
- **Fallback:** HTTP requests with same operationId
- **Idempotency:** UUID-based operation tracking prevents duplicates

## Система Пользователей и Уровни Доступа

### Роли и Разрешения

ecKasse реализует детализированную систему контроля доступа с тремя предустановленными ролями:

#### **Manager (Менеджер)**
- **Полный доступ:** Все операции системы без ограничений
- **Разрешения:** `system.admin`, `pos.manage_all`, `users.manage`, `roles.manage`
- **Продукты:** Создание, редактирование, удаление всех товаров и категорий
- **Отчеты:** Доступ ко всем отчетам (`reports.view_all`, `reports.export`)
- **Кредит сторно:** 1000€ дневной лимит / 500€ экстренный лимит
- **Управление:** Может утверждать изменения и управлять пользователями

#### **Supervisor (Супервайзер)**
- **Смешанные права:** Операционный доступ + ограниченное управление
- **Разрешения:** `pos.operate`, `pos.manage_shift`, `products.edit`, `categories.edit`
- **Продукты:** Может редактировать существующие товары и категории
- **Отчеты:** Доступ к отчетам отдела (`reports.view_department`)
- **Кредит сторно:** 200€ дневной лимит / 100€ экстренный лимит
- **Управление:** Может утверждать ограниченные изменения (`changes.approve_limited`)

#### **Cashier (Кассир)**
- **Базовые операции:** Только работа с кассой
- **Разрешения:** `pos.operate`, `products.view`, `categories.view`
- **Продукты:** Только просмотр товаров и категорий
- **Отчеты:** Доступ только к собственным данным (`reports.view_own`)
- **Кредит сторно:** 50€ дневной лимит / 25€ экстренный лимит
- **Управление:** Может только запрашивать изменения (`changes.request`)

### Двухуровневая Система Управления

ecKasse внедряет уникальную **двухуровневую систему одобрения изменений** для критически важных операций:

#### **Уровень 1: Запрос Изменений**
```javascript
// Кассир/Супервайзер запрашивает изменение товара
{
  change_type: "product_update",
  requested_by_user_id: cashier.id,
  status: "pending",
  proposed_data: { price: 15.99, old_price: 12.99 },
  priority: "normal",
  reason: "Обновление цены согласно прайс-листу"
}
```

#### **Уровень 2: Одобрение Менеджером**
```javascript
// Менеджер рассматривает и одобряет
{
  status: "approved",
  reviewed_by_user_id: manager.id,
  reviewed_at: "2025-01-15T10:30:00Z",
  manager_notes: "Цена корректна, одобрено"
}
```

#### **Типы Контролируемых Изменений**
- **Товары:** Изменение цен, названий, налоговых категорий
- **Категории:** Создание, изменение, удаление категорий
- **Сторно:** Превышение кредитных лимитов пользователя
- **Настройки:** Изменения конфигурации системы
- **Пользователи:** Управление ролями и разрешениями

### Кредитная Система Сторно

Революционная **кредитная система** для управления возвратами и отменами чеков:

#### **Двойные Лимиты**
1. **Дневной лимит:** Максимальная сумма сторно за рабочий день
2. **Экстренный лимит:** Разовая операция без предварительного одобрения

#### **Автоматическое Управление**
```sql
-- Пример пользователя с лимитами
storno_daily_limit: 200.00,      -- €200 в день
storno_emergency_limit: 100.00,  -- €100 за раз
storno_used_today: 45.50         -- Уже использовано сегодня
```

#### **Процесс Одобрения Сторно**
1. **В пределах лимитов:** Автоматическое выполнение
2. **Превышение лимитов:** Создание запроса на одобрение менеджером
3. **Экстренные случаи:** Немедленное одобрение до экстренного лимита
4. **Суточный сброс:** Автоматическое обнуление счетчиков в полночь

#### **Система Доверия (Trust Score)**
- **100 баллов:** Максимальное доверие (Менеджер)
- **75 баллов:** Высокое доверие (Супервайзер)
- **50 баллов:** Стандартное доверие (Кассир)
- **Влияние:** Более высокий Trust Score = большие лимиты сторно

#### **Реализация в Коде**
```javascript
// Проверка лимитов сторно (transaction.service.js:190-220)
async performStorno(sessionId, transactionId, amount, reason, isEmergency) {
  const user = await this.validateUserLimits(sessionId, amount);
  
  if (amount <= user.available_daily && amount <= user.emergency_limit) {
    return this.executeStorno(transactionId, amount, reason);
  } else {
    return this.createStornoApprovalRequest(user, amount, reason);
  }
}
```

### Аутентификация и Безопасность

#### **PIN-Based Login**
- **Числовые PIN-коды:** Удобные для сенсорных экранов (по умолчанию: `1234`)
- **Визуальный выбор пользователя:** Кнопки с именами сотрудников
- **Сессионное управление:** JWT-токены с автоматическим истечением (8 часов)
- **Двухфакторная блокировка:** Блокировка после 5 неудачных попыток на 30 минут

#### **Система Аудита**
```javascript
// Каждое действие логируется
{
  user_id: 123,
  action: "product_price_change",
  old_value: 12.99,
  new_value: 15.99,
  timestamp: "2025-01-15T10:30:00Z",
  ip_address: "192.168.1.100",
  session_id: "uuid-session-token"
}
```

#### **Валидация Разрешений**
```javascript
// Проверка разрешений (auth.service.js:219-249)
async hasPermission(sessionId, permission) {
  const session = await this.validateSession(sessionId);
  return session.permissions.includes(permission) || 
         session.permissions.includes('system.admin');
}
```

### Данные Пользователей по Умолчанию

| Пользователь | Роль | PIN | Дневной Лимит | Экстренный Лимит |
|--------------|------|-----|---------------|------------------|
| `admin` | Manager | `1234` | €1000 | €500 |
| `cashier1` | Cashier | `1234` | €50 | €25 |
| `supervisor1` | Supervisor | `1234` | €200 | €100 |

## Development Guidelines

### Code Organization
- **Backend:** RESTful API design with LLM service layer
- **Frontend:** React hooks pattern with custom WebSocket management
- **Database:** Knex.js migrations for schema versioning
- **Logging:** Structured JSON logs via Pino

### LLM Integration Patterns
- Function declarations follow Google's official structure
- System context defines POS-specific behavior
- All product queries must use available tools
- Error recovery with model fallback chain

### Communication Protocol
```javascript
// Request format
{
  operationId: "uuid-v4",
  command: "ping_ws",
  payload: { data: "test" }
}

// Response format  
{
  operationId: "uuid-v4",
  status: "success|error|already_processed",
  payload: { /* response data */ },
  channel: "websocket|http"
}
```

## Fiscal Compliance

### German Requirements
- **TSE (Technical Security Equipment):** Required for all cash transactions
- **DSFinV-K:** Standardized export format for tax authorities
- **Time Synchronization:** Mandatory TSE clock verification on startup
- **Data Retention:** Long-term archival with cryptographic integrity

### Implementation Status
- ✅ Basic LLM integration with product management
- ✅ WebSocket/HTTP communication system
- ✅ SQLite database with migrations
- 🔄 TSE integration (planned)
- 🔄 DSFinV-K export (planned)
- 🔄 Hedera blockchain anchoring (planned)

## Distribution

### Free Version
- **License:** EUPL-1.2 (European Union Public Licence)
- **LLM:** Google Gemini Flash
- **Requirement:** User-provided Google API key (BYOK)
- **Database:** Local SQLite only

### Pro Version (Planned)
- **LLM:** Google Gemini Pro
- **Features:** Cloud sync, advanced reporting, priority support
- **Archival:** Qualified eIDAS timestamps
- **Pricing:** Subscription-based with transparent cost structure

## Contributing

### Areas of Need
1. **Fiscal Compliance:** International POS regulations expertise
2. **UI/UX:** Geometric tessellation interface improvements  
3. **Testing:** Real-world restaurant environment validation
4. **Documentation:** User guides and API documentation
5. **Localization:** Multi-language support and regional adaptations

### Development Setup
1. Fork repository
2. Set up development environment as above
3. Check GitHub Issues for "good first issue" labels
4. Submit pull requests with clear descriptions

### International Expansion
Currently focused on German market. Contributors needed for:
- 🇫🇷 France: Fiscal printer requirements
- 🇮🇹 Italy: RT compliance and fiscal memory
- 🇬🇧 UK: Making Tax Digital (MTD) requirements  
- 🇵🇱 Poland: JPK reporting and online registers
- 🇺🇸 USA: State-specific sales tax regulations

## License

Copyright 2025 Betruger Sp. z o.o.  
Original work by Dmytro Surovtsev

Licensed under the European Union Public Licence v. 1.2 (EUPL-1.2).  
See [LICENSE](LICENSE) for details.

## Links

- **Repository:** [github.com/xelth-com/eckasse](https://github.com/xelth-com/eckasse)
- **Documentation:** [eckasse.com](https://eckasse.com) (planned)
- **Issues:** [GitHub Issues](https://github.com/xelth-com/eckasse/issues)
- **Discussions:** [GitHub Discussions](https://github.com/xelth-com/eckasse/discussions)
