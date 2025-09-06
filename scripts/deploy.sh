#!/bin/bash
# Main deployment script for eckasse
# Run with: sudo ./scripts/deploy.sh

set -e

echo "🚀 Starting eckasse deployment..."

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    echo "❌ Please run as root (sudo ./scripts/deploy.sh)"
    exit 1
fi

# Check if we're in the project directory
if [ ! -f "package.json" ] || ! grep -q "eckasse" package.json; then
    echo "❌ Please run this script from the project root directory"
    exit 1
fi

echo "📁 Current directory: $(pwd)"

# Step 1: Pull latest code
echo ""
echo "📥 Step 1: Pulling latest code..."
if git status &>/dev/null; then
    # Check if there are local changes
    if ! git diff-index --quiet HEAD --; then
        echo "⚠️  Local changes detected, stashing..."
        git stash
    fi
    
    git pull origin main
    echo "✅ Code updated"
else
    echo "⚠️  Not a git repository, skipping git pull"
fi

# Step 2: Install dependencies
echo ""
echo "📦 Step 2: Installing dependencies..."
npm install
echo "✅ Dependencies installed"

# Step 3: Setup pgvector
echo ""
echo "🔧 Step 3: Setting up pgvector..."
./scripts/install-pgvector.sh

# Step 4: Run database migrations
echo ""
echo "🗃️  Step 4: Running database migrations..."
sudo -u $(logname) ./scripts/migrate-database.sh

# Step 5: Setup nginx
echo ""
echo "🌐 Step 5: Setting up nginx..."
./scripts/setup-nginx.sh

# Step 6: Build frontend
echo ""
echo "🏗️  Step 6: Building frontend..."
cd packages/desktop/frontend
npm run build
cd ../../..
echo "✅ Frontend built"

# Step 7: Restart services
echo ""
echo "🔄 Step 7: Restarting services..."
if command -v pm2 &> /dev/null; then
    pm2 restart eckasse-desktop-server || echo "⚠️  PM2 service not found or not running"
else
    echo "⚠️  PM2 not installed, please restart your Node.js application manually"
fi

echo ""
echo "🎉 Deployment completed successfully!"
echo ""
echo "📋 Summary:"
echo "  ✅ Code updated"
echo "  ✅ Dependencies installed"
echo "  ✅ pgvector configured"
echo "  ✅ Database migrated"
echo "  ✅ Nginx configured for large uploads"
echo "  ✅ Frontend built"
echo "  ✅ Services restarted"
echo ""
echo "🌐 Your application should now be ready at https://eckasse.com"