#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

# CI runs this as a non-login shell, which doesn't source ~/.bashrc and so
# misses ~/.bun/bin where pm2 (bun-installed, same as kaasu) lives. Prepend
# it explicitly so the same script works in both contexts. node/npm are the
# system install in /usr/bin and are already on PATH.
export PATH="$HOME/.bun/bin:$PATH"

# Production secrets + PORT live in /etc/birdie/env (root-managed, chmod 600,
# readable by the deploy user). Source them so `next start` picks up PORT,
# ADMIN_PASSWORD, SESSION_SECRET, DATABASE_PATH, SPLITWISE_* etc.
# Local dev runs don't have this file — they rely on .env.local that Next.js
# auto-loads instead.
if [ -r /etc/birdie/env ]; then
  set -a
  # shellcheck disable=SC1091
  . /etc/birdie/env
  set +a
fi

DB_PATH="${DATABASE_PATH:-/var/lib/birdie/birdie.db}"
BACKUP_DIR="$HOME/backups"
DO_BACKUP=1

usage() {
  cat <<EOF
Usage: scripts/deploy.sh [options]

Pulls the latest code, rebuilds Birdie, and restarts it via pm2.

Options:
  --no-backup    Skip the pre-deploy SQLite snapshot.
  -h, --help     Show this help and exit.

Steps (in order):
  1. WAL-safe SQLite backup to ~/backups/birdie-pre-deploy-<timestamp>.db.gz
     (unless --no-backup, and only if the DB file already exists)
  2. git pull --ff-only
  3. npm ci           (recompiles the better-sqlite3 native module)
  4. npm run build
  5. pm2 restart birdie (or pm2 start … if no existing process)

Schema changes apply idempotently on boot (CREATE TABLE IF NOT EXISTS in
lib/db.ts), so there is no separate migration step.
EOF
}

for arg in "$@"; do
  case "$arg" in
    --no-backup) DO_BACKUP=0 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "unknown option: $arg" >&2; usage; exit 2 ;;
  esac
done

if [ "$DO_BACKUP" = "1" ] && [ -f "$DB_PATH" ]; then
  echo "==> backing up sqlite"
  mkdir -p "$BACKUP_DIR"
  out="$BACKUP_DIR/birdie-pre-deploy-$(date +%F-%H%M).db"
  # .backup is online + WAL-safe (unlike a plain cp of the -wal/-shm files).
  sqlite3 "$DB_PATH" ".backup '$out'"
  gzip -f "$out"
  echo "  saved $out.gz"
else
  echo "==> skipping backup"
fi

echo "==> git pull"
git pull --ff-only

echo "==> npm ci"
npm ci

echo "==> npm run build"
npm run build

echo "==> pm2 (re)start"
if pm2 describe birdie >/dev/null 2>&1; then
  pm2 restart birdie --update-env
else
  # First-time start: register the process so subsequent deploys can restart
  # it. After this runs once, follow up with `pm2 save` so pm2 reattaches
  # birdie after a reboot.
  pm2 start npm --name birdie --cwd "$(pwd)" -- run start
fi

echo "==> done"
