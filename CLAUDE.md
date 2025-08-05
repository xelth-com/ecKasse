# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

ecKasse is an LLM-powered Point of Sale (POS) system built as an Electron desktop application. The project was recently refactored from React to vanilla HTML/CSS/JavaScript to eliminate unnecessary complexity while maintaining all functionality.

## Architecture

### Unified Backend Design
- **Single Express.js server** serves both API endpoints and static frontend files
- **Port 3030**: Backend handles both `/api/*` routes and static file serving
- **WebSocket + HTTP fallback**: Dual communication channels with shared `operationId` system
- **SQLite database**: Local storage with Knex.js migrations

### Technology Stack
- **Frontend**: Vanilla HTML/CSS/JavaScript (migrated from React)
- **Backend**: Node.js with Express.js
- **Desktop**: Electron wrapper
- **Database**: SQLite with Knex.js
- **LLM**: Google Gemini integration via @google/genai
- **Logging**: Pino structured logging

## Development Commands

### Core Development
```bash
# Start complete development environment (backend + Electron)
npm run dev

# Start backend only (serves API + static files on port 3030)  
npm run dev:backend

# Database operations
npm run migrate:backend    # Run database migrations
npm run seed:backend      # Seed development data
```

### Build and Distribution
```bash
# Build Electron application
npm run build:client:desktop

# Create distributable package
npm run dist:client:desktop

# Platform-specific builds (Windows)
npm run package-win
```

### Code Quality
```bash
# Lint all workspaces
npm run lint:all

# Format all code
npm run format:all

# Run tests (when available)
npm run test:all
```

## Key Architecture Patterns

### Communication Protocol
All operations use UUID-based `operationId` for idempotency across WebSocket and HTTP channels:

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

### WebSocket Management
Located in `/packages/client-desktop/src/renderer/public/websocket.js`:
- Custom WebSocketManager class with EventEmitter pattern
- Automatic request timeout handling (3 seconds)
- Promise-based request/response with operationId tracking
- Fallback to HTTP when WebSocket fails

### LLM Integration
Located in `/packages/backend/src/services/llm.service.js`:
- **LangChain ReAct Agent** with Google Gemini integration
- **Dynamic Tools** for database operations (findProduct, createProduct, createCategory)
- **Real-time POS management** through natural language commands
- **SQLite integration** via Knex.js for direct database manipulation
- **Conversation history** maintenance for context-aware interactions

### Static File Serving
Backend Express app serves frontend files:
- Static files from `/packages/client-desktop/src/renderer/public/`
- Catch-all route returns `index.html` for non-API requests
- API routes prefixed with `/api/` to avoid conflicts

## Monorepo Structure

```
packages/
├── backend/                    # Express.js API server
│   ├── src/
│   │   ├── config/logger.js   # Pino logging configuration
│   │   ├── controllers/       # API endpoint handlers
│   │   ├── services/          # Business logic (LLM service)
│   │   ├── routes/            # Express route definitions
│   │   ├── db/                # Knex migrations and seeds
│   │   ├── app.js             # Express app setup + static serving
│   │   └── server.js          # HTTP + WebSocket server
│   └── package.json
└── client-desktop/             # Electron wrapper
    ├── electron/
    │   ├── main.js             # Electron main process
    │   └── preload.js          # IPC bridge
    ├── src/renderer/
    │   └── public/             # Static frontend files
    │       ├── index.html      # Main HTML file
    │       ├── app.js          # Main application logic
    │       ├── websocket.js    # WebSocket management
    │       └── styles.css      # Application styles
    └── package.json
```

## Environment Configuration

Required `.env` file in project root:
```env
GEMINI_API_KEY=your_google_gemini_api_key
BACKEND_PORT=3030
NODE_ENV=development
LOG_LEVEL=debug
DB_FILENAME=./packages/backend/src/db/eckasse_dev.sqlite3
```

## Development Guidelines

### Frontend Development
- All static files in `/packages/client-desktop/src/renderer/public/`
- No build process required - files served directly by backend
- WebSocket communication with HTTP fallback
- UUID generation for operationId (using custom implementation)

### Backend Development  
- Express.js app in `/packages/backend/src/app.js`
- All routes prefixed with `/api/`
- Structured logging with Pino
- operationId deduplication for both HTTP and WebSocket
- Static file serving integrated into same Express instance

### LLM Integration
- Function declarations follow Google's official structure
- All product queries must use available tool functions
- System context defines POS-specific behavior
- Error recovery with model fallback chain

### Database Operations
- Use Knex.js migrations for schema changes
- Seed files for development data
- SQLite for local storage (with future cloud sync planned)

## Testing LLM Features

1. Start development: `npm run dev`
2. Electron app launches automatically
3. Test areas:
   - WebSocket Ping/HTTP Fallback section
   - Gemini Ping-Pong Test section

### LangChain Agent Testing
The AI agent can now perform real database operations:

**Product Search:**
- "Найди товар Кофе" (Find product Coffee)
- "Покажи товар Пицца" (Show product Pizza)

**Category Creation:**
- "Создай категорию Напитки типа drink" (Create category Drinks of type drink)
- "Добавь категорию Основные блюда типа food" (Add category Main dishes of type food)

**Product Creation:**
- "Создай товар Эспрессо цена 2.50 категория Напитки" (Create product Espresso price 2.50 category Drinks)
- "Добавь товар Капучино за 3.00 в категорию Напитки" (Add product Cappuccino for 3.00 in category Drinks)

**Prerequisites:**
- Ensure database is migrated: `npm run migrate:backend`
- Categories must exist before creating products
- Agent will guide you through missing requirements

## Node.js Version Compatibility

Backend includes version checking for Node.js v20+ compatibility:
- Current development uses Node.js v20.19.0
- Compatible with v24+ for future upgrades
- Version warnings logged on startup if < v20

## Fiscal Compliance Context

This POS system is designed for German fiscal compliance:
- TSE (Technical Security Equipment) integration planned
- DSFinV-K export format for tax authorities
- Long-term archival with cryptographic integrity (daily Hedera blockchain anchoring for audit trail consistency)
- Currently in development phase for basic functionality

## Critical Implementation Notes

### Project Migration Status
- The project **has been migrated** from React to vanilla HTML/CSS/JavaScript
- The README.md may contain outdated references to React - ignore these
- The actual implementation uses vanilla JS served directly by the Express backend
- No build process is required for the frontend

### LLM Service Architecture
- **LangChain ReAct Agent** with `gemini-1.5-flash` model
- **Three Dynamic Tools** for POS system management:
  - `findProduct`: Search products by name in database
  - `createProduct`: Create new products with category linking
  - `createCategory`: Create new product categories (food/drink)
- **Real database integration** via Knex.js (no hardcoded data)
- **Conversation history** maintained between requests
- **Error handling** with graceful fallbacks

### WebSocket Implementation Details
- Custom `WebSocketManager` class with EventEmitter pattern
- 3-second timeout for WebSocket requests
- Promise-based request/response mapping via operationId
- Automatic HTTP fallback when WebSocket fails
- UUID generation using custom implementation (not crypto.randomUUID)

### Backend Request Handling
- Dual operationId tracking for both HTTP and WebSocket (separate Sets)
- 60-second TTL for operationId deduplication
- Structured logging with Pino for all requests/responses
- Static file serving integrated into same Express instance

# important-instruction-reminders
Do what has been asked; nothing more, nothing less.
NEVER create files unless they're absolutely necessary for achieving your goal.
ALWAYS prefer editing an existing file to creating a new one.
NEVER proactively create documentation files (*.md) or README files. Only create documentation files if explicitly requested by the User.