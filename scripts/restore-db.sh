#!/usr/bin/env bash
set -euo pipefail

# Database restore script for Nexus Suite
# Usage: ./scripts/restore-db.sh <backup_file>

BACKUP_FILE="${1:?Usage: restore-db.sh <backup_file.sql.gz>}"
DB_URL="${DATABASE_URL:-postgresql://nexus:nexus@localhost:5500/nexus}"

if [ ! -f "$BACKUP_FILE" ]; then
  echo "[restore] Error: File not found: $BACKUP_FILE"
  exit 1
fi

echo "[restore] WARNING: This will overwrite the current database!"
read -p "Continue? [y/N] " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
  echo "[restore] Aborted."
  exit 0
fi

echo "[restore] Restoring from $BACKUP_FILE..."
gunzip -c "$BACKUP_FILE" | psql "$DB_URL" --quiet
echo "[restore] Database restored successfully."
