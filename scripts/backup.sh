#!/usr/bin/env bash
#
# OpenWA backup.
#
# Captures EVERYTHING needed to restore a working install:
#   - database.sql  — the single PostgreSQL database (auth/API keys, audit, sessions,
#                     messages, webhooks, templates, …) via pg_dump
#   - sessions/     — WhatsApp LocalAuth session data
#   - media/        — locally-stored media (skipped automatically when using S3)
#
# NOTE: the project now runs on a SINGLE PostgreSQL database (SQLite support removed), and API keys
# live in that database — so a full pg_dump captures them. There are no more .sqlite files to back up.
#
# Usage:
#   ./scripts/backup.sh
# Environment:
#   OPENWA_DATA_DIR   data directory (default: ./data)
#   BACKUP_DIR        where archives are written (default: ./backups)
#   DATABASE_URL, or DATABASE_HOST/PORT/USERNAME/PASSWORD/NAME
#
set -euo pipefail

DATA_DIR="${OPENWA_DATA_DIR:-./data}"
BACKUP_DIR="${BACKUP_DIR:-./backups}"
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"

SESSIONS_DIR="$DATA_DIR/sessions"
MEDIA_DIR="$DATA_DIR/media"

log() { echo "[backup] $*"; }

STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT

log "Backing up the PostgreSQL database via pg_dump (includes API keys + audit log)"
if ! command -v pg_dump >/dev/null 2>&1; then
  log "ERROR: pg_dump is not installed"
  exit 1
fi
if [ -n "${DATABASE_URL:-}" ]; then
  pg_dump "$DATABASE_URL" >"$STAGE/database.sql"
else
  PGPASSWORD="${DATABASE_PASSWORD:-}" pg_dump \
    -h "${DATABASE_HOST:-localhost}" \
    -p "${DATABASE_PORT:-5432}" \
    -U "${DATABASE_USERNAME:-openwa}" \
    "${DATABASE_NAME:-openwa}" >"$STAGE/database.sql"
fi

if [ -d "$SESSIONS_DIR" ]; then
  log "Backing up WhatsApp sessions"
  cp -r "$SESSIONS_DIR" "$STAGE/sessions"
else
  log "WARN: $SESSIONS_DIR not found — skipping sessions"
fi

if [ -d "$MEDIA_DIR" ]; then
  log "Backing up local media"
  cp -r "$MEDIA_DIR" "$STAGE/media"
fi

mkdir -p "$BACKUP_DIR"
ARCHIVE="$BACKUP_DIR/openwa-backup-$TIMESTAMP.tar.gz"
tar -czf "$ARCHIVE" -C "$STAGE" .

log "Backup complete: $ARCHIVE"
log "Contents:"
tar -tzf "$ARCHIVE" | sed 's/^/[backup]   /'
