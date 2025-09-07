#!/bin/bash
set -e

echo "🔄 Updating ecKasse to latest version..."

# Change to project directory
cd /var/www/eckasse.com

# Сохраняем локальные изменения
echo "💾 Stashing local changes..."
git stash

# Получаем обновления
echo "📥 Fetching updates..."
git fetch

# Переходим на нужный коммит (замените на актуальный)
echo "🔀 Checking out commit 06f0ced..."
git checkout 06f0ced

echo "📦 Installing dependencies..."
npm install

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

# Apply fixes if needed
echo "🔧 Checking and applying fixes..."

# Fix logging issue in SelectionArea.svelte (if not already fixed)
if grep -q "addLog(" packages/desktop/frontend/src/SelectionArea.svelte; then
    echo "🔧 Fixing logging issue in SelectionArea.svelte..."
    sed -i 's/addLog(/\/\/ addLog(/g' packages/desktop/frontend/src/SelectionArea.svelte
    echo "✅ Logging issue fixed"
else
    echo "✅ Logging issue already fixed"
fi

# Fix vite.svg issue in HTML
if grep -q "vite.svg" packages/desktop/frontend/index.html; then
    echo "🔧 Fixing vite.svg issue in index.html..."
    sed -i '/<link rel="icon" type="image\/svg+xml" href="\/vite.svg" \/>/d' packages/desktop/frontend/index.html
    echo "✅ vite.svg issue fixed"
else
    echo "✅ vite.svg issue already fixed"
fi

echo "🏗️ Building frontend..."
npm run build --workspace=@eckasse/desktop-frontend

echo "🔄 Restarting application..."
pm2 restart eckasse-desktop-server

# Wait a moment for restart
sleep 2

echo ""
echo "✅ Update completed successfully!"
echo ""
echo "📊 Application Status:"
pm2 status eckasse-desktop-server

echo ""
echo "📝 Recent logs:"
pm2 logs eckasse-desktop-server --lines 10 --nostream

echo ""
echo "🌐 Application should be available at: https://eckasse.com"