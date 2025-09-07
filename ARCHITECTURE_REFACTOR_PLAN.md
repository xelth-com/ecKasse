# Architecture Refactor Plan: Core and Adapters Pattern

This document provides a complete, actionable specification for refactoring ecKasse from a monolithic desktop application to a hybrid open/closed source architecture supporting both desktop and multi-tenant web deployments.

## Architecture: Core and Adapters

### Executive Summary

**Goal**: Transform ecKasse into a "Core and Adapters" architecture enabling:
1. **Open Source Desktop Version** (AGPL v3) - SQLite-based, single-tenant POS
2. **Closed Source Web Version** (Commercial License) - PostgreSQL-based, multi-tenant SaaS

### Current State (Pre-Refactor)
```
/home/xelth/ecKasse/
├── packages/
│   ├── backend/                    # Express.js server (port 3030)
│   │   ├── src/
│   │   │   ├── services/llm.service.js  # LangChain ReAct Agent
│   │   │   ├── controllers/         # API endpoints
│   │   │   ├── routes/              # Express routes
│   │   │   ├── db/                  # SQLite + Knex migrations
│   │   │   ├── app.js               # Express + static serving
│   │   │   └── server.js            # HTTP + WebSocket server
│   │   └── package.json
│   └── client-desktop/             # Electron wrapper
│       ├── electron/main.js        # Electron main process
│       └── src/renderer/public/    # Vanilla HTML/CSS/JS frontend
└── .env                            # GEMINI_API_KEY, etc.
```

### Target State (Post-Refactor)
```
/home/xelth/ecKasse/
├── packages/
│   ├── core/                       # AGPL v3 - Shared business logic
│   │   ├── domain/                 # Entities, value objects, domain services
│   │   ├── application/            # Use cases, ports (interfaces)
│   │   ├── shared/                 # UUID, logging, validation utilities
│   │   └── llm/                    # LangChain agent abstraction
│   ├── adapters/                   # AGPL v3 - Infrastructure adapters
│   │   ├── database/
│   │   │   ├── sqlite/            # Desktop SQLite implementation
│   │   │   └── postgresql/        # Web PostgreSQL implementation
│   │   ├── auth/                  # Local vs JWT authentication
│   │   └── storage/               # Local vs cloud file storage
│   ├── desktop/                    # AGPL v3 - Open source desktop app
│   │   ├── electron/              # Electron wrapper
│   │   ├── frontend/              # Desktop-specific UI
│   │   └── server/                # Express + SQLite adapter
│   ├── web/                        # Commercial License - Closed source web app
│   │   ├── frontend/              # Multi-tenant web UI
│   │   ├── server/                # Express + PostgreSQL adapter
│   │   └── multi-tenant/          # Tenant isolation logic
│   └── shared-frontend/            # AGPL v3 - Common UI components
│       ├── components/            # Reusable UI elements
│       ├── styles/                # Shared CSS
│       └── utils/                 # Frontend utilities
├── .env                            # Environment configuration
├── .gitignore                      # Excludes web/ from open source
└── LICENSE-DUAL                    # Dual licensing explanation
```

## Agent Operational Distinction

### Local Development Agent Context

**When working in LOCAL development environment** (`/home/xelth/ecKasse/`):

#### Available Commands:
```bash
# Core development (works on full monorepo)
npm run dev                    # Start backend + Electron desktop
npm run dev:backend           # Start backend only (port 3030)
npm run migrate:backend       # Run SQLite migrations
npm run seed:backend          # Seed development data

# Build commands (desktop focus)
npm run build:client:desktop  # Build Electron app
npm run dist:client:desktop   # Create distributable
npm run package-win           # Windows-specific build

# Code quality (entire monorepo)
npm run lint:all              # Lint all packages
npm run format:all            # Format all code
```

#### Local Agent Responsibilities:
- **Full repository access** including `packages/web/` (closed source parts)
- **Development and testing** of both desktop and web components
- **Refactoring and architectural changes** across all packages
- **Database operations** on SQLite development database
- **LLM integration testing** with Gemini API
- **Code migration** from current structure to new architecture

#### Local Agent Prohibited Actions:
- **Git commits to main branch** without explicit user approval
- **Pushing web/ package contents** to public repositories
- **Modifying licensing files** without explicit instruction
- **Publishing packages** to npm registry

