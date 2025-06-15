# ecKasse - LLM-Powered Point of Sale (POS) System

## Project Status: In Development (Initial Phase - Concept & Setup)

## 0. Project Branding and Infrastructure

*   **Project Name:** ecKasse
*   **Community & Information Domains:**
    *   ecKasse.com
    *   ecKasse.de
    *   ecKasse.eu
*   **GitHub Repository:** [https://github.com/xelth-com/ecKasse](https://github.com/xelth-com/ecKasse)
*   **Ecosystem Link:**
    *   ecKasse is planned to be part of or a complement to the **eckWms** (Warehouse Management System) suite.
    *   The exact integration model (included in the suite or as an add-on) will be determined later.
*   **Server Infrastructure (for optional cloud features, backups, synchronization):**
    *   eck1.com
    *   eck2.com
    *   eck3.com
    *(Note: These servers will be used for optional cloud functionalities. The core POS operations are designed to work offline with local data storage).*

## 1. Philosophy and Goals

*   **Core Idea:** To create an intelligent, intuitive interface for managing POS operations within the ecKasse project, abstracting away the complexity of traditional POS systems.
*   **Objective:** To replace complex menus and manual configurations with natural language dialogues মানুষ_LLM_assistant, minimizing the need for service technicians for routine tasks.
*   **USP (Unique Selling Proposition):** "Conversational Commerce" with ecKasse, striving for "zero-config" for basic operations, and being open source.

## 2. Architecture and Technology Stack

*   **Core Application:** Cross-platform desktop application built with **Electron.js**.
*   **Frontend (User Interface):** **React** (in Electron's Renderer Process).
    *   Dynamic, data-driven UI.
    *   Component-based architecture.
    *   Interacts with the backend via a local HTTP API.
*   **Backend (Logic & API):** **Node.js** with **Express.js** (running in Electron's Main Process or as a separate local server managed by Electron).
    *   Provides a structured local API (not strictly JSON-RPC, but protocols understandable by Gemini via "Tool Use").
    *   Handles all business logic, database interactions, and LLM communication.
*   **Database (Local):** **SQLite** (using `sqlite3` and `knex.js` for migrations and queries).
*   **LLM Integration:**
    *   **Model:** Google **Gemini Flash** (for the free version), Google **Gemini Pro** (for the Pro version).
    *   **SDK:** `@google/generative-ai`.
    *   **Agent Framework:** **LangChain.js** for managing prompts, tools, chains, and agent memory.
*   **Logging:** Structured logging using **Pino** (and `pino-pretty` for development) to facilitate log analysis, including by the LLM agent.

## 3. Current Status and Work Done

*   **Initialized Git repository** and hosted on GitHub.
*   **Created a basic `package.json`** and installed core dependencies for:
    *   Electron (`electron`, `electron-builder`) and development utilities (`concurrently`, `nodemon`, `wait-on`, `cross-env`).
    *   Frontend (`react`, `react-dom`, `react-router-dom`, `axios`).
    *   Backend (`express`, `cors`, `@google/generative-ai`, `langchain`, `sqlite3`, `knex`, `dotenv`, `pino`, `pino-pretty`).
    *   Development tools (`eslint`, `prettier`, `typescript` and related plugins).
*   **Defined an initial project folder structure.**
*   **Formulated a detailed project concept**, including key features, LLM interaction architecture, distribution models, and development phases (this `README.md`).
*   **Configured `.gitignore`** to exclude unnecessary files from the repository.


## 4. Key Features (Planned)

*   **Master Data Management (Stammdaten):** Products (PLUs), categories (Warengruppen), users & roles, payment methods.
*   **Core Sales Logic:**
    *   Modifiers for conditional promotions, discounts, surcharges.
    *   Condiments/PLU Links for gastronomy.
    *   Table Management (Tischfunktionen): splitting bills, moving items.
*   **Reporting & Administration:**
    *   Standard X/Z-Reports.
    *   Fiscal Export (e.g., DSFinV-K for Germany).
    *   Dynamic POS UI configuration via LLM.
*   **Macros:** Custom automation via JSON structures or (for advanced users) JavaScript in a secure sandbox.
*   **Offline Functionality:** Core POS operations will not require a constant internet connection.
*   **Companion App:** For settings and reports (possibly part of eckWms).
*   **Cloud Features (via eck1/2/3.com, optional/Pro):** Backups, data synchronization.

## 5. LLM Agent Interaction

*   The LLM acts as an intelligent assistant, understanding natural language.
*   Interaction via Gemini's "Tool Use" mechanism: LLM calls POS API functions described as "tools".
*   LangChain.js is used to build and manage the agent's logic.
*   The agent should be capable of dialogue, clarifying requests, proposing solutions, and explaining functionalities.

## 6. Distribution Model and Cost Management

*   **ecKasse (Free Version):**
    *   Open Source (EUPL-1.2 License).
    *   LLM: Gemini Flash.
    *   LLM Cost Coverage: **BYOK (Bring Your Own Key)** – users provide their own Google AI API key.
*   **ecKasse Pro (Paid Version):**
    *   LLM: Gemini Pro.
    *   Enhanced functionality, cloud services.
    *   Monetization: Subscription or one-time purchase.

## 7. Next Steps (Immediate)

1.  **Create the base folder structure** as outlined in the project plan.
2.  **Set up the React application** (e.g., using Create React App or Vite).
3.  **Write basic code for `electron/main.js`** to launch the window and load the React app.
4.  **Write basic code for the Backend API using Express.js** (`src/backend/`).
5.  **Configure Knex.js** for SQLite database migrations and initial seeding.
6.  **Implement a first simple "tool" for the LLM agent** (e.g., fetching a list of products) and integrate it via LangChain.js.
7.  **Create a basic chat interface** in React to interact with the LLM agent.

## 8. How to Contribute

*(This section will be filled in later when the project is ready to accept external contributions. It will include developer guidelines, coding style, and the Pull Request process).*

## 9. License


Copyright 2025 Betruger Sp. z o.o.  
Original work by Dmytro Surovtsev  
Licensed under the EUPL-1.2

This project is licensed under the European Union Public Licence v. 1.2. 
See the [LICENSE.md](LICENSE.md) file for details.