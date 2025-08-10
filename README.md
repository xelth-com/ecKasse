# ecKasse - LLM-Powered Point of Sale System

> ### Eine Kasse, die hilft – nicht kostet.
> #### KI-Technologie zum Selbstkostenpreis – für mehr Zeit mit Ihren Gästen.

**Status:** In Development | **License:** EUPL-1.2 | **Developer:** Betruger Sp. z o.o.

LLM-powered desktop POS system built with Electron, Svelte, and Node.js. Features natural language configuration via Google Gemini and German fiscal compliance (TSE/DSFinV-K).

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
│       ├── src/renderer/       # Svelte application
│       │   ├── src/
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
APP_MODE=production
LOG_LEVEL=debug
DB_FILENAME=./packages/backend/src/db/eckasse_dev.sqlite3
```

### Development Commands
```bash
# Start all services (backend + React + Electron)
npm run dev

# Individual services
npm run dev:backend          # Backend API only
npm run dev:client:svelte  # Svelte dev server only

# Database management
npm run migrate:backend      # Run database migrations
npm run seed:backend        # Seed development data

# Production builds
npm run build:client:desktop # Build Electron app
npm run dist:client:desktop  # Create distributable package
```

## Operating Modes: Production vs. Demo

ecKasse supports two distinct operating modes, controlled via the `APP_MODE` environment variable:

### Production Mode (`APP_MODE=production`) - Default
**Use Case:** Real-world cafe/restaurant deployment

- **Data Storage:** Shared SQLite database
- **User Sessions:** All users share the same backend state
- **Transaction Management:** Persistent database transactions
- **Fiscal Compliance:** Full TSE/DSFinV-K integration
- **Configuration:** Standard deployment for actual business operations

### Demo Mode (`APP_MODE=demo`)
**Use Case:** Public web demonstrations, customer trials, development testing

- **Data Storage:** Isolated in-memory sessions per user
- **User Sessions:** Each visitor gets their own "sandbox" environment
- **Transaction Management:** Session-based, automatically cleaned up
- **Session Isolation:** Actions by one user don't affect other users
- **Auto-cleanup:** Sessions expire after 24 hours of inactivity

### Configuration

Add to your `.env` file:
```env
# Set operating mode
APP_MODE=production    # Default: shared database state
# APP_MODE=demo        # Isolated user sessions
```

### Technical Implementation

**Production Mode:**
- All requests use the shared SQLite database
- Standard authentication and user management
- Persistent data across application restarts

**Demo Mode:**
- Session middleware creates unique session IDs via `X-Session-ID` headers
- In-memory session manager stores user-specific data
- WebSocket and HTTP clients automatically manage session persistence
- Each demo user experiences an independent POS system instance

### Use Cases

**Production Mode:**
- Installing ecKasse in a real restaurant/cafe
- Multiple staff members using the same system
- Persistent transaction history and reporting needed

**Demo Mode:**
- Hosting public web demos for potential customers
- Allowing users to upload their own menus and test the system
- Trade shows and product demonstrations
- Development and testing without affecting production data

### Session Management (Demo Mode)

The system automatically handles session creation and management:
- First request without session ID → Creates new session, returns `X-Session-ID` header
- Subsequent requests with session ID → Uses existing session data
- Frontend automatically persists session ID in localStorage
- Sessions automatically expire and clean up unused memory

This architecture enables seamless public demonstrations where multiple users can simultaneously experience ecKasse without interfering with each other's data.

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
- **Error Handling:** Multi-model fallback (Gemini 2.5 Flash → Gemini 2.0 Flash)

### WebSocket + HTTP Fallback
Located in `packages/client-desktop/src/renderer/src/lib/wsStore.js`

- **Primary:** WebSocket for real-time communication
- **Fallback:** HTTP requests with same operationId
- **Idempotency:** UUID-based operation tracking prevents duplicates


## Development Guidelines

### Code Organization
- **Backend:** RESTful API design with LLM service layer
- **Frontend:** Svelte stores pattern with custom WebSocket management
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

### Архивирование с самовосстановлением (Self-Healing Archives)

Для обеспечения максимальной сохранности фискальных данных, ecKasse внедряет многоуровневую систему архивации с возможностью автоматического восстановления поврежденных записей.

- **Избыточность данных**: Ежедневные архивы создаются с использованием **кодов Рида-Соломона**. Эта технология (аналогичная той, что используется в QR-кодах и на CD-дисках) позволяет полностью восстановить несколько поврежденных записей за день без необходимости прибегать к резервной копии.
- **Целостность**: Каждый архив проверяется с помощью **SHA-256 хешей**, что гарантирует невозможность незаметного изменения данных.
- **Сжатие**: Для минимизации занимаемого места на диске используется компрессия данных (`zlib`).

Этот подход обеспечивает исключительно высокий уровень защиты от сбоев оборудования и повреждения данных, что критически важно для соответствия фискальным требованиям.

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

## Printer Auto-Configuration System

ecKasse includes a comprehensive printer management system that automatically discovers, identifies, and configures thermal receipt printers on your network. The system supports both DHCP-assigned and static IP configurations with robust fallback mechanisms.

### Architecture

#### Core Components

**System Tools** (`packages/backend/src/utils/printers/system_tools.js`)
- Network discovery via TCP port scanning (port 9100)
- Two-step printer identification with detailed logging
- USB printer detection and configuration
- Local IP management for static printer discovery

**Driver Modules** (`packages/backend/src/utils/printers/drivers/`)
- Modular driver system for different printer models
- Currently supports: HPRT TP80K and Xprinter XP-V330L
- Standardized interface for easy extension

**Core Controller** (`packages/backend/src/utils/printers/core_controller.js`)
- Multi-layered discovery strategy:
  1. Network scanning (DHCP-assigned IPs)
  2. Known static IP addresses
  3. USB discovery and configuration
- Intelligent IP configuration management

**Printer Service** (`packages/backend/src/services/printer_service.js`)
- Configuration persistence via JSON storage
- High-level API for printer management
- Integration with main application lifecycle

#### Communication Protocol

The system uses a robust two-step identification process:

1. **Primary**: ESC/POS command `GS I 1` (0x1D, 0x49, 0x01)
2. **Fallback**: Direct enquiry `DLE EOT 1` (0x10, 0x04, 0x01)

All communication includes detailed hex logging for debugging:
```javascript
// Example log output
[SystemTools] Sending GS I 1 command: [0x1d, 0x49, 0x01]
[SystemTools] Received data (15 bytes): [0x48, 0x50, 0x52, 0x54, ...]
[SystemTools] ASCII interpretation: "HPRT TP80K v2.1"
```

### API Usage

#### REST Endpoints

**Start Printer Discovery**
```bash
POST /api/printers/discover
Content-Type: application/json

