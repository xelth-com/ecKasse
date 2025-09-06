# ecKasse Deployment Guide

## Quick Deployment

For a complete deployment with all necessary setup:

```bash
sudo ./scripts/deploy.sh
```

This will automatically:
- Pull latest code
- Install dependencies
- Setup pgvector extension
- Run database migrations
- Configure nginx for large file uploads
- Build frontend
- Restart services

## Individual Scripts

### 1. pgvector Setup

```bash
sudo ./scripts/install-pgvector.sh
```

**What it does:**
- Checks if pgvector is already installed
- Installs PostgreSQL development packages if needed
- Compiles and installs pgvector from source
- Enables the extension in the database

### 2. Database Migrations

```bash
./scripts/migrate-database.sh
```

**What it does:**
- Checks database connection
- Lists pending migrations
- Runs migrations with confirmation
- Handles embedding table creation

### 3. Nginx Configuration

```bash
sudo ./scripts/setup-nginx.sh
```

**What it does:**
- Checks existing nginx config
- Adds `client_max_body_size 100M` if missing
- Tests configuration and reloads nginx
- Backs up original config

## Manual Deployment Steps

If you prefer manual deployment:

### 1. Update Code
```bash
git stash  # if you have local changes
git pull origin main
npm install
```

### 2. Database Setup
```bash
# Install pgvector if not installed
sudo ./scripts/install-pgvector.sh

# Run migrations
./scripts/migrate-database.sh
```

### 3. Configure Nginx
Add to `/etc/nginx/sites-available/eckasse.com.conf`:
```nginx
server {
    # ... existing config ...
    
    # Allow large file uploads for menu import
    client_max_body_size 100M;
    
    # ... rest of config ...
}
```

Then reload nginx:
```bash
sudo nginx -t && sudo systemctl reload nginx
```

### 4. Build and Restart
```bash
cd packages/desktop/frontend
npm run build
cd ../../..

pm2 restart eckasse-desktop-server
```

## Troubleshooting

### pgvector Issues
- **Error**: `pgvector extension not available`
  - **Solution**: Run `sudo ./scripts/install-pgvector.sh`

### File Upload Issues (413 Error)
- **Error**: `HTTP 413: Content Too Large`
  - **Solution**: Run `sudo ./scripts/setup-nginx.sh`

### Database Migration Issues
- **Error**: Migration failures
  - **Solution**: Check database connection and run `./scripts/migrate-database.sh`

### Menu Import Issues
Common problems after deployment:

1. **No items imported**: Check logs for embedding errors
2. **API overloaded**: Gemini API rate limits - wait and retry
3. **Database errors**: Run migration script

## File Upload Limits

The system now supports large file uploads (100MB) for menu imports:

- **Express.js**: 1MB (general requests)
- **Multer**: 100MB (menu uploads only)
- **Nginx**: 100MB (proxy limit)

## Production Checklist

Before going live:

- [ ] pgvector extension installed and enabled
- [ ] All database migrations applied
- [ ] Nginx configured for large uploads
- [ ] Frontend built with latest changes
- [ ] PM2 services running
- [ ] SSL certificates valid
- [ ] Backup system in place

## Environment Variables

Ensure these are set in `.env`:

```bash
NODE_ENV=production
DB_CLIENT=pg
PG_DATABASE=eckwms
PG_USERNAME=wms_user
PG_PASSWORD=your_password
PG_HOST=localhost
PG_PORT=5432
```

## Monitoring

After deployment, monitor:

- PM2 process status: `pm2 status`
- Application logs: `pm2 logs eckasse-desktop-server`
- Nginx logs: `sudo tail -f /var/log/nginx/error.log`
- Database connection: Test menu import functionality