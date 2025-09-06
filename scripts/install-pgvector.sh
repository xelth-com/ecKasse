#!/bin/bash
# Install pgvector extension for PostgreSQL
# Run with: sudo ./scripts/install-pgvector.sh

set -e

echo "🚀 Checking pgvector extension for PostgreSQL..."

# Check if PostgreSQL is installed
if ! command -v psql &> /dev/null; then
    echo "❌ PostgreSQL is not installed!"
    exit 1
fi

# Get PostgreSQL version
PG_VERSION=$(psql --version | grep -oP '\d+' | head -1)
echo "📦 Detected PostgreSQL version: $PG_VERSION"

# Check if pgvector is already installed
if ls /usr/lib/postgresql/$PG_VERSION/lib/vector.so 2>/dev/null; then
    echo "✅ pgvector is already installed"
    
    # Check if extension is enabled in database
    if sudo -u postgres psql -d eckwms -tAc "SELECT 1 FROM pg_extension WHERE extname='vector';" 2>/dev/null | grep -q 1; then
        echo "✅ pgvector extension is already enabled in database"
        exit 0
    else
        echo "🔧 Enabling pgvector extension in database..."
        sudo -u postgres psql -d eckwms -c "CREATE EXTENSION IF NOT EXISTS vector;"
        echo "✅ pgvector extension enabled!"
        exit 0
    fi
fi

echo "📦 pgvector not found, installing..."

# Check if development packages are installed
if ! dpkg -l | grep -q postgresql-server-dev-$PG_VERSION; then
    echo "📦 Installing PostgreSQL development packages..."
    apt update
    apt install -y postgresql-server-dev-$PG_VERSION build-essential git
else
    echo "✅ PostgreSQL development packages already installed"
fi

# Download and compile pgvector
echo "🔨 Compiling pgvector..."
cd /tmp
rm -rf pgvector
git clone --branch v0.5.1 https://github.com/pgvector/pgvector.git
cd pgvector
make
make install

echo "🔄 Restarting PostgreSQL..."
systemctl restart postgresql

# Enable extension in database
echo "🔧 Enabling pgvector extension in database..."
sudo -u postgres psql -d eckwms -c "CREATE EXTENSION IF NOT EXISTS vector;"

echo "✅ pgvector installation and setup completed!"