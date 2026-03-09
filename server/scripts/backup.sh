#!/bin/bash
# Database backup script for the negotiation experiment platform.
#
# Creates a compressed pg_dump of the database.
# On DSRI, mount a PVC at /backups and run this via an OpenShift CronJob.
#
# Usage:
#   DB_HOST=localhost DB_USER=neg DB_NAME=negplatform ./backup.sh
#
# Or set DATABASE_URL and it will parse the connection string.

set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/backups}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
FILENAME="negplatform_${TIMESTAMP}.dump"

# Parse DATABASE_URL if set, otherwise use individual vars
if [ -n "${DATABASE_URL:-}" ]; then
  pg_dump "${DATABASE_URL}" -F c -f "${BACKUP_DIR}/${FILENAME}"
else
  DB_HOST="${DB_HOST:-localhost}"
  DB_PORT="${DB_PORT:-5432}"
  DB_USER="${DB_USER:-neg}"
  DB_NAME="${DB_NAME:-negplatform}"
  pg_dump -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -F c -f "${BACKUP_DIR}/${FILENAME}"
fi

echo "Backup created: ${BACKUP_DIR}/${FILENAME}"

# Remove backups older than 30 days
find "${BACKUP_DIR}" -name "negplatform_*.dump" -mtime +30 -delete 2>/dev/null || true
echo "Cleanup complete (removed backups older than 30 days)"
