#!/usr/bin/env bash
set -euo pipefail
: "${MARIADB_ROOT_PASSWORD:?MARIADB_ROOT_PASSWORD is required}"
BACKUP_DIR="${BACKUP_DIR:-./backups}"
mkdir -p "$BACKUP_DIR"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
FILE="$BACKUP_DIR/master_control_$STAMP.sql.gz"
docker compose exec -T mariadb mariadb-dump -uroot -p"$MARIADB_ROOT_PASSWORD" --all-databases --single-transaction --routines --events | gzip > "$FILE"
find "$BACKUP_DIR" -type f -name '*.sql.gz' -mtime +30 -delete
echo "Backup written to $FILE"
