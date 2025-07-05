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
- Google Gemini function calling for direct API execution
- Multi-model fallback chain (Flash 2.5 → Flash 2.0 → Flash 1.5)
- Product management functions with proper tool declaration
- Conversation history maintenance for context

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
4. Example Gemini queries:
   - "What are the details for product ID 123?"
   - "Tell me about the Super Widget product"

## Node.js Version Compatibility

Backend includes version checking for Node.js v20+ compatibility:
- Current development uses Node.js v20.19.0
- Compatible with v24+ for future upgrades
- Version warnings logged on startup if < v20

## Fiscal Compliance Context

This POS system is designed for German fiscal compliance:
- TSE (Technical Security Equipment) integration planned
- DSFinV-K export format for tax authorities
- Long-term archival with cryptographic integrity
- Currently in development phase for basic functionality