#!/bin/bash
# Run database migrations for eckasse
# Run from project root: ./scripts/migrate-database.sh

set -e

echo "🚀 Checking database migrations..."

# Check if we're in the project root
if [ ! -f "package.json" ] || ! grep -q "eckasse" package.json; then
    echo "❌ Please run this script from the project root directory"
    exit 1
fi

# Check if database configuration exists
if [ ! -f "packages/core/db/knexfile.js" ]; then
    echo "❌ Database configuration not found!"
    exit 1
fi

# Check database connection
echo "🔍 Checking database connection..."
if ! node -e "
const knex = require('./packages/core/db/knex.js');
knex.raw('SELECT 1').then(() => {
    console.log('✅ Database connection successful');
    knex.destroy();
}).catch(err => {
    console.error('❌ Database connection failed:', err.message);
    process.exit(1);
});
"; then
    echo "❌ Cannot connect to database"
    exit 1
fi

# Check current migration status
echo "🔍 Checking migration status..."
PENDING_MIGRATIONS=$(node -e "
const knex = require('./packages/core/db/knex.js');
knex.migrate.list().then(([completed, pending]) => {
    if (pending.length === 0) {
        console.log('✅ All migrations are up to date');
        process.exit(0);
    } else {
        console.log('📝 Pending migrations:', pending.length);
        pending.forEach(migration => console.log('  -', migration));
        process.exit(1);
    }
    knex.destroy();
}).catch(err => {
    console.error('❌ Failed to check migrations:', err.message);
    process.exit(2);
});
" 2>&1)

MIGRATION_CHECK=$?

if [ $MIGRATION_CHECK -eq 0 ]; then
    echo "✅ Database is up to date"
    exit 0
elif [ $MIGRATION_CHECK -eq 1 ]; then
    echo "$PENDING_MIGRATIONS"
    echo ""
    read -p "Run pending migrations? (y/N): " -n 1 -r
    echo ""
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "❌ Migration cancelled"
        exit 0
    fi
else
    echo "$PENDING_MIGRATIONS"
    exit 1
fi

# Run migrations
echo "🔄 Running database migrations..."
if node -e "
const knex = require('./packages/core/db/knex.js');
knex.migrate.latest().then(() => {
    console.log('✅ Migrations completed successfully');
    knex.destroy();
}).catch(err => {
    console.error('❌ Migration failed:', err.message);
    knex.destroy();
    process.exit(1);
});
"; then
    echo "✅ Database migration completed!"
else
    echo "❌ Migration failed!"
    exit 1
fi