### Remote/Production Agent Context

**When working in REMOTE deployment environment**:

#### Desktop Deployment Agent:
```bash
# Available in open source repository
git clone https://github.com/user/eckasse-desktop.git
npm install
npm run build:desktop
npm run start:desktop

# Desktop-specific commands
npm run migrate:sqlite        # SQLite migrations only
npm run backup:sqlite         # Backup local database
npm run export:dsfinv         # German fiscal export
```

#### Web Deployment Agent:
```bash
# Available in private repository only
git clone https://github.com/company/eckasse-web-private.git
npm install
npm run build:web
npm run start:web

# Web-specific commands  
npm run migrate:postgresql    # PostgreSQL migrations
npm run tenant:create         # Create new tenant
npm run tenant:migrate        # Migrate tenant data
npm run scale:horizontal      # Scale web instances
```

#### Production Agent Responsibilities:
- **Environment-specific deployment** only (desktop OR web, not both)
- **Configuration management** for deployment environment
- **Health monitoring** and performance optimization
- **Security updates** and vulnerability patching
- **Database operations** for specific deployment type only

#### Production Agent Prohibited Actions:
- **Cross-environment operations** (web agent cannot modify desktop deployment)
- **Source code modification** (deployments use pre-built packages)
- **License changes** or redistribution
- **Direct database access** outside of migration scripts

### Agent Detection and Switching

**Environment Detection Logic**:
```javascript
// packages/core/shared/environment.js
const getEnvironmentContext = () => {
  const context = {
    isLocal: process.env.NODE_ENV === 'development',
    isDesktopDeployment: process.env.DEPLOYMENT_MODE === 'desktop',
    isWebDeployment: process.env.DEPLOYMENT_MODE === 'web',
    hasWebPackage: fs.existsSync('./packages/web'),
    hasDesktopPackage: fs.existsSync('./packages/desktop')
  };
  
  return {
    agentType: context.isLocal ? 'local-dev' : 
               context.isDesktopDeployment ? 'desktop-prod' : 'web-prod',
    availablePackages: [
      context.hasDesktopPackage ? 'desktop' : null,
      context.hasWebPackage ? 'web' : null,
      'core', 'adapters', 'shared-frontend'
    ].filter(Boolean)
  };
};
```

## Repository & Snapshot Management

### Git Repository Strategy

#### Single Repository with Selective Distribution

**Primary Repository** (`/home/xelth/ecKasse/`):
- **Contains**: Full monorepo with all packages
- **Access**: Private during development, selective open sourcing
- **Branches**: 
  - `main` - Full development branch
  - `open-source` - Filtered branch excluding `packages/web/`
  - `release/desktop-v*` - Desktop release branches
  - `release/web-v*` - Web release branches (private)

#### Git Filter Strategy for Open Source

**Creating Open Source Branch**:
```bash
# LOCAL AGENT ONLY - Create filtered open source branch
git checkout -b open-source
git filter-branch --subdirectory-filter packages/core --subdirectory-filter packages/adapters \
  --subdirectory-filter packages/desktop --subdirectory-filter packages/shared-frontend \
  --prune-empty --tag-name-filter cat -- --all

# Remove web package references
find . -name "*.json" -exec sed -i 's/"@eckasse\/web"[^,]*,*//g' {} \;
git add -A && git commit -m "Remove web package dependencies for open source"
```

**Automated Open Source Sync**:
```bash
# packages/scripts/sync-open-source.js
const syncOpenSource = async () => {
  // 1. Copy allowed packages to temp directory
  // 2. Remove commercial references from package.json files  
  // 3. Update README.md to open source version
  // 4. Create clean git history for open source components
  // 5. Push to public repository
};
```

### Dual Licensing Structure

**License Files Strategy**:

**Root LICENSE (Development)**:
```
DUAL LICENSE NOTICE

This repository contains both open source and proprietary components:

Open Source Components (AGPL v3):
- packages/core/
- packages/adapters/  
- packages/desktop/
- packages/shared-frontend/

Proprietary Components (Commercial License):
- packages/web/

See LICENSE-AGPL-3.0 and LICENSE-COMMERCIAL for full terms.
```

