#!/bin/bash

echo "🔍 ecKasse Deployment Status Check"
echo "=================================="

cd /var/www/eckasse.com

echo ""
echo "📂 Working Directory: $(pwd)"
echo ""

# Check git status
echo "🔀 Git Status:"
echo "  Current commit: $(git rev-parse --short HEAD)"
echo "  Current branch: $(git branch --show-current 2>/dev/null || echo "detached HEAD")"
echo ""

# Check .env file
echo "📋 Environment Configuration:"
if [ -f ".env" ]; then
    echo "  ✅ .env file exists"
    echo "  📊 PostgreSQL settings:"
    grep "PG_DATABASE\|PG_USERNAME\|PG_HOST\|PG_PORT" .env | sed 's/^/    /'
    echo "  🔧 Node environment: $(grep NODE_ENV .env | cut -d= -f2)"
else
    echo "  ❌ .env file missing!"
fi
echo ""

# Check PostgreSQL connection
echo "🗄️ Database Connection:"
if PGPASSWORD=gK76543n2PqX5bV9zR4m psql -h localhost -p 5432 -U wms_user -d eckwms -c "SELECT version();" >/dev/null 2>&1; then
    echo "  ✅ PostgreSQL connection successful"
    USER_COUNT=$(PGPASSWORD=gK76543n2PqX5bV9zR4m psql -h localhost -p 5432 -U wms_user -d eckwms -t -c "SELECT COUNT(*) FROM users;" 2>/dev/null || echo "0")
    echo "  👥 Users in database: $USER_COUNT"
else
    echo "  ❌ PostgreSQL connection failed!"
fi
echo ""

# Check PM2 status
echo "⚙️ PM2 Process Status:"
if command -v pm2 >/dev/null 2>&1; then
    if pm2 list | grep -q "eckasse-desktop-server"; then
        PM2_STATUS=$(pm2 jlist | jq -r '.[] | select(.name=="eckasse-desktop-server") | .pm2_env.status' 2>/dev/null || echo "unknown")
        PM2_PID=$(pm2 jlist | jq -r '.[] | select(.name=="eckasse-desktop-server") | .pid' 2>/dev/null || echo "unknown")
        PM2_UPTIME=$(pm2 jlist | jq -r '.[] | select(.name=="eckasse-desktop-server") | .pm2_env.pm_uptime' 2>/dev/null || echo "unknown")
        echo "  ✅ Process exists: eckasse-desktop-server"
        echo "  📊 Status: $PM2_STATUS"
        echo "  🆔 PID: $PM2_PID"
        if [ "$PM2_UPTIME" != "unknown" ]; then
            UPTIME_READABLE=$(node -e "console.log(new Date(Date.now() - $PM2_UPTIME).toISOString().substr(11, 8))" 2>/dev/null || echo "unknown")
            echo "  ⏱️ Uptime: $UPTIME_READABLE"
        fi
    else
        echo "  ❌ eckasse-desktop-server process not found!"
    fi
else
    echo "  ❌ PM2 not installed!"
fi
echo ""

# Check port 3030
echo "🌐 Network Status:"
if ss -tlnp | grep -q ":3030"; then
    PORT_PROCESS=$(ss -tlnp | grep ":3030" | awk '{print $6}' | head -1)
    echo "  ✅ Port 3030 is in use by: $PORT_PROCESS"
else
    echo "  ❌ Port 3030 is not listening!"
fi
echo ""

# Check Nginx status
echo "🔧 Nginx Status:"
if systemctl is-active nginx >/dev/null 2>&1; then
    echo "  ✅ Nginx is running"
    if [ -f "/etc/nginx/sites-enabled/eckasse.com.conf" ]; then
        echo "  ✅ eckasse.com.conf is enabled"
    else
        echo "  ❌ eckasse.com.conf not found in sites-enabled"
    fi
else
    echo "  ❌ Nginx is not running!"
fi
echo ""

# Check SSL certificates
echo "🔒 SSL Certificate Status:"
if [ -f "/etc/letsencrypt/live/eckasse.com/fullchain.pem" ]; then
    echo "  ✅ SSL certificate exists"
    CERT_EXPIRY=$(openssl x509 -enddate -noout -in /etc/letsencrypt/live/eckasse.com/fullchain.pem 2>/dev/null | cut -d= -f2)
    echo "  📅 Expires: $CERT_EXPIRY"
else
    echo "  ❌ SSL certificate not found!"
fi
echo ""

# Check recent logs
echo "📝 Recent Application Logs (last 5 lines):"
if command -v pm2 >/dev/null 2>&1 && pm2 list | grep -q "eckasse-desktop-server"; then
    pm2 logs eckasse-desktop-server --lines 5 --nostream 2>/dev/null | sed 's/^/  /'
else
    echo "  ❌ Cannot retrieve logs - PM2 process not found"
fi
echo ""

# Check applied fixes
echo "🔧 Applied Fixes Status:"
ADDLOG_COMMENTED=$(grep -c "// addLog" packages/desktop/frontend/src/SelectionArea.svelte 2>/dev/null || echo "0")
echo "  📝 SelectionArea logging fix: $ADDLOG_COMMENTED/32 addLog calls commented"

if grep -q "vite.svg" packages/desktop/frontend/index.html 2>/dev/null; then
    echo "  🖼️ vite.svg fix: ❌ NOT applied"
else
    echo "  🖼️ vite.svg fix: ✅ Applied"
fi

if grep -q "proxy_intercept_errors on" /etc/nginx/sites-available/eckasse.com.conf 2>/dev/null; then
    echo "  🌐 Nginx fallback fix: ✅ Applied"
else
    echo "  🌐 Nginx fallback fix: ❌ NOT applied"
fi
echo ""

echo "=================================="
echo "🏁 Deployment check completed!"