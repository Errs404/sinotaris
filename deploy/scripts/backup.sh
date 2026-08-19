#!/bin/sh
set -eu

umask 077
LOCK_FILE=/var/lock/sinotaris-deploy.lock

command -v flock >/dev/null 2>&1 || { echo "flock is required (Ubuntu package: util-linux)." >&2; exit 1; }
if [ "${SINOTARIS_LOCK_HELD:-0}" = "1" ]; then
  flock -n 9 || { echo "Inherited Sinotaris operation lock is unavailable." >&2; exit 1; }
else
  if [ ! -e "$LOCK_FILE" ]; then
    sudo install -m 0600 -o "$(id -u)" -g "$(id -g)" /dev/null "$LOCK_FILE"
  fi
  [ -f "$LOCK_FILE" ] && [ ! -L "$LOCK_FILE" ] && [ -r "$LOCK_FILE" ] && [ -w "$LOCK_FILE" ] || {
    echo "$LOCK_FILE must be a regular, non-symlink file readable and writable by the operator." >&2
    exit 1
  }
  exec 9<>"$LOCK_FILE"
  flock -n 9 || { echo "Another Sinotaris deploy or backup operation is running." >&2; exit 1; }
fi

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
DEPLOY_DIR=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)
REPO_DIR=$(CDPATH= cd -- "$DEPLOY_DIR/.." && pwd)
COMPOSE_FILE="$DEPLOY_DIR/compose.yml"
ENV_FILE="$DEPLOY_DIR/.env.production"
BACKUP_ROOT=${BACKUP_ROOT:-/srv/sinotaris/backups}

env_value() {
  key=$1
  value=$(sed -n "s/^${key}=//p" "$ENV_FILE" | tail -n 1 | tr -d '\r')
  [ -n "$value" ] || { echo "Required environment key $key is missing or empty." >&2; exit 1; }
  printf '%s' "$value"
}

