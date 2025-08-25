# ecKasse - LLM-Powered Point of Sale System

![CI/CD Status](https://img.shields.io/badge/build-passing-brightgreen)
![Version](https://img.shields.io/badge/version-0.2.0-blue)
![License](https://img.shields.io/badge/license-MIT-green)



**ecKasse** - это современная, основанная на искусственном интеллекте кассовая система (POS), разработанная для обеспечения соответствия немецкому налоговому законодательству (DSFinV-K) и максимальной автоматизации процессов в ресторанном бизнесе.

---

## 🚀 Key Features

* **🧠 AI-Powered Menu Parsing:** Автоматически создает меню из загруженного изображения или текста.
* **🇩🇪 DSFinV-K Compliant:** Гарантирует полное соответствие экспорта данных требованиям налоговых органов Германии.
* **🔄 Asynchronous Background Jobs:** Надежный экспорт больших объемов данных без блокировки интерфейса.
* **🔒 Secure Session Management:** Постоянная сессия пользователя с защитой на основе HttpOnly cookies.
* **🖥️ Cross-Platform:** Работает как десктопное приложение благодаря Electron.
* **🌐 Real-time UI:** Отзывчивый интерфейс, построенный на Svelte.

---

## 🛠️ Tech Stack

![Node.js](https://img.shields.io/badge/-Node.js-339933?logo=node.dot.js&logoColor=white)
![Express.js](https://img.shields.io/badge/-Express.js-000000?logo=express&logoColor=white)
![Electron](https://img.shields.io/badge/-Electron-47848F?logo=electron&logoColor=white)
![Svelte](https://img.shields.io/badge/-Svelte-FF3E00?logo=svelte&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/-PostgreSQL-4169E1?logo=postgresql&logoColor=white)

---

## 🏁 Getting Started

### Prerequisites

* Node.js (v18.x or higher)
* npm
* PostgreSQL

### Installation & Setup

1.  **Clone the repository:**
    ```bash
    git clone <your-repository-url>
    cd ecKasse
    ```

2.  **Install dependencies:**
    ```bash
    npm install
    ```

3.  **Configure environment variables:**
    * Create a `.env` file in `packages/core` and `packages/desktop/server`.
    * Add your database connection details and other required settings.

4.  **Run database migrations:**
    ```bash
    npx knex migrate:latest --knexfile packages/core/db/knexfile.js
    ```

5.  **Run the application:**
    ```bash
    npm run dev
    ```

---

## 🤖 For AI Agent Operation

### 1. How to Read The Project Snapshot

This project may be provided as a self-contained, single-file snapshot.
* **Source of Truth:** Treat the snapshot as the complete and authoritative source code.
* **Structure:** The file contains a directory tree, followed by the full content of each file, demarcated by `--- File: /path/to/file ---` headers.

### 2. Core Operational Workflow

You are the Project Manager and Solution Architect AI. Your primary goal is to translate user requests into technical plans and then generate precise commands for code-execution AI agents.
* **Analyze User Request:** Understand the user's goal.
* **Formulate a Plan:** Create a high-level technical plan.
* **Propose & Await Confirmation:** Present the plan to the user and wait for approval before generating the final command for the execution agent.