**LICENSE-AGPL-3.0** (Open Source Components):
```
AGPL v3

Copyright (c) 2025 ecKasse Contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

[Standard AGPL v3 text]
```

**LICENSE-COMMERCIAL** (Web Components):
```
COMMERCIAL LICENSE

The software components in packages/web/ are proprietary and confidential.

This software is licensed for internal use only. Distribution, modification,
or reverse engineering is strictly prohibited without written permission.

Contact: licensing@company.com
```

### Package Distribution Strategy

#### Desktop Distribution (Open Source)

**Public NPM Packages**:
```json
// Publishable open source packages
{
  "@eckasse/core": "^1.0.0",
  "@eckasse/adapters": "^1.0.0", 
  "@eckasse/desktop": "^1.0.0",
  "@eckasse/shared-frontend": "^1.0.0"
}
```

**Desktop package.json**:
```json
{
  "name": "@eckasse/desktop",
  "version": "1.0.0",
  "license": "MIT",
  "dependencies": {
    "@eckasse/core": "^1.0.0",
    "@eckasse/adapters": "^1.0.0",
    "@eckasse/shared-frontend": "^1.0.0"
  },
  "repository": {
    "type": "git", 
    "url": "https://github.com/eckasse/eckasse-desktop.git"
  }
}
```

#### Web Distribution (Closed Source)

**Private NPM Registry or Direct Deployment**:
```json
// Internal/private packages only
{
  "@eckasse-private/web": "^1.0.0",
  "@eckasse/core": "^1.0.0",        // Uses open source core
  "@eckasse/adapters": "^1.0.0",     // Uses open source adapters
  "@eckasse-private/web-adapters": "^1.0.0"  // Additional closed adapters
}
```

### Snapshot and Context Management

#### Large Monorepo Context Strategy

**Problem**: ecKasse will become very large post-refactor (5+ packages, complex interdependencies)

**Solution**: Package-Specific Context Snapshots

#### Context Snapshot Generation

**Automated Snapshot Creation**:
```bash
# packages/scripts/create-context-snapshots.js

const createPackageSnapshots = async () => {
  const packages = ['core', 'adapters', 'desktop', 'web', 'shared-frontend'];
  
  for (const pkg of packages) {
    const snapshot = {
      package: pkg,
      timestamp: new Date().toISOString(),
      dependencies: await analyzeDependencies(`packages/${pkg}`),
      publicAPI: await extractPublicInterfaces(`packages/${pkg}`),
      keyFiles: await identifyKeyFiles(`packages/${pkg}`),
      testCoverage: await getTestCoverage(`packages/${pkg}`),
      documentation: await extractDocumentation(`packages/${pkg}`)
    };
    
    await writeSnapshot(`eck-snapshot-${pkg}.json`, snapshot);
  }
};
```

**Generated Snapshot Structure**:
```json
// eck-snapshot-core.json
{
  "package": "core",
  "version": "1.0.0", 
  "timestamp": "2025-08-11T10:30:00Z",
  "architecture": {
    "type": "hexagonal",
    "layers": ["domain", "application", "shared"],
    "ports": ["IProductRepository", "ICategoryRepository", "ITransactionRepository"]
  },
  "dependencies": {
    "internal": [],
    "external": ["joi", "pino", "uuid"]
  },
  "publicAPI": {
    "entities": ["Product", "Category", "Transaction"],
    "usecases": ["CreateProduct", "ProcessSale", "GenerateReceipt"],
    "ports": ["database", "llm", "auth", "storage"]
  },
  "keyFiles": [
    {
      "path": "packages/core/domain/entities/Product.js",
      "purpose": "Product domain entity with validation",
      "exports": ["Product", "ProductValidator"]
    },
    {
      "path": "packages/core/application/usecases/CreateProduct.js", 
      "purpose": "Product creation use case",
      "dependencies": ["IProductRepository", "ProductValidator"]
    }
  ],
  "testCoverage": {
    "statements": 95,
    "branches": 90,
    "functions": 98,
    "lines": 94
  },
  "documentation": {
    "README": "packages/core/README.md",
    "API": "packages/core/docs/api.md",
    "architecture": "packages/core/docs/architecture.md"
  }
}
```

#### Agent Context Loading

