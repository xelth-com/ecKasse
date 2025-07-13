# ecKasse - LLM-Powered Point of Sale System

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
- **Long-term Archival:** Hedera blockchain anchoring
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