case "$BACKUP_ROOT" in
  /srv/sinotaris/backups) ;;
  /srv/sinotaris/*)
    [ "${ALLOW_CUSTOM_BACKUP_ROOT:-0}" = "1" ] || { echo "Custom BACKUP_ROOT requires ALLOW_CUSTOM_BACKUP_ROOT=1." >&2; exit 1; }
    ;;
  *) echo "BACKUP_ROOT must be /srv/sinotaris/backups or an explicitly allowed path below /srv/sinotaris/." >&2; exit 1 ;;
esac
[ ! -L "$BACKUP_ROOT" ] || { echo "BACKUP_ROOT must not be a symlink." >&2; exit 1; }
mkdir -p "$BACKUP_ROOT"
CANONICAL_ROOT=$(realpath "$BACKUP_ROOT")
case "$CANONICAL_ROOT" in
  /srv/sinotaris/backups|/srv/sinotaris/*) ;;
  *) echo "Canonical BACKUP_ROOT escaped /srv/sinotaris." >&2; exit 1 ;;
esac
[ ! -L "$CANONICAL_ROOT" ] || { echo "Canonical BACKUP_ROOT must not be a symlink." >&2; exit 1; }
BACKUP_ROOT=$CANONICAL_ROOT
chmod 700 "$BACKUP_ROOT"

STAMP=$(date -u +%Y%m%dT%H%M%SZ)
FINAL_DIR="$BACKUP_ROOT/$STAMP"
WORK_DIR="$BACKUP_ROOT/.partial-$STAMP-$$"
APP_WAS_RUNNING=0
RESTART_FAILED=0

[ -f "$ENV_FILE" ] || { echo "Missing $ENV_FILE" >&2; exit 1; }
PROXY_MODE=$(env_value PROXY_MODE)
case "$PROXY_MODE" in
  nginx|caddy) ;;
  *) echo "PROXY_MODE must be exactly nginx or caddy." >&2; exit 1 ;;
esac
[ ! -e "$FINAL_DIR" ] || { echo "Backup destination already exists." >&2; exit 1; }
[ ! -e "$WORK_DIR" ] || { echo "Backup work directory already exists." >&2; exit 1; }
GIT_SHA=$(git -C "$REPO_DIR" rev-parse HEAD 2>/dev/null || printf 'unknown')
export GIT_SHA

compose() {
  if [ "$PROXY_MODE" = "nginx" ]; then
    docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" -f "$DEPLOY_DIR/compose.nginx.yml" "$@"
  else
    docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" "$@"
  fi
}

APP_CONTAINER=$(compose ps -a -q app 2>/dev/null || true)
[ -n "$APP_CONTAINER" ] || { echo "No app container exists; refusing backup because storage image context is unknown." >&2; exit 1; }
APP_IMAGE=$(docker inspect --format '{{.Image}}' "$APP_CONTAINER")
mkdir "$WORK_DIR"

safe_remove_work_dir() {
  case "$WORK_DIR" in
    "$BACKUP_ROOT"/.partial-*) [ ! -L "$WORK_DIR" ] && rm -rf -- "$WORK_DIR" ;;
    *) echo "Refusing unsafe partial-directory cleanup: $WORK_DIR" >&2 ;;
  esac
}

cleanup() {
  status=$?
  trap - EXIT HUP INT TERM
  if [ "$APP_WAS_RUNNING" -eq 1 ]; then
    if ! compose start app >/dev/null; then
      echo "CRITICAL: backup could not restart app; run docker compose start app immediately." >&2
      RESTART_FAILED=1
    fi
  fi
  if [ "$status" -ne 0 ]; then
    safe_remove_work_dir
    echo "Backup failed; incomplete generation removed." >&2
  fi
  [ "$RESTART_FAILED" -eq 0 ] || exit 1
  exit "$status"
}
trap cleanup EXIT
trap 'exit 1' HUP INT TERM

if [ "$(compose ps --status running --services app 2>/dev/null || true)" = "app" ]; then
  APP_WAS_RUNNING=1
  echo "Stopping app for a consistent database/storage backup (brief public downtime)..."
  compose stop app >/dev/null
fi

compose exec -T db sh -c 'exec pg_dump -U "$POSTGRES_USER" --dbname="$POSTGRES_DB" --format=custom --no-owner --no-acl' > "$WORK_DIR/database.dump"
docker run --rm --network none --read-only --cap-drop ALL --security-opt no-new-privileges \
  --user 1001:1001 --mount type=bind,src=/srv/sinotaris/data/storage,dst=/app/storage,readonly \
  --entrypoint tar "$APP_IMAGE" -C /app/storage -czf - . > "$WORK_DIR/storage.tar.gz"

cat > "$WORK_DIR/manifest.txt" <<EOF
created_utc=$STAMP
git_sha=$GIT_SHA
database_format=postgres_custom
storage_format=tar_gzip
consistency=app_stopped_during_database_and_storage_capture
EOF

(cd "$WORK_DIR" && sha256sum database.dump storage.tar.gz manifest.txt > SHA256SUMS)
chmod 600 "$WORK_DIR"/*
mv "$WORK_DIR" "$FINAL_DIR"

if [ "$APP_WAS_RUNNING" -eq 1 ]; then
  if ! compose start app >/dev/null; then
    echo "CRITICAL: backup completed but app restart failed." >&2
    RESTART_FAILED=1
  else
    APP_WAS_RUNNING=0
  fi
fi

# Delete only old complete generations whose off-host copy was explicitly verified.
find "$BACKUP_ROOT" -mindepth 1 -maxdepth 1 -type d -name '20??????T??????Z' -mtime +14 \
  -exec sh -c 'for dir do [ ! -L "$dir" ] && [ -f "$dir/.offhost-verified" ] && [ ! -L "$dir/.offhost-verified" ] && rm -rf -- "$dir"; done' sh {} +

trap - EXIT HUP INT TERM
[ "$RESTART_FAILED" -eq 0 ] || exit 1
echo "Backup created: $FINAL_DIR"
echo "After an encrypted off-host copy is independently verified, create $FINAL_DIR/.offhost-verified."
