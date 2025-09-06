#!/bin/bash
# Setup nginx configuration for eckasse with file upload support
# Run with: sudo ./scripts/setup-nginx.sh

set -e

echo "🚀 Checking nginx configuration for eckasse..."

NGINX_CONFIG="/etc/nginx/sites-available/eckasse.com.conf"

# Check if nginx is installed
if ! command -v nginx &> /dev/null; then
    echo "❌ nginx is not installed!"
    echo "Install with: sudo apt install nginx"
    exit 1
fi

# Check if config file exists
if [ ! -f "$NGINX_CONFIG" ]; then
    echo "❌ nginx config file not found: $NGINX_CONFIG"
    echo "Please create the basic nginx configuration first"
    exit 1
fi

# Check if client_max_body_size is already configured
if grep -q "client_max_body_size" "$NGINX_CONFIG"; then
    CURRENT_SIZE=$(grep "client_max_body_size" "$NGINX_CONFIG" | head -1 | grep -oP '\d+[MmGgKk]')
    echo "✅ client_max_body_size already configured: $CURRENT_SIZE"
    
    # Check if it's at least 100M
    if [[ "$CURRENT_SIZE" =~ ^([0-9]+)[MmGg]$ ]]; then
        SIZE_NUM=${BASH_REMATCH[1]}
        SIZE_UNIT=${CURRENT_SIZE: -1}
        
        if [[ "$SIZE_UNIT" =~ [Gg] ]] || ([[ "$SIZE_UNIT" =~ [Mm] ]] && [ "$SIZE_NUM" -ge 100 ]); then
            echo "✅ File upload size limit is sufficient"
        else
            echo "⚠️  Current limit ($CURRENT_SIZE) may be too small for large menu files"
            echo "💡 Consider increasing to 100M or more"
        fi
    fi
else
    echo "📝 Adding client_max_body_size to nginx config..."
    
    # Backup original config
    cp "$NGINX_CONFIG" "$NGINX_CONFIG.backup.$(date +%Y%m%d_%H%M%S)"
    
    # Add client_max_body_size after the server_name line
    sed -i '/server_name.*eckasse.com/a\\n    # Allow large file uploads for menu import\n    client_max_body_size 100M;' "$NGINX_CONFIG"
    
    echo "✅ Added client_max_body_size 100M to nginx config"
fi

# Test nginx configuration
echo "🔍 Testing nginx configuration..."
if nginx -t; then
    echo "✅ nginx configuration is valid"
    
    echo "🔄 Reloading nginx..."
    systemctl reload nginx
    echo "✅ nginx reloaded successfully"
else
    echo "❌ nginx configuration test failed!"
    exit 1
fi

echo "✅ nginx setup completed!"