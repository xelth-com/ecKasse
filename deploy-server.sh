#!/bin/bash

# =============================================================================
# ecKasse Production Deployment Script (TESTED VERSION)
# =============================================================================
#
# PRODUCTION WEB SERVER DEPLOYMENT
# This script deploys the ecKasse POS system to production environment.
# 
# TESTED ON: Netcup Debian ARM64, Node.js v22.14.0, PostgreSQL 15.12
#
# DATABASE: PostgreSQL (NOT SQLite)
# The production environment uses PostgreSQL database.
#
# USAGE: Run this script on your server in the /var/www/eckasse.com directory
# =============================================================================

set -e  # Exit on any error

echo "🚀 Starting ecKasse Production Deployment (TESTED VERSION)..."

# Change to the project directory
cd /var/www/eckasse.com

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    echo "❌ Error: package.json not found. Make sure you're in the /var/www/eckasse.com directory"
    exit 1
fi

echo "📁 Working in: $(pwd)"

# Set up production environment file
echo "📋 Setting up production environment..."
if [ ! -f ".env" ]; then
    echo "📝 Creating .env file with PostgreSQL configuration..."
    cat > .env << 'EOF'
# =================================================================
# PRODUCTION SERVER (PostgreSQL)
# =================================================================
NODE_ENV=production
APP_MODE=production
BACKEND_PORT=3030
LOG_LEVEL=info

# PostgreSQL database configuration
PG_DATABASE=eckwms
PG_USERNAME=wms_user
PG_PASSWORD=gK76543n2PqX5bV9zR4m
PG_HOST=localhost
PG_PORT=5432
DB_ALTER=true

# Production API keys (REPLACE WITH YOUR REAL KEYS!)
GEMINI_API_KEY="AIzaSyCZJdPazBu1DCe3Suuo1Gm7_rcmOUu07Kc"
GCS_API_KEY="AIzaSyCZJdPazBu1DCe3Suuo1Gm7_rcmOUu07Kc"
GCS_CX="YOUR_SEARCH_ENGINE_ID"

# UI Configuration
VITE_MIN_BUTTON_WIDTH=160

LOG_LEVEL=debug
EOF
    echo "✅ Created .env file with production settings"
    echo "⚠️  WARNING: Please update GEMINI_API_KEY and other API keys in .env file!"
else
    echo "✅ .env file already exists, preserving existing configuration"
fi

# Install all dependencies
echo "📦 Installing dependencies..."
npm install

# Fix logging issue in SelectionArea.svelte (if not already fixed)
echo "🔧 Checking and fixing logging issues..."
if grep -q "addLog(" packages/desktop/frontend/src/SelectionArea.svelte; then
    echo "🔧 Found addLog calls, commenting them out to prevent log storm..."
    sed -i 's/addLog(/\/\/ addLog(/g' packages/desktop/frontend/src/SelectionArea.svelte
    echo "✅ Logging issue fixed"
else
    echo "✅ Logging issue already fixed"
fi

# Fix vite.svg issue in HTML
echo "🔧 Checking and fixing vite.svg issue..."
if grep -q "vite.svg" packages/desktop/frontend/index.html; then
    echo "🔧 Found vite.svg reference, removing it..."
    sed -i '/<link rel="icon" type="image\/svg+xml" href="\/vite.svg" \/>/d' packages/desktop/frontend/index.html
    echo "✅ vite.svg issue fixed"
else
    echo "✅ vite.svg issue already fixed"
fi

# Build the desktop frontend (Svelte)
echo "🏗️ Building desktop frontend..."
npm run build --workspace=@eckasse/desktop-frontend

# Skip database migrations (they often fail with auth issues)
# Users should run migrations manually if needed
echo "⚠️  Skipping database migrations (run manually if needed)"
echo "ℹ️  To run migrations manually:"
echo "    NODE_ENV=production npx knex migrate:latest --knexfile ./packages/core/db/knexfile.js"

# Install PM2 globally if not already installed
if ! command -v pm2 &> /dev/null; then
    echo "📦 Installing PM2 globally..."
    sudo npm install pm2 -g
fi

# Stop existing PM2 processes for ecKasse
echo "🛑 Stopping existing PM2 processes..."
pm2 delete eckasse-desktop-server || true

# Start the application using ecosystem.config.js
echo "🚀 Starting ecKasse desktop server with PM2..."
pm2 start ecosystem.config.js --env production

# Save PM2 configuration
echo "💾 Saving PM2 configuration..."
pm2 save

# Setup PM2 startup script (only if not already set up)
if ! systemctl is-enabled pm2-root >/dev/null 2>&1; then
    echo "⚙️ Setting up PM2 startup script..."
    pm2 startup systemd --quiet
    echo "✅ PM2 startup configured"
else
    echo "✅ PM2 startup already configured"
fi

echo ""
echo "✅ Deployment completed successfully!"
echo ""
echo "📊 PM2 Status:"
pm2 status eckasse-desktop-server

echo ""
echo "📝 Recent logs (should be clean thanks to log storm fix):"
pm2 logs eckasse-desktop-server --lines 10 --nostream

echo ""
echo "🌐 Your application should now be available at: https://eckasse.com"
echo ""
echo "🔧 Next steps:"
echo "  1. Update GEMINI_API_KEY in .env file with your real API key"
echo "  2. Configure Nginx (see DEPLOYMENT_GUIDE.md)"
echo "  3. Set up SSL certificates with certbot"
echo ""
echo "📋 Useful commands:"
echo "  pm2 status                       - Show process status"
echo "  pm2 logs eckasse-desktop-server  - Show logs"
echo "  pm2 restart eckasse-desktop-server - Restart the application"
echo "  pm2 stop eckasse-desktop-server  - Stop the application"
echo "  ./deploy-update.sh               - Quick update script"