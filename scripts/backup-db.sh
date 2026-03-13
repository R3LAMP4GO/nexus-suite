#!/usr/bin/env bash
set -euo pipefail

# Database backup script for Nexus Suite
# Usage: ./scripts/backup-db.sh [backup_dir]

BACKUP_DIR="${1:-./backups}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
DB_URL="${DATABASE_URL:-postgresql://nexus:nexus@localhost:5500/nexus}"

mkdir -p "$BACKUP_DIR"

BACKUP_FILE="$BACKUP_DIR/nexus_${TIMESTAMP}.sql.gz"

echo "[backup] Starting database backup..."
pg_dump "$DB_URL" --no-owner --no-acl --clean --if-exists | gzip > "$BACKUP_FILE"

echo "[backup] Backup saved to $BACKUP_FILE ($(du -h "$BACKUP_FILE" | cut -f1))"

# Retain only last 30 backups
cd "$BACKUP_DIR"
ls -t nexus_*.sql.gz 2>/dev/null | tail -n +31 | xargs -r rm --
echo "[backup] Cleanup complete — $(ls nexus_*.sql.gz 2>/dev/null | wc -l) backups retained"