{
  "networkRange": "192.168.0.0/24"  // Optional: manual network range
}

# Response: 202 Accepted
{
  "message": "Printer discovery process started."
}
```

**Get Configured Printers**
```bash
GET /api/printers

# Response: 200 OK
[
  {
    "model": "HPRT_TP80K",
    "manufacturer": "HPRT", 
    "ip": "192.168.0.130",
    "port": { "type": "LAN", "ip": "192.168.0.130" },
    "configuredAt": "2025-01-10T14:30:25.123Z"
  }
]
```

#### Programmatic Usage

```javascript
const printerService = require('./services/printer_service');

// Initialize printer service
await printerService.loadPrinters();

// Start auto-configuration
const options = { networkRange: '192.168.1.0/24' };
await printerService.startAutoConfiguration(options);

// Get configured printers
const receiptPrinter = printerService.getPrinterByRole('receipts');
```

### Testing

#### Command Line Testing

**Basic Network Scan**
```bash
# Auto-detect local networks
npm run test:printers

# Manual network range
npm run test:printers -- 192.168.0.0/24
```

**Test Output Example**
```bash
🧪 Starting printer system test with manual network range: 192.168.0.0/24

[Step 0] Clearing configuration file for clean test...
Configuration file cleared successfully.

[Step 1] Loading printer service...
Printer service loaded. Current printers: []

[Step 2] Starting auto-configuration process...
[SystemTools] Scanning specified network range: 192.168.0.0/24
[SystemTools] Found potential printer at 192.168.0.130 on manual (response time: 12ms)
[SystemTools] Starting network printer identification at 192.168.0.130:9100...
[SystemTools] Sending GS I 1 command: [0x1d, 0x49, 0x01]
[SystemTools] Received data (15 bytes): [0x48, 0x50, 0x52, 0x54, 0x20, 0x54, 0x50, 0x38, 0x30, 0x4b, 0x20, 0x76, 0x32, 0x2e, 0x31]
[HPRT Module] ✅ Device identified as HPRT printer
[SystemTools] Using existing DHCP IP for configuration: 192.168.0.130
[SystemTools] Printing test receipt...

✅ Found configured receipt printer:
{
  "model": "HPRT_TP80K",
  "manufacturer": "HPRT",
  "ip": "192.168.0.130",
  "configuredAt": "2025-01-10T14:30:25.123Z"
}

