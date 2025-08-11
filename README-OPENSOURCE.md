# ecKasse - Open Source POS System

[\![MIT License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[\![Node.js](https://img.shields.io/badge/Node.js-20+-blue.svg)](https://nodejs.org/)

ecKasse is a modern, LLM-powered Point of Sale system built with a Core and Adapters architecture. This open-source version provides a complete desktop POS solution using SQLite for local data storage.

## 🚀 Features

- **Modern Architecture**: Core business logic with pluggable adapters
- **LLM Integration**: Google Gemini-powered natural language POS operations
- **Desktop App**: Electron-based desktop application
- **Shared Components**: Reusable UI components and utilities
- **SQLite Database**: Local data storage with migrations and seeding
- **German Fiscal Compliance**: Built for German tax requirements (TSE, DSFinV-K)

## 📁 Project Structure

```
packages/
├── core/                    # Business logic and domain models (MIT)
├── adapters/               # Database and infrastructure adapters (MIT)
├── desktop/                # Electron desktop application (MIT)
└── shared-frontend/        # Shared UI components and utilities (MIT)
```

## 🛠 Development Setup

### Prerequisites

- Node.js 20+ 
- npm 10+
- Git

### Installation

1. Clone the repository:
```bash
git clone https://github.com/your-org/eckasse-desktop.git
cd eckasse-desktop
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables:
```bash
cp .env.example .env
# Edit .env with your configuration
```

4. Run database migrations:
```bash
npm run migrate:backend
```

5. Seed development data:
```bash
npm run seed:backend
```

### Development Commands

```bash
# Start desktop application in development mode
npm run dev

# Start backend only
npm run dev:backend

# Build desktop application
npm run build:client:desktop

# Run linting
npm run lint:all

# Format code
npm run format:all
```

## 🏗 Architecture

ecKasse uses a **Core and Adapters** architecture:

- **Core Package**: Contains all business logic, domain models, and use cases
- **Adapters Package**: Infrastructure implementations (database, auth, storage)
- **Desktop Package**: Electron application using SQLite adapter
- **Shared Frontend**: Reusable UI components and Svelte stores

This architecture enables clean separation of concerns and makes the codebase maintainable and testable.

## 🤖 LLM Integration

The system integrates with Google Gemini for natural language POS operations:

- **Natural Language Commands**: "Create product Coffee price 2.50"
- **Dynamic Tools**: Database operations via LLM function calling
- **Conversation Context**: Maintains context across interactions
- **Error Recovery**: Graceful handling of LLM failures

## 🗃 Database

Uses SQLite for local data storage with:

- **Knex.js**: Query builder and migrations
- **Structured Schema**: Products, categories, transactions, logs
- **Data Seeding**: Sample data for development
- **Backup Support**: Built-in backup and restore

## 🧪 Testing

```bash
# Run all tests
npm run test:all

# Run tests for specific package
npm run test --workspace=@eckasse/core
```

## 📦 Building and Distribution

```bash
# Build for current platform
npm run build:client:desktop

# Create distributable package
npm run dist:client:desktop

# Windows-specific build
npm run package-win
```

## 🤝 Contributing

We welcome contributions\! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🌟 Commercial Version

A multi-tenant SaaS version of ecKasse is available commercially. Contact us for more information about enterprise features and cloud deployment options.

## 📞 Support

- 📖 [Documentation](https://docs.eckasse.com)
- 💬 [Community Discord](https://discord.gg/eckasse)
- 🐛 [Issue Tracker](https://github.com/your-org/eckasse-desktop/issues)
- 📧 Email: opensource@eckasse.com

---

Built with ❤️ by the ecKasse team
EOF < /dev/null
