REM Убедитесь, что вы в C:\Users\xelth\eckasse

REM --- Основная структура ---
IF NOT EXIST "electron" md electron
IF NOT EXIST "public" md public
IF NOT EXIST "public\assets" md public\assets
IF NOT EXIST "src" md src

REM --- Структура для Frontend (React) ---
IF NOT EXIST "src\renderer" md src\renderer
IF NOT EXIST "src\renderer\components" md src\renderer\components
IF NOT EXIST "src\renderer\features" md src\renderer\features
IF NOT EXIST "src\renderer\contexts" md src\renderer\contexts
IF NOT EXIST "src\renderer\hooks" md src\renderer\hooks
IF NOT EXIST "src\renderer\services" md src\renderer\services
IF NOT EXIST "src\renderer\styles" md src\renderer\styles
IF NOT EXIST "src\renderer\utils" md src\renderer\utils

REM --- Структура для Backend (Node.js, Express, LLM - будет внутри src/backend) ---
IF NOT EXIST "src\backend" md src\backend
IF NOT EXIST "src\backend\config" md src\backend\config
IF NOT EXIST "src\backend\routes" md src\backend\routes
IF NOT EXIST "src\backend\controllers" md src\backend\controllers
IF NOT EXIST "src\backend\services" md src\backend\services
IF NOT EXIST "src\backend\llm" md src\backend\llm
IF NOT EXIST "src\backend\llm\tools" md src\backend\llm\tools
IF NOT EXIST "src\backend\llm\prompts" md src\backend\llm\prompts
IF NOT EXIST "src\backend\db" md src\backend\db
IF NOT EXIST "src\backend\db\migrations" md src\backend\db\migrations
IF NOT EXIST "src\backend\db\seeds" md src\backend\db\seeds
IF NOT EXIST "src\backend\middleware" md src\backend\middleware
IF NOT EXIST "src\backend\utils" md src\backend\utils
IF NOT EXIST "src\backend\validators" md src\backend\validators

REM --- Структура для Shared кода (если нужен) ---
IF NOT EXIST "src\shared" md src\shared
IF NOT EXIST "src\shared\types" md src\shared\types
IF NOT EXIST "src\shared\utils" md src\shared\utils

REM --- Папки для иконок (для electron-builder) ---
IF NOT EXIST "public\assets\icons" md public\assets\icons
IF NOT EXIST "public\assets\icons\win" md public\assets\icons\win
IF NOT EXIST "public\assets\icons\mac" md public\assets\icons\mac
IF NOT EXIST "public\assets\icons\png" md public\assets\icons\png