🎉 Test finished successfully!
```

#### Integration Testing

The system includes comprehensive integration tests via the test script:
- Configuration file cleanup for clean test environments
- Multi-network discovery validation
- Driver identification accuracy testing  
- Configuration persistence verification

### Extending the System

#### Adding New Printer Drivers

Create a new driver module in `packages/backend/src/utils/printers/drivers/`:

```javascript
// example_printer_driver.js
module.exports = {
  // Identity Information
  modelName: 'EXAMPLE_PRINTER_X100',
  manufacturer: 'ExampleCorp',

  // Default network configuration
  getDefaultLanConfig: () => ({
    ip: '192.168.123.100',
    cashRegisterTempIp: '192.168.123.101', 
    subnet: '255.255.255.0'
  }),

  // Printer identification method
  identify: async (port) => {
    const systemTools = require('../system_tools');
    const identityResult = await systemTools.getPrinterIdentity(port);
    
    if (identityResult.status === 'SUCCESS') {
      return identityResult.data.toUpperCase().includes('EXAMPLE');
    } else if (identityResult.status === 'NO_RESPONSE') {
      return true; // Best-effort guess
    }
    return false;
  },

  // IP configuration command
  getSetIpCommand: (newIp) => {
    const command = Buffer.from([0x1B, 0x40, 0x1B, 0x5B, 0x53]); // Example command
    const ipBytes = Buffer.from(newIp.split('.').map(n => parseInt(n, 10)));
    return Buffer.concat([command, ipBytes]);
  },

  // Restart delay after IP change
  getRestartDelay: () => 10000 // 10 seconds
};
```

#### Driver Registration

Add your driver to the printer service in `packages/backend/src/services/printer_service.js`:

```javascript
// Load printer driver modules
const drivers = [
  require('../utils/printers/drivers/hprt_tp80k'),
  require('../utils/printers/drivers/xprinter_xp_v330l'),
  require('../utils/printers/drivers/example_printer_driver') // Add your driver
];
```

#### Testing New Drivers

1. Place your printer on the network
2. Run the test script with your network range:
   ```bash
   npm run test:printers -- 192.168.1.0/24
   ```
3. Check the identification logs to verify correct detection
4. Validate configuration persistence in `packages/backend/src/config/printers.json`

### Configuration Files

#### Printer Storage

Configured printers are stored in `packages/backend/src/config/printers.json`:

```json
[
  {
    "id": "printer_1",
    "model": "HPRT_TP80K",
    "manufacturer": "HPRT",
    "ip": "192.168.0.130",
    "port": {
      "type": "LAN",
      "ip": "192.168.0.130"
    },
    "role": "receipts",
    "configuredAt": "2025-01-10T14:30:25.123Z",
    "lastTestPrint": "2025-01-10T14:30:30.456Z"
  }
]
```

#### Environment Variables

Add to your `.env` file for printer-specific configuration:

```env
# Printer system settings (optional)
PRINTER_DISCOVERY_TIMEOUT=5000    # Network scan timeout in ms
PRINTER_IDENTIFICATION_TIMEOUT=3000 # Command response timeout in ms
PRINTER_CONFIG_PATH=./packages/backend/src/config/printers.json
```

### Troubleshooting

#### Common Issues

**No Printers Found**
- Verify printer is connected to network and powered on
- Check firewall settings for port 9100 access
- Try manual network range specification: `npm run test:printers -- 192.168.1.0/24`

**Identification Failures**
- Check printer compatibility with ESC/POS commands
- Review identification logs for communication errors
- Verify printer IP address accessibility via `ping`

**Configuration Not Persisting**
- Check write permissions for configuration directory
- Verify JSON syntax in configuration file
- Review application logs for serialization errors

#### Debug Logging

Enable detailed logging by setting LOG_LEVEL in your `.env`:

```env
LOG_LEVEL=debug
```

This provides comprehensive information about:
- Network scanning progress and results
- Raw printer communication (hex dumps)
- Driver identification decision logic
- Configuration persistence operations

### Security Considerations

#### Network Security
- Printer discovery only scans port 9100 (standard RAW printing port)
- No credentials or sensitive data transmitted during identification
- Local network access required (no internet communication)

#### Configuration Security  
- Printer configurations stored locally in JSON format
- No remote configuration management or cloud dependencies
- IP address changes logged with timestamps for audit trails

The printer auto-configuration system provides a robust, extensible foundation for thermal printer integration in commercial POS environments, with comprehensive logging and testing capabilities for reliable operation.

## Links

- **Repository:** [github.com/xelth-com/eckasse](https://github.com/xelth-com/eckasse)
- **Documentation:** [eckasse.com](https://eckasse.com) (planned)
- **Issues:** [GitHub Issues](https://github.com/xelth-com/eckasse/issues)
- **Discussions:** [GitHub Discussions](https://github.com/xelth-com/eckasse/discussions)
