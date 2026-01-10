#!/bin/bash
# ================================================================
# OTT - OVH VPS Deploy Script
# ================================================================
# Script de déploiement automatique pour OVH VPS
# Usage: ./scripts/deploy/deploy-ovh.sh
# ================================================================

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
PROJECT_DIR="/opt/ott"
BACKUP_DIR="$PROJECT_DIR/backups"
LOG_FILE="$PROJECT_DIR/logs/deploy.log"

# Logging
log() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1" | tee -a "$LOG_FILE"
}

log_warn() {
    echo -e "${YELLOW}[$(date +'%Y-%m-%d %H:%M:%S')] WARN:${NC} $1" | tee -a "$LOG_FILE"
}

log_error() {
    echo -e "${RED}[$(date +'%Y-%m-%d %H:%M:%S')] ERROR:${NC} $1" | tee -a "$LOG_FILE"
}

log_info() {
    echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')] INFO:${NC} $1" | tee -a "$LOG_FILE"
}

# Check if running as root
if [[ $EUID -ne 0 ]]; then
   log_error "This script must be run as root"
   exit 1
fi

log "🚀 Starting OTT deployment to OVH VPS..."

# Create log directory
mkdir -p "$(dirname "$LOG_FILE")"

# Check if project directory exists
if [ ! -d "$PROJECT_DIR" ]; then
    log_error "Project directory $PROJECT_DIR does not exist"
    log_info "Please run the setup script first: curl -sSL https://raw.githubusercontent.com/your-repo/ott/main/scripts/deploy/ovh-setup.sh | bash"
    exit 1
fi

cd "$PROJECT_DIR"

# Backup current database
log_info "💾 Creating database backup..."
if docker ps | grep -q ott-db-ovh; then
    BACKUP_FILE="$BACKUP_DIR/backup_before_deploy_$(date +%Y%m%d_%H%M%S).sql"
    mkdir -p "$BACKUP_DIR"
    docker exec ott-db-ovh pg_dump -U ott_user ott > "$BACKUP_FILE"
    gzip "$BACKUP_FILE"
    log "Database backup created: $BACKUP_FILE.gz"
else
    log_warn "Database container not running, skipping backup"
fi

# Pull latest changes
log_info "📥 Pulling latest changes from repository..."
if [ -d ".git" ]; then
    git pull origin main
else
    log_warn "Not a git repository, skipping pull"
fi

# Build new images
log_info "🔨 Building Docker images..."
docker-compose -f docker-compose.ovh.yml build --no-cache

# Stop services gracefully
log_info "⏹️ Stopping services..."
docker-compose -f docker-compose.ovh.yml down

# Start services
log_info "▶️ Starting services..."
docker-compose -f docker-compose.ovh.yml up -d

# Wait for services to be ready
log_info "⏳ Waiting for services to be ready..."
sleep 30

# Health checks
log_info "🏥 Checking service health..."

# Check API
if curl -f -s http://localhost/api.php/health > /dev/null; then
    log "✅ API is healthy"
else
    log_error "❌ API health check failed"
fi

# Check database
if docker exec ott-db-ovh pg_isready -U ott_user -d ott > /dev/null; then
    log "✅ Database is healthy"
else
    log_error "❌ Database health check failed"
fi

# Check Redis
if docker exec ott-redis-ovh redis-cli ping > /dev/null; then
    log "✅ Redis is healthy"
else
    log_error "❌ Redis health check failed"
fi

# Cleanup old images
log_info "🧹 Cleaning up old Docker images..."
docker image prune -f

# Show status
log_info "📊 Service status:"
docker-compose -f docker-compose.ovh.yml ps

# Show logs (last 20 lines)
log_info "📋 Recent logs:"
docker-compose -f docker-compose.ovh.yml logs --tail=20

# Update SSL certificate if needed
if [ -f "/etc/letsencrypt/live/votre-domaine.ovh/fullchain.pem" ]; then
    log_info "🔒 Checking SSL certificate..."
    certbot renew --quiet
    docker-compose -f docker-compose.ovh.yml restart nginx
fi

log "✅ Deployment completed successfully!"
log_info "🌐 Your API is available at: https://votre-domaine.ovh"
log_info "📊 Monitor logs with: docker-compose -f docker-compose.ovh.yml logs -f"
log_info "🔄 To restart: docker-compose -f docker-compose.ovh.yml restart"

# Send notification (optional)
# You can add webhook or email notification here

exit 0
