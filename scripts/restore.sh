#!/usr/bin/env bash
#
# OpenWA restore.
#
# Restores the single PostgreSQL database (auth/API keys + audit + all data) and the WhatsApp
# sessions/media from an archive produced by scripts/backup.sh.
#
# Usage:
#   ./scripts/restore.sh <backup-archive.tar.gz>
# Environment:
#   OPENWA_DATA_DIR   data directory to restore into (default: ./data)
#   DATABASE_URL, or DATABASE_HOST/PORT/USERNAME/PASSWORD/NAME  (target Postgres)
#   RESTORE_DB=true   also import database.sql into Postgres (default: false — printed instead)
#
# Stop the OpenWA app before restoring. A snapshot of the current data dir is taken
# first so a bad restore can be undone.
#
set -euo pipefail

ARCHIVE="${1:-}"
DATA_DIR="${OPENWA_DATA_DIR:-./data}"

log() { echo "[restore] $*"; }

if [ -z "$ARCHIVE" ] || [ ! -f "$ARCHIVE" ]; then
  echo "Usage: $0 <backup-archive.tar.gz>" >&2
  exit 1
fi

STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT

log "Extracting $ARCHIVE"
tar -xzf "$ARCHIVE" -C "$STAGE"

# Safety snapshot of whatever is there now.
if [ -d "$DATA_DIR" ] && [ -n "$(ls -A "$DATA_DIR" 2>/dev/null || true)" ]; then
  SAFETY="${DATA_DIR%/}.pre-restore-$(date +%Y%m%d-%H%M%S)"
  log "Snapshotting current data dir -> $SAFETY"
  cp -r "$DATA_DIR" "$SAFETY"
fi

mkdir -p "$DATA_DIR"

if [ -d "$STAGE/sessions" ]; then
  log "Restoring WhatsApp sessions"
  rm -rf "$DATA_DIR/sessions"
  cp -r "$STAGE/sessions" "$DATA_DIR/sessions"
fi

if [ -d "$STAGE/media" ]; then
  log "Restoring local media"
  rm -rf "$DATA_DIR/media"
  cp -r "$STAGE/media" "$DATA_DIR/media"
fi

if [ -f "$STAGE/database.sql" ]; then
  if [ "${RESTORE_DB:-false}" = "true" ]; then
    log "Importing database.sql into PostgreSQL"
    if [ -n "${DATABASE_URL:-}" ]; then
      psql "$DATABASE_URL" <"$STAGE/database.sql"
    else
      PGPASSWORD="${DATABASE_PASSWORD:-}" psql \
        -h "${DATABASE_HOST:-localhost}" \
        -p "${DATABASE_PORT:-5432}" \
        -U "${DATABASE_USERNAME:-openwa}" \
        "${DATABASE_NAME:-openwa}" <"$STAGE/database.sql"
    fi
  else
    cp "$STAGE/database.sql" "$DATA_DIR/database.sql"
    log "Postgres dump saved to $DATA_DIR/database.sql — import it into your Postgres instance:"
    log "  psql \"\$DATABASE_URL\" < $DATA_DIR/database.sql"
    log "  (or re-run with RESTORE_DB=true to import automatically)"
  fi
else
  log "WARN: database.sql not in archive — API keys / data will NOT be restored"
fi

log "Restore complete. Start the app and confirm an existing API key still authenticates."
