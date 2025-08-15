#!/bin/bash

# =============================================================================
# ecKasse Production Deployment Script (Core and Adapters Architecture)
# =============================================================================
#
# PRODUCTION WEB SERVER DEPLOYMENT
# This script deploys the ecKasse POS system to production environment.
#
# DATABASE: PostgreSQL (NOT SQLite)
# The production environment uses PostgreSQL database.
#
# REQUIRED ENVIRONMENT VARIABLES in .env.production:
# - NODE_ENV=production
# - DB_CLIENT=pg
# - PG_HOST=<postgresql_host>
# - PG_PORT=<postgresql_port> (default: 5432)
# - PG_USERNAME=<postgresql_username>
# - PG_PASSWORD=<postgresql_password>
# - PG_DATABASE=<postgresql_database_name>
# - GEMINI_API_KEY=<google_gemini_api_key>
#
# USAGE: Run this script on your server in the /var/www/eckasse.com directory
# =============================================================================

set -e  # Exit on any error

echo "🚀 Starting ecKasse Production Deployment..."

# Change to the project directory
cd /var/www/eckasse.com

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    echo "❌ Error: package.json not found. Make sure you're in the /var/www/eckasse.com directory"
    exit 1
fi

echo "📁 Working in: $(pwd)"

# Set up production environment file conditionally
echo "📋 Setting up production environment..."
if [ -f ".env.production" ]; then
    if [ ! -f ".env" ]; then
        cp .env.production .env
        echo "✅ Created .env from .env.production template"
        echo "⚠️  WARNING: Please add your secrets (GEMINI_API_KEY, database passwords) to the .env file!"
    else
        echo "✅ .env file already exists, preserving existing configuration"
        echo "ℹ️  If you need to update the .env template, compare with .env.production manually"
    fi
else
    echo "❌ Error: .env.production file not found. Please create it first."
    exit 1
fi

# Install all dependencies
echo "📦 Installing dependencies..."
npm install

# Build the desktop frontend (Svelte)
echo "🏗️ Building desktop frontend..."
npm run build --workspace=@eckasse/desktop-frontend

# Run database migrations using PostgreSQL
echo "🗄️ Running database migrations..."
NODE_ENV=production npx knex migrate:latest --knexfile ./packages/core/db/knexfile.js

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
pm2 save

# Setup PM2 startup script
echo "⚙️ Setting up PM2 startup script..."
sudo env PATH=$PATH:/usr/bin /usr/lib/node_modules/pm2/bin/pm2 startup systemd -u $USER --hp $HOME

echo "✅ Deployment completed!"
echo ""
echo "📊 PM2 Status:"
pm2 list

echo ""
echo "📝 Recent logs:"
pm2 logs eckasse-desktop-server --lines 10 --nostream

echo ""
echo "🌐 Your application should now be available at: https://eckasse.com"
echo "📝 Don't forget to add your GEMINI_API_KEY to the .env file!"
echo ""
echo "Useful commands:"
echo "  pm2 list                         - Show all processes"
echo "  pm2 logs eckasse-desktop-server  - Show logs"
echo "  pm2 restart eckasse-desktop-server - Restart the application"
echo "  pm2 stop eckasse-desktop-server  - Stop the application"