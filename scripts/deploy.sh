#!/usr/bin/env bash
# ── Nexus Suite — Deployment Script ─────────────────────────────
# Usage: ./scripts/deploy.sh <command> [options]
# Full deploy: ./scripts/deploy.sh build && ./scripts/deploy.sh migrate && ./scripts/deploy.sh up
set -euo pipefail

# Auto-detect mode: production uses all overlays, dev skips production overlay
if [ "${NEXUS_ENV:-dev}" = "production" ]; then
  COMPOSE_FILES="-f docker-compose.yml -f docker-compose.production.yml -f docker-compose.monitoring.yml"
else
  COMPOSE_FILES="-f docker-compose.yml -f docker-compose.monitoring.yml"
fi
PROJECT="nexus-suite"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

log()  { echo -e "${CYAN}[nexus]${NC} $1"; }
ok()   { echo -e "${GREEN}[  ok ]${NC} $1"; }
warn() { echo -e "${YELLOW}[warn]${NC} $1"; }
err()  { echo -e "${RED}[fail]${NC} $1"; }

# ── Pre-flight checks ───────────────────────────────────────────

preflight() {
  log "Running pre-flight checks..."

  # Docker
  if ! command -v docker &>/dev/null; then
    err "Docker is not installed."; exit 1
  fi
  local docker_ver
  docker_ver=$(docker --version | sed -n 's/.*version \([0-9][0-9.]*\).*/\1/p')
  ok "Docker ${docker_ver}"

  # Docker Compose
  if ! docker compose version &>/dev/null; then
    err "Docker Compose V2 is not installed."; exit 1
  fi
  ok "Docker Compose $(docker compose version --short)"

  # .env file — check .env first, fall back to .env.local for dev
  local env_file=""
  if [ -f .env ]; then
    env_file=".env"
  elif [ -f .env.local ]; then
    env_file=".env.local"
  fi

  if [ -z "$env_file" ]; then
    err "No .env or .env.local found. Copy .env.example and fill in values."
    err "  cp .env.example .env && nano .env"
    exit 1
  fi
  ok "Environment: ${env_file}"

  # Critical env vars
  local required_vars=(
    "POSTGRES_PASSWORD"
    "STRIPE_SECRET_KEY"
    "R2_ACCOUNT_ID"
    "GOOGLE_CLIENT_ID"
    "GOOGLE_CLIENT_SECRET"
  )

  local missing=0
  for var in "${required_vars[@]}"; do
    val=$(grep "^${var}=" "$env_file" 2>/dev/null | head -1 | cut -d'=' -f2- | tr -d '"')
    if [ -z "$val" ] || [[ "$val" == *"..."* ]] || [[ "$val" == "change-me"* ]]; then
      warn "Missing or placeholder: $var"
      missing=$((missing + 1))
    fi
  done

  if [ $missing -gt 0 ]; then
    warn "$missing env vars need attention. Continuing anyway..."
  else
    ok "All critical env vars set"
  fi

  # System resources
  local mem_gb="?"
  if [ -f /proc/meminfo ]; then
    mem_gb=$(awk '/MemTotal/ {printf "%.0f", $2/1024/1024}' /proc/meminfo)
  elif command -v sysctl &>/dev/null; then
    mem_gb=$(sysctl -n hw.memsize 2>/dev/null | awk '{printf "%.0f", $1/1024/1024/1024}')
  fi

  if [ "$mem_gb" != "?" ] && [ "$mem_gb" -lt 16 ]; then
    warn "System has ${mem_gb}GB RAM. Recommended: 16GB+ for all services."
  else
    ok "System RAM: ${mem_gb}GB"
  fi

  # Docker daemon running?
  if docker info &>/dev/null; then
    ok "Docker daemon running"
  else
    err "Docker daemon is not running. Start Docker Desktop or dockerd."
    exit 1
  fi

  echo ""
}

# ── Commands ─────────────────────────────────────────────────────

do_build() {
  log "Building all containers..."
  docker compose $COMPOSE_FILES -p $PROJECT build --parallel
  ok "Build complete"
}

do_migrate() {
  log "Running database migrations..."

  # Ensure DB is up
  docker compose $COMPOSE_FILES -p $PROJECT up -d db
  log "Waiting for PostgreSQL..."

  local retries=0
  while ! docker compose $COMPOSE_FILES -p $PROJECT exec -T db pg_isready -U nexus &>/dev/null; do
    retries=$((retries + 1))
    if [ $retries -ge 30 ]; then
      err "PostgreSQL failed to start after 30s"; exit 1
    fi
    sleep 1
  done
  ok "PostgreSQL ready"

  # Run migrations
  docker compose $COMPOSE_FILES -p $PROJECT run --rm nexus-app \
    npx prisma migrate deploy
  ok "Migrations complete"
}

do_up() {
  log "Starting all services..."
  docker compose $COMPOSE_FILES -p $PROJECT up -d
  ok "All services started"
  echo ""
  do_status
}

do_down() {
  log "Stopping all services..."
  docker compose $COMPOSE_FILES -p $PROJECT down
  ok "All services stopped"
}