**Context Selection Logic**:
```javascript
// Agent context selection based on task scope
const selectOptimalContext = (task, availableSnapshots) => {
  const taskScope = analyzeTaskScope(task);
  
  if (taskScope.packages.length === 1) {
    // Single package task - load specific snapshot
    return loadPackageSnapshot(taskScope.packages[0]);
  }
  
  if (taskScope.type === 'architecture') {
    // Architectural changes - load core + adapters snapshots
    return combineSnapshots(['core', 'adapters']);
  }
  
  if (taskScope.type === 'feature') {
    // Feature development - load relevant package snapshots
    return loadRelevantSnapshots(taskScope.featureArea);
  }
  
  // Default: load minimal context
  return loadSnapshotSummary();
};
```

**Context Loading Examples**:

*Task: "Update Product entity validation"*
→ Load: `eck-snapshot-core.json` only

*Task: "Add PostgreSQL multi-tenant support"* 
→ Load: `eck-snapshot-core.json` + `eck-snapshot-adapters.json`

*Task: "Implement new POS feature across desktop and web"*
→ Load: All snapshots except web-specific details

#### Snapshot Maintenance

**Automated Updates**:
```bash
# Run after significant changes
npm run update-snapshots

# Triggered by git hooks
git hook post-commit: update-snapshots --changed-packages
git hook pre-push: validate-snapshots --all
```

**Snapshot Validation**:
```javascript
const validateSnapshot = async (snapshotPath) => {
  const snapshot = await loadSnapshot(snapshotPath);
  
  // Validate actual package structure matches snapshot
  const actualStructure = await analyzePackage(snapshot.package);
  const discrepancies = compareStructures(snapshot, actualStructure);
  
  if (discrepancies.length > 0) {
    throw new Error(`Snapshot out of date: ${discrepancies.join(', ')}`);
  }
  
  return true;
};
```

## Implementation Roadmap

### Phase 1: Repository and Context Foundation (Week 1)

**Objective**: Establish dual licensing, Git filtering, and context management

#### Tasks for LOCAL AGENT ONLY:

1. **Repository Structure Setup**
   ```bash
   # Create new directory structure (without moving existing code yet)
   mkdir -p packages/{core,adapters,desktop,web,shared-frontend}
   mkdir -p packages/core/{domain,application,shared,llm}
   mkdir -p packages/adapters/{database,auth,storage}
   
   # Create package.json files for each package
   # Set up dual licensing structure
   # Configure .gitignore for web/ exclusion in open source
   ```

2. **Git Branch Strategy**
   ```bash
   # Create open source preparation branch
   git checkout -b open-source-prep
   
   # Set up git filter configuration
   # Test open source branch creation process
   # Validate web/ package exclusion
   ```

3. **Context Snapshot System**
   ```bash
   # Create snapshot generation scripts
   # Set up automated snapshot updates
   # Test context loading for different task types
   ```

#### Validation:
- [ ] Open source branch successfully excludes web/ package
- [ ] Package-specific snapshots generate correctly
- [ ] Dual licensing files created and validated

### Phase 2: Core Package Extraction (Weeks 2-3)

**Objective**: Extract all business logic into packages/core/

#### Tasks for LOCAL AGENT ONLY:

1. **Domain Entity Extraction**
   ```bash
   # Move existing models to core/domain/entities/
   # Extract validation logic to core/shared/validation/
   # Create domain interfaces and value objects
   ```
   
   **Files to Create/Move**:
   - `packages/core/domain/entities/Product.js`
   - `packages/core/domain/entities/Category.js` 
   - `packages/core/domain/entities/Transaction.js`
   - `packages/core/shared/validation/ProductValidator.js`

2. **Use Case Implementation**
   ```bash
   # Extract business logic to core/application/usecases/
   # Define port interfaces in core/application/ports/
   # Create use case orchestration logic
   ```
   
   **Files to Create**:
   - `packages/core/application/usecases/CreateProduct.js`
   - `packages/core/application/usecases/ProcessSale.js`
   - `packages/core/application/ports/IProductRepository.js`
   - `packages/core/application/ports/ICategoryRepository.js`

3. **LLM Service Abstraction**
   ```bash
   # Move LangChain agent to core/llm/agent/
   # Abstract tool registration system
   # Create provider interfaces
   ```
   
   **Files to Create/Move**:
   - `packages/core/llm/agent/ReActAgent.js` (from backend/src/services/llm.service.js)
   - `packages/core/llm/tools/DatabaseTools.js`
   - `packages/core/llm/providers/GeminiProvider.js`

