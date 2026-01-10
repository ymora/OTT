#!/bin/bash
# ================================================================
# OTT - OVH VPS Setup Script
# ================================================================
# Script d'installation initial pour OVH VPS
# Usage: curl -sSL https://raw.githubusercontent.com/your-repo/ott/main/scripts/deploy/ovh-setup.sh | bash
# ================================================================

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Logging
log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if running as root
if [[ $EUID -ne 0 ]]; then
   log_error "This script must be run as root"
   exit 1
fi

log_info "🚀 Starting OTT OVH VPS Setup..."

# Update system
log_info "📦 Updating system packages..."
apt update && apt upgrade -y

# Install required packages
log_info "🔧 Installing required packages..."
apt install -y \
    curl \
    wget \
    git \
    unzip \
    htop \
    fail2ban \
    ufw \
    certbot \
    python3-certbot-nginx \
    docker.io \
    docker-compose \
    nginx \
    postgresql-client \
    redis-tools

# Configure firewall
log_info "🔒 Configuring firewall..."
ufw --force reset
ufw default deny incoming
ufw default allow outgoing
ufw allow ssh
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

# Configure fail2ban
log_info "🛡️ Configuring fail2ban..."
cat > /etc/fail2ban/jail.local << EOF
[DEFAULT]
bantime = 3600
findtime = 600
maxretry = 3

[sshd]
enabled = true
port = ssh
filter = sshd
logpath = /var/log/auth.log
maxretry = 3

[nginx-http-auth]
enabled = true
filter = nginx-http-auth
logpath = /var/log/nginx/error.log
maxretry = 3

[nginx-limit-req]
enabled = true
filter = nginx-limit-req
logpath = /var/log/nginx/error.log
maxretry = 3
EOF

systemctl enable fail2ban
systemctl restart fail2ban

# Configure Docker
log_info "🐳 Configuring Docker..."
systemctl enable docker
systemctl start docker
usermod -aG docker $SUDO_USER

# Create directories
log_info "📁 Creating directories..."
mkdir -p /opt/ott/{logs,backups,ssl}
mkdir -p /opt/ott/nginx/{conf.d,ssl}
chown -R $SUDO_USER:$SUDO_USER /opt/ott

# Install Docker Compose
log_info "🔧 Installing Docker Compose..."
curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
chmod +x /usr/local/bin/docker-compose

# Create systemd service for OTT
log_info "⚙️ Creating OTT systemd service..."
cat > /etc/systemd/system/ott.service << EOF
[Unit]
Description=OTT Docker Compose
Requires=docker.service
After=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=/opt/ott
ExecStart=/usr/local/bin/docker-compose -f docker-compose.ovh.yml up -d
ExecStop=/usr/local/bin/docker-compose -f docker-compose.ovh.yml down
TimeoutStartSec=0

[Install]
WantedBy=multi-user.target
EOF

systemctl enable ott.service

# Setup log rotation
log_info "📋 Setting up log rotation..."
cat > /etc/logrotate.d/ott << EOF
/opt/ott/logs/*.log {
    daily
    missingok
    rotate 30
    compress
    delaycompress
    notifempty
    create 644 root root
    postrotate
        docker-compose -f /opt/ott/docker-compose.ovh.yml restart nginx
    endscript
}
EOF

# Setup automatic backups
log_info "💾 Setting up automatic backups..."
cat > /opt/ott/backup.sh << 'EOF'
#!/bin/bash
# OTT Database Backup Script

BACKUP_DIR="/opt/ott/backups"
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/ott_backup_$DATE.sql"

# Create backup
docker exec ott-db-ovh pg_dump -U ott_user ott > $BACKUP_FILE

# Compress backup
gzip $BACKUP_FILE

# Keep only last 7 days
find $BACKUP_DIR -name "*.sql.gz" -mtime +7 -delete

echo "Backup completed: $BACKUP_FILE.gz"
EOF

chmod +x /opt/ott/backup.sh

# Add to crontab
(crontab -l 2>/dev/null; echo "0 2 * * * /opt/ott/backup.sh") | crontab -

# Security hardening
log_info "🔒 Security hardening..."
# Disable root SSH login (optional)
sed -i 's/#PermitRootLogin yes/PermitRootLogin no/' /etc/ssh/sshd_config
sed -i 's/#PasswordAuthentication yes/PasswordAuthentication no/' /etc/ssh/sshd_config

# Restart SSH
systemctl restart ssh

# Display setup completion message
log_info "✅ OTT OVH VPS Setup completed!"
echo ""
log_info "Next steps:"
echo "1. Clone your repository: cd /opt/ott && git clone <your-repo> ."
echo "2. Copy .env.ovh.example to .env.production and configure it"
echo "3. Run: docker-compose -f docker-compose.ovh.yml up -d"
echo "4. Setup SSL: certbot --nginx -d votre-domaine.ovh"
echo "5. Monitor logs: docker-compose -f docker-compose.ovh.yml logs -f"
echo ""
log_warn "Important: Don't forget to configure your .env.production file!"
log_warn "Important: Setup your domain name and SSL certificate!"
log_warn "Important: Configure your SSH keys for secure access!"

# Reboot suggestion
echo ""
log_info "System will reboot in 10 seconds to apply all changes..."
sleep 10
reboot
