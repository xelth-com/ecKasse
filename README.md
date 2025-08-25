# ecKasse - LLM-Powered Point of Sale System

> ### Eine Kasse, die hilft – nicht kostet.
> #### KI-Technologie zum Selbstkostenpreis – für mehr Zeit mit Ihren Gästen.

**Status:** In Development | **License:** Dual (MIT / Commercial) | **Developer:** Betruger Sp. z o.o.

An advanced, open-source Point of Sale system designed for restaurants and cafes. It features a modern Svelte-based UI, robust backend services, and innovative features like natural language configuration via Google Gemini, automatic printer discovery, and a reliable fiscal logging core.

## Architecture: Core & Adapters

ecKasse is built on a flexible monorepo architecture that separates core business logic from specific implementations, enabling easy adaptation for different environments.

-   **Open Source Desktop Version (`packages/desktop`):** A single-tenant POS system using Electron and SQLite, licensed under MIT.
-   **Commercial Web Version (`packages/web`):** A multi-tenant SaaS version using PostgreSQL, licensed commercially.

### Technology Stack

-   **Frontend:** Svelte 5 (`packages/desktop/frontend`)
-   **Shared Components:** Svelte Components (`packages/shared-frontend`)
-   **Desktop:** Electron.js (`packages/desktop/electron`)
-   **Backend Server:** Node.js + Express.js (`packages/desktop/server`)
-   **Core Logic:** All business logic is centralized in `packages/core`.
-   **Database:** SQLite (default for desktop) or PostgreSQL, managed with Knex.js migrations.
-   **LLM:** Google Gemini for natural language processing.
-   **Communication:** WebSocket for real-time UI updates with an HTTP fallback.

## Key Features

-   **Robust Transaction Management:** Handle active and parked orders, split checks, and manage tables with a resilient system that recovers from interruptions.
-   **Reliable Fiscal Logging:** A three-tier logging system (Fiscal, Operational, System) with a write-ahead log ensures no transaction data is ever lost, even during power failures.
-   **Automatic Printer Discovery:** Automatically finds and configures ESC/POS compatible receipt printers on the network, supporting both DHCP and static IPs.
-   **Hybrid Search:** A powerful search service combining traditional text search with semantic vector search to find products intelligently.
-   **DSFinV-K 2.4 Compliant Export:** Generate complete, audit-ready fiscal data exports for German tax authorities, including all required master data (Stammdaten), transaction logs (Einzelaufzeichnungen), and cash closing summaries (Kassenabschluss).
-   **LLM-Powered Configuration:** Use natural language to add products, create sales promotions, and configure system settings.
-   **Dual Licensing Model:** A free, open-source desktop version for single-location businesses and a scalable, commercial web version for multi-tenant SaaS deployments.

## Project Structure

```
├── packages/
│   ├── core/              # Shared business logic (MIT)
│   ├── adapters/          # Database adapters (SQLite, PG) (MIT)
│   ├── desktop/           # Open-source Electron app (MIT)
│   ├── shared-frontend/   # Shared Svelte components (MIT)
│   └── web/               # Closed-source web application (Commercial)
└── package.json           # Monorepo root
```

## Installation & Development

### Prerequisites

-   Node.js v20+
-   Git
-   A Google Gemini API key

### Setup

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/xelth-com/eckasse.git
    cd eckasse
    ```

2.  **Install dependencies from the root:**
    ```bash
    npm install
    ```

3.  **Configure your environment:**
    -   Copy `.env.example` to `.env`.
    -   Set your `GEMINI_API_KEY`.
    -   Ensure `DB_CLIENT` is set to `sqlite3` for local development.

### Development Commands

All commands are run from the project root.

-   **Start the complete desktop application (Backend + Frontend + Electron):**
    ```bash
    npm run dev
    ```

-   **Start only the backend server:**
    ```bash
    npm run dev:backend
    ```

-   **Run database migrations:**
    ```bash
    npx knex migrate:latest --knexfile packages/core/db/knexfile.js
    ```

---

## Quick Start Guide for Cashiers

This guide covers the basic daily operations for a cashier.

### 1. Logging In

When the system starts, you will see a list of available users.

-   **Select Your User:** Tap on your name.
-   **Enter PIN:** Use the on-screen keypad to enter your 4-6 digit PIN and press the green checkmark (↵) to log in.

### 2. Creating a New Order

-   After logging in, you'll see the main product selection screen.
-   Simply tap on a category button (e.g., "Speisen" or "Getränke").
-   The view will switch to show all products in that category.
-   Tap on a product button to add it to the current order. The order details will appear on the left.
-   To add more of the same item, just tap it again.

### 3. Parking an Order to a Table

If a customer is sitting at a table, you should "park" the order.

1.  **Add Items:** Add all the customer's items to the order.
2.  **Press the "Table" button:** This button has a table icon on it.
3.  **Enter Table Number:** The keypad will appear. Type the table number (e.g., "15") and press the green checkmark (↵).
4.  The order will disappear from the left and be saved as a parked order. The system is now ready for the next customer.

### 4. Managing a Parked Order

-   Parked orders appear as small cards in the top left of the screen, showing the table number and total.
-   **To add more items:** Simply tap the parked order card. It will become the active order, and you can add more products as usual. When you're done, park it again on the same table number.

### 5. Taking Payment

1.  **Recall the Order:** Tap the customer's parked order to make it active.
2.  **Press a Payment Button:** At the bottom of the product grid, you will see payment options like `Bar` (Cash) or `Karte` (Card).
3.  **Finalize:** Tapping the payment button finalizes the transaction, prints the receipt, and clears the order from the screen.

### 6. Viewing Past Orders (Receipts)

-   You can cycle through different views (Order, Receipts, Agent) using the smart navigation button (double arrow icon) or by long-pressing it.
-   Switch to the **Receipts** view to see a list of the most recent completed transactions.
-   Tap on any receipt to see its details or use the **Reprint** button.

---

## Contributing

Contributions to the open-source components are welcome! Please check the GitHub Issues for tasks labeled "good first issue".

## License

This repository operates under a dual-license model:

-   **Open Source Components (MIT License):**
    -   `packages/core/`
    -   `packages/adapters/`
    -   `packages/desktop/`
    -   `packages/shared-frontend/`

-   **Proprietary Components (Commercial License):**
    -   `packages/web/`

See `LICENSE-MIT` and contact us for commercial licensing details.