#### Validation:
- [ ] Core package has no external infrastructure dependencies
- [ ] All business logic tests pass in isolated core environment
- [ ] Port interfaces clearly defined for all external dependencies

### Phase 3: Adapter Implementation (Weeks 4-5)

**Objective**: Create concrete implementations of core interfaces

#### Tasks for LOCAL AGENT ONLY:

1. **SQLite Adapter (Desktop)**
   ```bash
   # Implement core ports using existing Knex.js code
   # Preserve existing migration structure
   # Ensure backward compatibility
   ```
   
   **Files to Create**:
   - `packages/adapters/database/sqlite/ProductRepository.js`
   - `packages/adapters/database/sqlite/CategoryRepository.js`
   - `packages/adapters/database/sqlite/KnexConnection.js`

2. **PostgreSQL Adapter (Web)**
   ```bash
   # Create multi-tenant PostgreSQL implementation
   # Implement tenant isolation
   # Design scalable connection pooling
   ```
   
   **Files to Create**:
   - `packages/adapters/database/postgresql/ProductRepository.js`
   - `packages/adapters/database/postgresql/TenantAwareRepository.js`
   - `packages/adapters/database/postgresql/ConnectionPool.js`

3. **Adapter Factory Pattern**
   ```bash
   # Create database factory for adapter selection
   # Environment-based configuration
   # Dependency injection setup
   ```
   
   **Files to Create**:
   - `packages/adapters/database/DatabaseFactory.js`
   - `packages/adapters/auth/AuthenticationFactory.js`
   - `packages/adapters/storage/StorageFactory.js`

#### Validation:
- [ ] Both SQLite and PostgreSQL adapters pass identical test suite
- [ ] Existing desktop functionality works with SQLite adapter
- [ ] Multi-tenant PostgreSQL queries properly isolated

### Phase 4: Desktop Application Restructure (Week 6)

**Objective**: Move existing desktop app to new architecture

#### Tasks for LOCAL AGENT ONLY:

1. **Desktop Package Setup**
   ```bash
   # Move existing Electron code to packages/desktop/
   # Update Express server to use adapters
   # Preserve WebSocket/HTTP communication
   ```
   
   **Files to Move/Create**:
   - `packages/desktop/electron/` (from client-desktop/electron/)
   - `packages/desktop/frontend/` (from client-desktop/src/renderer/public/)
   - `packages/desktop/server/app.js` (adapted from backend/src/app.js)

2. **Dependency Injection Wiring**
   ```bash
   # Configure SQLite adapter in desktop startup
   # Wire core use cases with desktop adapters
   # Maintain configuration compatibility
   ```
   
   **Files to Create**:
   - `packages/desktop/server/bootstrap.js`
   - `packages/desktop/config/dependencies.js`
   - `packages/desktop/config/database.js`

#### Validation:
- [ ] Desktop application launches identically to current version
- [ ] All existing features work without regression
- [ ] `npm run dev` command functions as before

### Phase 5: Web Application Foundation (Week 7)

**Objective**: Create multi-tenant web application structure

#### Tasks for LOCAL AGENT ONLY:

1. **Web Package Structure**
   ```bash
   # Create packages/web/ with Express server
   # Implement PostgreSQL adapter integration
   # Set up tenant resolution middleware
   ```
   
   **Files to Create**:
   - `packages/web/server/app.js`
   - `packages/web/server/middleware/TenantResolver.js`
   - `packages/web/multi-tenant/TenantService.js`

2. **Multi-Tenancy Implementation**
   ```bash
   # Tenant context propagation
   # Tenant-aware repository implementations
   # Database schema with tenant isolation
   ```
   
   **Files to Create**:
   - `packages/web/multi-tenant/TenantContext.js`
   - `packages/web/database/TenantAwareKnex.js`
   - `packages/web/migrations/multi-tenant-schema.js`

#### Validation:
- [ ] Web server starts and connects to PostgreSQL
- [ ] Tenant isolation properly implemented in database queries
- [ ] Basic multi-tenant CRUD operations functional

