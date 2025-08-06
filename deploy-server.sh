#!/bin/bash

# ecKasse Production Deployment Script
# Run this script on your server in the /var/www/eckasse.com directory

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

# Copy the production environment file
echo "📋 Setting up production environment..."
if [ -f ".env.production" ]; then
    cp .env.production .env
    echo "✅ Copied .env.production to .env"
else
    echo "❌ Error: .env.production file not found. Please create it first."
    exit 1
fi

# Install all dependencies
echo "📦 Installing dependencies..."
npm install

# Build the frontend
echo "🏗️ Building frontend..."
npm run build --workspace=@eckasse/renderer-ui

# Run database migrations
echo "🗄️ Running database migrations..."
npm run migrate:backend

# Install PM2 globally if not already installed
if ! command -v pm2 &> /dev/null; then
    echo "📦 Installing PM2 globally..."
    sudo npm install pm2 -g
fi

# Stop existing PM2 processes for ecKasse
echo "🛑 Stopping existing PM2 processes..."
pm2 delete eckasse-backend || true

# Start the backend with PM2
echo "🚀 Starting ecKasse backend with PM2..."
pm2 start npm --name "eckasse-backend" -- run start:backend

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
pm2 logs eckasse-backend --lines 10 --nostream

echo ""
echo "🌐 Your application should now be available at: https://eckasse.com"
echo "📝 Don't forget to add your GEMINI_API_KEY to the .env file!"
echo ""
echo "Useful commands:"
echo "  pm2 list                    - Show all processes"
echo "  pm2 logs eckasse-backend    - Show logs"
echo "  pm2 restart eckasse-backend - Restart the application"
echo "  pm2 stop eckasse-backend    - Stop the application"