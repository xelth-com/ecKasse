#!/bin/bash

TENANT_NAME=$1
PORT=$2
DISPLAY_NAME=$3

if [ -z "$TENANT_NAME" ] || [ -z "$PORT" ] || [ -z "$DISPLAY_NAME" ]; then
    echo "Usage: $0 <tenant-name> <port> <display-name>"
    echo "Example: $0 eckasse-com 3030 'Eckasse Main'"
    exit 1
fi

echo "INFO: Creating tenant: $TENANT_NAME on port $PORT"
echo "INFO: Display name: $DISPLAY_NAME"
echo "INFO: Multi-tenant architecture is in development"
echo "INFO: Running single-instance mode on port $PORT"
echo "INFO: Tenant '$TENANT_NAME' configuration saved"

mkdir -p /var/www/eckasse.com/tenants
cat > /var/www/eckasse.com/tenants/${TENANT_NAME}.json << EOF
{
  "name": "$TENANT_NAME",
  "port": $PORT,
  "displayName": "$DISPLAY_NAME",
  "status": "active",
  "created": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
EOF

echo "INFO: Tenant configuration created at /var/www/eckasse.com/tenants/${TENANT_NAME}.json"
echo "INFO: Ready to start application on port $PORT"