### Phase 6: Shared Frontend Components (Week 8)

**Objective**: Extract reusable UI components

#### Tasks for LOCAL AGENT ONLY:

1. **Component Extraction**
   ```bash
   # Move common UI to packages/shared-frontend/
   # Create reusable POS components
   # Implement theme system
   ```
   
   **Files to Create**:
   - `packages/shared-frontend/components/ProductForm.js`
   - `packages/shared-frontend/components/CategorySelector.js`
   - `packages/shared-frontend/styles/variables.css`

2. **Frontend Utilities**
   ```bash
   # WebSocket management utilities
   # Form validation helpers
   # UUID generation for frontend
   ```
   
   **Files to Create**:
   - `packages/shared-frontend/utils/WebSocketManager.js`
   - `packages/shared-frontend/utils/FormValidation.js`
   - `packages/shared-frontend/utils/UUID.js`

#### Validation:
- [ ] Desktop app uses shared components without regression
- [ ] Web app successfully consumes shared components
- [ ] Style consistency maintained across applications

### Phase 7: Web Application Completion (Weeks 9-10)

**Objective**: Complete multi-tenant web POS system

#### Tasks for LOCAL AGENT ONLY:

1. **Web Frontend Development**
   ```bash
   # Multi-tenant POS interface
   # Tenant management dashboard  
   # User management system
   ```

2. **Advanced Multi-Tenancy Features**
   ```bash
   # Tenant onboarding flow
   # Subscription management integration
   # Tenant-specific configuration
   ```

#### Validation:
- [ ] Complete multi-tenant POS system functional
- [ ] Multiple tenants operate independently
- [ ] Web interface achieves feature parity with desktop

### Phase 8: Open Source Release Preparation (Week 11)

**Objective**: Prepare open source components for public release

#### Tasks for LOCAL AGENT ONLY:

1. **Open Source Branch Creation**
   ```bash
   # Create filtered open source branch
   # Remove all web/ package references
   # Update documentation for open source
   ```

2. **Package Publishing Preparation**
   ```bash
   # Prepare npm packages for publication
   # Set up CI/CD for open source builds
   # Create release documentation
   ```

#### Validation:
- [ ] Open source branch builds without web dependencies
- [ ] Desktop application fully functional from open source packages
- [ ] Documentation complete for community use

### Phase 9: Production Deployment Setup (Week 12)

**Objective**: Set up production deployment for both versions

#### Tasks for Production Agents:

**Desktop Production Agent**:
```bash
# Set up desktop distribution pipeline
# Create installer packages for multiple platforms
# Set up automatic updates system
```

**Web Production Agent**: 
```bash
# Set up web application deployment
# Configure multi-tenant database
# Implement monitoring and scaling
```

#### Validation:
- [ ] Desktop application distributes correctly
- [ ] Web application deploys with proper tenant isolation
- [ ] Both applications maintain feature parity in production

## Success Metrics

### Technical Success Criteria
- [ ] **Zero Regression**: Desktop application maintains 100% feature parity
- [ ] **Architectural Separation**: Core business logic independent of infrastructure
- [ ] **Multi-Tenancy**: Web application supports isolated tenant operations
- [ ] **Code Reuse**: 80%+ business logic shared between desktop and web
- [ ] **Test Coverage**: 90%+ coverage maintained across all packages

### Operational Success Criteria  
- [ ] **Agent Clarity**: Any agent can determine deployment context and available operations
- [ ] **Context Efficiency**: Package-specific snapshots reduce context size by 60%+
- [ ] **Repository Management**: Open source branch automatically excludes proprietary code
- [ ] **Deployment Independence**: Desktop and web versions deploy independently
- [ ] **License Compliance**: Clear separation between MIT and commercial components

### Business Success Criteria
- [ ] **Open Source Ready**: Desktop version prepared for community contributions
- [ ] **Commercial Ready**: Web version prepared for SaaS deployment and scaling  
- [ ] **Development Efficiency**: New features can be developed once and deployed to both platforms
- [ ] **Compliance**: Architecture supports German fiscal requirements (TSE, DSFinV-K)

---

**Document Status**: Complete Implementation Guide  
**Target Completion**: 12 weeks from start  
**Last Updated**: 2025-08-11  
**Agent Context**: Suitable for both local development and production deployment agents