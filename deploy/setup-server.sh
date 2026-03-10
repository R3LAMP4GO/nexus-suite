#!/usr/bin/env bash
# ── Nexus Suite — Server Setup Script ───────────────────────────
# Run this ONCE on a fresh Ubuntu 22.04/24.04 VPS.
# Sets up Docker, Caddy, firewall, and swap.
#
# Usage: curl -sSL https://raw.githubusercontent.com/your-org/nexus-suite/main/deploy/setup-server.sh | bash
#   or:  bash deploy/setup-server.sh
set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
NC='\033[0m'

log()  { echo -e "${CYAN}[setup]${NC} $1"; }
ok()   { echo -e "${GREEN}[  ok ]${NC} $1"; }

# ── Must be root ─────────────────────────────────────────────────

if [ "$(id -u)" -ne 0 ]; then
  echo "Run as root: sudo bash $0"
  exit 1
fi

# ── System updates ───────────────────────────────────────────────

log "Updating system packages..."
apt-get update -qq
apt-get upgrade -y -qq
ok "System updated"

# ── Docker ───────────────────────────────────────────────────────

if ! command -v docker &>/dev/null; then
  log "Installing Docker..."
  curl -fsSL https://get.docker.com | sh
  systemctl enable docker
  systemctl start docker
  ok "Docker installed"
else
  ok "Docker already installed"
fi

# Add current user to docker group (if not root)
if [ -n "${SUDO_USER:-}" ]; then
  usermod -aG docker "$SUDO_USER"
  ok "Added $SUDO_USER to docker group"
fi

# ── Caddy ────────────────────────────────────────────────────────

if ! command -v caddy &>/dev/null; then
  log "Installing Caddy..."
  apt-get install -y -qq debian-keyring debian-archive-keyring apt-transport-https curl
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -qq
  apt-get install -y -qq caddy
  ok "Caddy installed"
else
  ok "Caddy already installed"
fi

# ── Firewall (UFW) ──────────────────────────────────────────────

log "Configuring firewall..."
apt-get install -y -qq ufw

ufw default deny incoming
ufw default allow outgoing

# SSH
ufw allow 22/tcp comment 'SSH'

# HTTP + HTTPS (Caddy handles TLS)
ufw allow 80/tcp comment 'HTTP'
ufw allow 443/tcp comment 'HTTPS'

# Enable without prompt
ufw --force enable
ok "Firewall configured (SSH + HTTP + HTTPS only)"

# Verify internal ports are NOT exposed
log "Verifying internal ports are firewalled..."
for port in 5432 6379 8080 8001 8002 3001 9090; do
  if ufw status | grep -q "$port.*ALLOW"; then
    echo -e "${RED}WARNING: Port $port is exposed! Remove with: ufw delete allow $port${NC}"
  fi
done
ok "Internal ports secured"

# ── Swap (for 16GB servers under heavy load) ────────────────────

if [ ! -f /swapfile ]; then
  log "Creating 4GB swap..."
  fallocate -l 4G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
  # Reduce swappiness for production
  echo 'vm.swappiness=10' >> /etc/sysctl.conf
  sysctl vm.swappiness=10
  ok "4GB swap enabled"
else
  ok "Swap already configured"
fi

# ── Kernel tuning ───────────────────────────────────────────────

log "Applying kernel optimizations..."
cat >> /etc/sysctl.conf <<'EOF'

# Nexus Suite — production tuning
net.core.somaxconn = 65535
net.ipv4.tcp_max_syn_backlog = 65535
net.ipv4.ip_local_port_range = 1024 65535
fs.file-max = 2097152
fs.inotify.max_user_watches = 524288
EOF
sysctl -p &>/dev/null
ok "Kernel tuned"

# ── Log rotation for Docker ─────────────────────────────────────

log "Configuring Docker log rotation..."
mkdir -p /etc/docker
cat > /etc/docker/daemon.json <<'EOF'
{
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "50m",
    "max-file": "5"
  }
}
EOF
systemctl restart docker
ok "Docker log rotation configured"

# ── Create app directory ────────────────────────────────────────

APP_DIR="/opt/nexus-suite"
if [ ! -d "$APP_DIR" ]; then
  mkdir -p "$APP_DIR"
  if [ -n "${SUDO_USER:-}" ]; then
    chown "$SUDO_USER:$SUDO_USER" "$APP_DIR"
  fi
  ok "Created $APP_DIR"
fi

# ── Caddy log directory ─────────────────────────────────────────

mkdir -p /var/log/caddy
chown caddy:caddy /var/log/caddy
ok "Caddy log directory ready"

# ── Summary ─────────────────────────────────────────────────────

echo ""
echo -e "${GREEN}════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}  Server setup complete!${NC}"
echo -e "${GREEN}════════════════════════════════════════════════════${NC}"
echo ""
echo "Next steps:"
echo "  1. Clone repo:  cd /opt/nexus-suite && git clone <repo-url> ."
echo "  2. Configure:   cp .env.example .env && nano .env"
echo "  3. Set domain:  cp deploy/Caddyfile /etc/caddy/Caddyfile"
echo "     Edit DOMAIN, GRAFANA_DOMAIN, ACME_EMAIL"
echo "  4. Start Caddy:  systemctl restart caddy"
echo "  5. Deploy:       ./scripts/deploy.sh preflight && ./scripts/deploy.sh build && ./scripts/deploy.sh migrate && ./scripts/deploy.sh up"
echo ""
if [ -n "${SUDO_USER:-}" ]; then
  echo "NOTE: Log out and back in for docker group to take effect."
fi
