# ecKasse - AI-Powered Point of Sale System

![CI/CD Status](https://img.shields.io/badge/build-passing-brightgreen)
![Version](https://img.shields.io/badge/version-0.2.0-blue)
![License AGPL](https://img.shields.io/badge/license-AGPL--3.0-blue)
![License Commercial](https://img.shields.io/badge/license-Commercial-orange)

**ecKasse** is a modern, AI-powered Point of Sale (POS) system designed for German tax compliance (DSFinV-K) and maximum automation in restaurant operations. Built with a dual-licensing model supporting both open-source desktop and commercial multi-tenant web deployments.

---

## 🏗️ Architecture

ecKasse uses a **Core and Adapters** architecture with dual licensing:

### 📦 Open Source Components (AGPL v3)
- **`packages/core/`** - Business logic and domain models
- **`packages/adapters/`** - Infrastructure adapters (database, external services)
- **`packages/desktop/`** - Electron-based desktop application
- **`packages/shared-frontend/`** - Common UI components and utilities

### 🏢 Commercial Components
- **`packages/web/`** - Multi-tenant SaaS web application (Commercial License)

---

## 🚀 Key Features

### 🧠 AI-Powered Intelligence
* **Menu Parsing:** Automatically creates menus from uploaded images or text using LLM
* **Smart Recommendations:** AI-driven product suggestions and upselling
* **Natural Language Processing:** Voice commands and chat-based order taking

### 🇩🇪 German Tax Compliance
* **DSFinV-K Export:** Full compliance with German tax authority data export requirements
* **Fiscal Integration:** TSE (Technical Security Equipment) support
* **Audit Trail:** Complete transaction logging and reporting

### 🏪 Restaurant Operations
* **Order Management:** Table management, order tracking, kitchen display
* **Inventory Control:** Real-time stock tracking with low-stock alerts
* **Payment Processing:** Multiple payment methods and split billing
* **Receipt Printing:** Thermal printer support with custom templates

### 🔧 Technical Features
* **Real-time Updates:** WebSocket-based live updates across all clients
* **Offline Mode:** Works without internet connection (desktop version)
* **Multi-tenant:** Single codebase supporting multiple restaurants (web version)
* **Scalable Architecture:** Clean separation of concerns with adapter pattern

---

## 🛠️ Tech Stack

### Backend
![Node.js](https://img.shields.io/badge/-Node.js-339933?logo=node.dot.js&logoColor=white)
![Express.js](https://img.shields.io/badge/-Express.js-000000?logo=express&logoColor=white)
![Knex.js](https://img.shields.io/badge/-Knex.js-D26B38?logoColor=white)
![WebSocket](https://img.shields.io/badge/-WebSocket-010101?logoColor=white)

### Frontend
![Svelte](https://img.shields.io/badge/-Svelte-FF3E00?logo=svelte&logoColor=white)
![HTML5](https://img.shields.io/badge/-HTML5-E34F26?logo=html5&logoColor=white)
![CSS3](https://img.shields.io/badge/-CSS3-1572B6?logo=css3&logoColor=white)

### Desktop
![Electron](https://img.shields.io/badge/-Electron-47848F?logo=electron&logoColor=white)

### Database
![SQLite](https://img.shields.io/badge/-SQLite-003B57?logo=sqlite&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/-PostgreSQL-4169E1?logo=postgresql&logoColor=white)
![pgvector](https://img.shields.io/badge/-pgvector-4169E1?logoColor=white)

### AI/ML
![Google Gemini](https://img.shields.io/badge/-Google%20Gemini-4285F4?logoColor=white)

---

## 🏁 Getting Started

### Prerequisites

* **Node.js** (v20.x or higher)
* **npm** (latest version)
* **Database:** SQLite (desktop) or PostgreSQL v17+ (web, required for pgvector support)
* **AI API Key:** Google Gemini API key for AI features

### Desktop Installation (AGPL v3)

1. **Clone the repository:**
   ```bash
   git clone https://github.com/betruger/eckasse.git
   cd ecKasse
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Configure environment:**
   ```bash
   # Copy example environment file
   cp .env.example .env
   
   # Add your Gemini API key
   echo "GEMINI_API_KEY=your_api_key_here" >> .env
   ```

4. **Initialize database:**
   ```bash
   npm run migrate:backend
   npm run seed:backend
   ```

5. **Start desktop application:**
   ```bash
   npm run dev
   ```

### Web Deployment (Commercial License)

For multi-tenant web deployment, contact us at `licensing@eckasse.com` for commercial licensing options.

---

## 📁 Project Structure

```
ecKasse/
├── packages/
│   ├── core/                 # AGPL v3 - Business logic
│   │   ├── application/      # Use cases and services
│   │   ├── domain/          # Domain models and entities
│   │   └── db/              # Database migrations and seeds
│   ├── adapters/            # AGPL v3 - Infrastructure
│   │   ├── database/        # Database adapters
│   │   ├── external/        # External service integrations
│   │   └── ai/              # AI service adapters
│   ├── desktop/             # AGPL v3 - Desktop app
│   │   ├── electron/        # Electron main process
│   │   ├── server/          # Backend server
│   │   └── frontend/        # Desktop UI
│   ├── shared-frontend/     # AGPL v3 - Shared UI components
│   └── web/                 # Commercial - Multi-tenant web app
├── LICENSE                  # Dual license notice
├── LICENSE-AGPL-3.0        # Open source license
└── LICENSE-COMMERCIAL      # Commercial license terms
```

---

## 🤖 For AI Agent Operation

### Development Environment Setup

When working with AI agents (like Claude Code) on this project:

#### 1. Project Structure Understanding
* **Monorepo Architecture:** The project uses npm workspaces with multiple packages
* **Core Business Logic:** Located in `packages/core/` (domain models, use cases)
* **Infrastructure:** Located in `packages/adapters/` (database, external services)
* **Applications:** Desktop (`packages/desktop/`) and Web (`packages/web/`)

#### 2. Key Development Commands
```bash
# Start desktop development environment
npm run dev

# Run individual package commands
npm run dev:backend --workspace=@eckasse/desktop
npm run migrate:backend
npm run seed:backend

# Database operations
npx knex migrate:latest --knexfile packages/core/db/knexfile.js
npx knex seed:run --knexfile packages/core/db/knexfile.js
```

#### 3. Database Considerations
* **Desktop Version:** Uses SQLite with automatic migrations
* **Web Version:** Requires PostgreSQL v17+ for pgvector support
* **Vector Storage:** AI embeddings stored using pgvector extension

#### 4. AI Integration Points
* **Menu Parsing:** `packages/core/application/services/menu-parser.service.js`
* **LLM Service:** `packages/adapters/ai/gemini.adapter.js`
* **Vector Search:** `packages/adapters/database/vector.adapter.js`

#### 5. Configuration Files
* **Environment:** `.env` files in root and package directories
* **Database:** `packages/core/db/knexfile.js`
* **Build:** Individual `package.json` in each workspace

#### 6. Testing Strategy
```bash
# Run all tests
npm run test:all

# Lint all packages
npm run lint:all

# Format code
npm run format:all
```

#### 7. Deployment Notes
* **Desktop:** Built with Electron, distributed as executable
* **Web:** Requires Docker deployment with PostgreSQL v17+
* **Licensing:** Respect dual-license model (AGPL v3 for desktop, Commercial for web)

---

## 🤝 Partnership & Integration Opportunities

### 🖥️ Hardware Partners
We are seeking **hardware manufacturers** for our POS ecosystem:

**✅ Mobile PDA Solution - FOUND**
We've partnered with **[MovFast.com](https://movfast.com)** - offering unbeatable price-quality ratio for mobile PDA cash registers.

**🔍 SEEKING: Stationary POS Hardware**
- All-in-one POS terminals
- Touch screen displays (15" - 22")
- Competitive pricing for restaurant market
- Reliable build quality and warranty

**🔍 SEEKING: POS Printer Manufacturers** 
- Thermal receipt printers
- Kitchen display systems
- Label printers for orders
- Cost-effective solutions with driver support

**Contact us:** hardware@eckasse.com

### 💳 Payment Processing Partners
We are actively seeking **competitive payment card processing providers** to integrate into our POS system. If you offer:
- Competitive transaction fees
- Reliable API integration
- Multi-currency support
- Quick settlement times

**Contact us:** partnerships@eckasse.com

### 🇩🇪 TSE/TSS Integration (Deutsche Markt)
**Wir suchen die günstigsten Anbieter für TSE (Technische Sicherheitseinrichtung) und TSS (Technische Sicherheitssystem) Lösungen für den deutschen Markt.**

Wenn Sie Hersteller oder Anbieter sind von:
- **TSE-Hardware** mit wettbewerbsfähigen Preisen
- **TSS-Software** mit einfacher API-Integration
- **Cloud-TSE** Lösungen mit niedrigen laufenden Kosten
- **Zertifizierte Lösungen** nach KassenSichV

**Kontakt:** deutschland@eckasse.com

### 🌍 International Expansion Partners
We are looking for **international partners** to adapt ecKasse for different countries' fiscal regulations on **mutually beneficial terms**.

**Ideal Partners:**
- Local POS system integrators
- Fiscal compliance consultants  
- Software development companies
- Restaurant technology providers

**Partnership Models:**
- Revenue sharing agreements
- Joint development projects
- Regional licensing deals
- White-label solutions

**Countries of Interest:**
- European Union (fiscal compliance adaptation)
- United States (tax regulation compliance)
- Canada (provincial tax systems)
- Australia & New Zealand (GST integration)

**Contact us:** international@eckasse.com