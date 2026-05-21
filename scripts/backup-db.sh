#!/usr/bin/env bash
set -euo pipefail

DB_FILE="bloomlink.db"
BACKUP_DIR="backups"

if [ ! -f "$DB_FILE" ]; then
  echo "Database file not found: $DB_FILE"
  exit 1
fi

mkdir -p "$BACKUP_DIR"

TIMESTAMP="$(date +"%Y-%m-%d-%H%M")"
BACKUP_PATH="$BACKUP_DIR/bloomlink-$TIMESTAMP.db"

cp "$DB_FILE" "$BACKUP_PATH"

echo "Database backup created: $BACKUP_PATH"