do_logs() {
  local service="${1:-}"
  if [ -n "$service" ]; then
    docker compose $COMPOSE_FILES -p $PROJECT logs -f "$service"
  else
    docker compose $COMPOSE_FILES -p $PROJECT logs -f --tail=100
  fi
}

do_status() {
  log "Service status:"
  echo ""
  docker compose $COMPOSE_FILES -p $PROJECT ps --format "table {{.Name}}\t{{.Status}}\t{{.Ports}}"
  echo ""

  # Quick health checks
  log "Health checks:"
  local app_url="http://localhost:3000"

  if curl -sf "${app_url}/api/health" &>/dev/null; then
    ok "App: ${app_url}/api/health ✓"
  else
    warn "App: not responding (may still be starting)"
  fi

  if docker compose $COMPOSE_FILES -p $PROJECT exec -T db pg_isready -U nexus &>/dev/null; then
    ok "PostgreSQL: ready"
  else
    warn "PostgreSQL: not ready"
  fi

  if docker compose $COMPOSE_FILES -p $PROJECT exec -T redis redis-cli ping 2>/dev/null | grep -q PONG; then
    ok "Redis: ready"
  else
    warn "Redis: not ready"
  fi
}

do_restart() {
  local service="${1:-}"
  if [ -n "$service" ]; then
    log "Restarting $service..."
    docker compose $COMPOSE_FILES -p $PROJECT restart "$service"
  else
    log "Restarting all services..."
    docker compose $COMPOSE_FILES -p $PROJECT restart
  fi
  ok "Restart complete"
}

do_backup() {
  local timestamp
  timestamp=$(date +%Y%m%d_%H%M%S)
  local backup_dir="backups/${timestamp}"
  mkdir -p "$backup_dir"

  log "Backing up database to ${backup_dir}..."
  docker compose $COMPOSE_FILES -p $PROJECT exec -T db \
    pg_dump -U nexus nexus --format=custom \
    > "${backup_dir}/nexus_${timestamp}.dump"

  ok "Database backup: ${backup_dir}/nexus_${timestamp}.dump"

  # Backup Infisical DB too
  docker compose $COMPOSE_FILES -p $PROJECT exec -T infisical-db \
    pg_dump -U nexus infisical --format=custom \
    > "${backup_dir}/infisical_${timestamp}.dump" 2>/dev/null || warn "Infisical DB backup skipped"

  ok "Backup complete"
}

do_update() {
  log "Pulling latest code and redeploying..."
  git pull --ff-only
  do_build
  do_migrate
  docker compose $COMPOSE_FILES -p $PROJECT up -d
  ok "Update complete"
}

do_infra() {
  log "Starting infrastructure only (db + redis)..."
  docker compose $COMPOSE_FILES -p $PROJECT up -d db redis
  log "Waiting for services..."

  local retries=0
  while ! docker compose $COMPOSE_FILES -p $PROJECT exec -T db pg_isready -U nexus &>/dev/null; do
    retries=$((retries + 1))
    if [ $retries -ge 30 ]; then
      err "PostgreSQL failed to start after 30s"; exit 1
    fi
    sleep 1
  done
  ok "PostgreSQL ready"

  retries=0
  while ! docker compose $COMPOSE_FILES -p $PROJECT exec -T redis redis-cli ping 2>/dev/null | grep -q PONG; do
    retries=$((retries + 1))
    if [ $retries -ge 15 ]; then
      err "Redis failed to start after 15s"; exit 1
    fi
    sleep 1
  done
  ok "Redis ready"
}

# ── Usage ────────────────────────────────────────────────────────

usage() {
  cat <<EOF
${CYAN}Nexus Suite — Deployment Script${NC}

Usage: $0 <command> [options]

Commands:
  preflight     Run pre-deployment checks
  build         Build all Docker containers
  migrate       Run Prisma database migrations
  infra         Start infrastructure only (db + redis)
  up            Start all services (detached)
  down          Stop all services
  restart [svc] Restart all or a specific service
  logs [svc]    Tail logs (all or specific service)
  status        Show service status + health checks
  backup        Backup PostgreSQL databases
  update        Git pull + rebuild + migrate + restart

Env:
  NEXUS_ENV=production  Use production compose overlay

Full deployment:
  $0 preflight && $0 build && $0 migrate && $0 up

Dev (infra only):
  $0 infra

Services: nexus-app, nexus-worker, scraper-pool, warming-service,
          media-engine, ml-sidecar, scrapling-sidecar, db, redis,
          infisical, prometheus, grafana
EOF
}

# ── Main ─────────────────────────────────────────────────────────

if [ $# -eq 0 ]; then
  usage
  exit 0
fi

case "$1" in
  preflight) preflight ;;
  build)     do_build ;;
  migrate)   do_migrate ;;
  infra)     do_infra ;;
  up)        do_up ;;
  down)      do_down ;;
  restart)   do_restart "${2:-}" ;;
  logs)      do_logs "${2:-}" ;;
  status)    do_status ;;
  backup)    do_backup ;;
  update)    do_update ;;
  *)         err "Unknown command: $1"; usage; exit 1 ;;
esac
