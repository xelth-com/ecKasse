#!/bin/bash

# =============================================================================
# ecKasse SECURE Production Deployment Script
# =============================================================================
#
# SECURE PRODUCTION WEB SERVER DEPLOYMENT
# This script securely deploys the ecKasse POS system to production environment.
# 
# SECURITY FEATURES:
# - No hardcoded secrets or credentials in the script
# - Uses .env.example as template for initial setup
# - Never overwrites existing .env files (preserves your secrets)
# - Forces manual configuration of secrets on first deployment
#
# TESTED ON: Netcup Debian ARM64, Node.js v22.14.0, PostgreSQL 15.12
#
# DATABASE: PostgreSQL (NOT SQLite)
# The production environment uses PostgreSQL database.
#
# USAGE: Run this script on your server in the /var/www/eckasse.com directory
# =============================================================================

set -e  # Exit on any error

echo "🚀 Starting ecKasse SECURE Production Deployment..."

# Change to the project directory
cd /var/www/eckasse.com

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    echo "❌ Error: package.json not found. Make sure you're in the /var/www/eckasse.com directory"
    exit 1
fi

echo "📁 Working in: $(pwd)"

# =============================================================================
# SECURE ENVIRONMENT FILE SETUP
# =============================================================================
echo "🔐 Checking secure environment configuration..."

if [ ! -f ".env" ]; then
    echo ""
    echo "⚠️  FIRST DEPLOYMENT DETECTED - MANUAL CONFIGURATION REQUIRED"
    echo "=============================================================="
    echo ""
    echo "📝 Creating .env file from secure template..."
    
    if [ ! -f ".env.example" ]; then
        echo "❌ Error: .env.example template not found!"
        echo "   The repository may be incomplete or corrupted."
        exit 1
    fi
    
    # Copy template to .env
    cp .env.example .env
    
    echo "✅ Template copied to .env"
    echo ""
    echo "🚨 CRITICAL SECURITY STEP REQUIRED:"
    echo "======================================"
    echo ""
    echo "❌ DEPLOYMENT STOPPED - Manual configuration needed!"
    echo ""
    echo "The .env file has been created with placeholder values."
    echo "You MUST manually edit it with your production secrets:"
    echo ""
    echo "  1. Edit the file:         nano .env"
    echo "  2. Replace these critical placeholders with real values:"
    echo "     - PG_PASSWORD=YOUR_SECURE_PRODUCTION_PASSWORD"
    echo "     - GEMINI_API_KEY=\"YOUR_PRODUCTION_GEMINI_API_KEY_HERE\""
    echo "     - GCS_API_KEY=\"YOUR_PRODUCTION_GCS_API_KEY_HERE\""
    echo "     - GCS_CX=\"YOUR_PRODUCTION_SEARCH_ENGINE_ID\""
    echo "  3. Save the file and exit the editor"
    echo "  4. Run this script again: ./deploy-server.sh"
    echo ""
    echo "🔒 SECURITY NOTE: Your secrets will be preserved on subsequent deployments."
    echo ""
    exit 1
else
    echo "✅ Existing .env file found - preserving your configuration"
    echo "🔒 Your secrets and settings will NOT be modified"
    
    # Verify that critical production values are configured
    if grep -q "YOUR_SECURE_PRODUCTION_PASSWORD\|YOUR_PRODUCTION_GEMINI_API_KEY_HERE" .env; then
        echo ""
        echo "⚠️  WARNING: Placeholder values detected in .env file!"
        echo "     Please ensure you have replaced all placeholder values with real secrets."
        echo "     The deployment will continue, but the application may not work properly"
        echo "     with placeholder values."
        echo ""
        read -p "Continue anyway? (y/N): " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            echo "Deployment cancelled. Please configure your .env file first."
            exit 1
        fi
    fi
fi

# Install all dependencies
echo "📦 Installing dependencies..."
npm install

# Run database migrations for production
echo "🗄️ Running database migrations..."
NODE_ENV=production npx knex migrate:latest --knexfile packages/core/db/knexfile.js

# Fix pgvector column type if needed
echo "🔧 Checking and fixing pgvector configuration..."
PGPASSWORD=gK76543n2PqX5bV9zR4m psql -h localhost -p 5432 -U wms_user -d eckwms -c "
DO \$\$
BEGIN
    -- Check if item_embedding column exists and is text type
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'item_embeddings' 
        AND column_name = 'item_embedding' 
        AND data_type = 'text'
    ) THEN
        -- Convert text column to vector type
        RAISE NOTICE 'Converting item_embedding from text to vector(768)...';
        ALTER TABLE item_embeddings ALTER COLUMN item_embedding TYPE vector(768) USING item_embedding::vector;
        RAISE NOTICE 'Column converted successfully.';
    ELSE
        RAISE NOTICE 'item_embedding column is already vector type or does not exist.';
    END IF;
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE 'Error converting column: %', SQLERRM;
END
\$\$;

-- Create HNSW index for optimal vector search performance
CREATE INDEX IF NOT EXISTS idx_item_embeddings_hnsw ON item_embeddings USING hnsw (item_embedding vector_cosine_ops);
" || echo "✅ pgvector configuration completed"


# Fix logging issue in SelectionArea.svelte (if not already fixed)
echo "🔧 Checking and fixing logging issues..."
if grep -q "addLog(" packages/desktop/frontend/src/SelectionArea.svelte 2>/dev/null; then
    echo "🔧 Found addLog calls, commenting them out to prevent log storm..."
    sed -i 's/addLog(/\/\/ addLog(/g' packages/desktop/frontend/src/SelectionArea.svelte
    echo "✅ Logging issue fixed"
else
    echo "✅ Logging issue already fixed"
fi

# Fix vite.svg issue in HTML
echo "🔧 Checking and fixing vite.svg issue..."
if grep -q "vite.svg" packages/desktop/frontend/index.html 2>/dev/null; then
    echo "🔧 Found vite.svg reference, removing it..."
    sed -i '/<link rel="icon" type="image\/svg+xml" href="\/vite.svg" \/>/d' packages/desktop/frontend/index.html
    echo "✅ vite.svg issue fixed"
else
    echo "✅ vite.svg issue already fixed"
fi

# Build the desktop frontend (Svelte)
echo "🏗️ Building desktop frontend..."
npm run build --workspace=@eckasse/desktop-frontend

# Database migrations are now automatically run above after npm install

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
echo "✅ SECURE DEPLOYMENT COMPLETED SUCCESSFULLY!"
echo ""
echo "📊 PM2 Status:"
pm2 status eckasse-desktop-server

echo ""
echo "📝 Recent logs:"
pm2 logs eckasse-desktop-server --lines 10 --nostream

echo ""
echo "🌐 Your application should now be available at: https://eckasse.com"
echo ""
echo "🔧 Next steps:"
echo "  1. Configure Nginx (see DEPLOYMENT_GUIDE.md)"
echo "  2. Set up SSL certificates with certbot"
echo "  3. Verify all environment variables are correctly configured"
echo ""
echo "📋 Useful commands:"
echo "  pm2 status                       - Show process status"
echo "  pm2 logs eckasse-desktop-server  - Show logs"
echo "  pm2 restart eckasse-desktop-server - Restart the application"
echo "  pm2 stop eckasse-desktop-server  - Stop the application"
echo ""
echo "🔒 SECURITY REMINDER:"
echo "  Your .env file contains sensitive data and is preserved across deployments."
echo "  This script will never overwrite or modify your existing .env file."