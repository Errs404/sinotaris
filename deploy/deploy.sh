#!/bin/sh
set -eu

umask 077
LOCK_FILE=/var/lock/sinotaris-deploy.lock

if [ "$(id -u)" -eq 0 ]; then
  echo "Run as the named non-root sudo deployer, not root." >&2
  exit 1
fi

command -v flock >/dev/null 2>&1 || { echo "flock is required (Ubuntu package: util-linux)." >&2; exit 1; }
if [ ! -e "$LOCK_FILE" ]; then
  sudo install -m 0600 -o "$(id -u)" -g "$(id -g)" /dev/null "$LOCK_FILE"
fi
[ -f "$LOCK_FILE" ] && [ ! -L "$LOCK_FILE" ] && [ -r "$LOCK_FILE" ] && [ -w "$LOCK_FILE" ] || {
  echo "$LOCK_FILE must be a regular, non-symlink file readable and writable by the deployer." >&2
  exit 1
}
exec 9<>"$LOCK_FILE"
flock -n 9 || { echo "Another Sinotaris deploy or backup operation is running." >&2; exit 1; }

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
REPO_DIR=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)
ENV_FILE="$SCRIPT_DIR/.env.production"
COMPOSE_FILE="$SCRIPT_DIR/compose.yml"

[ -f "$ENV_FILE" ] || { echo "Create $ENV_FILE from .env.production.example." >&2; exit 1; }
case "$(stat -c '%a' "$ENV_FILE")" in
  600|400) ;;
  *) echo "$ENV_FILE must have mode 600 (or 400). Run: chmod 600 deploy/.env.production" >&2; exit 1 ;;
esac
if grep -q 'REPLACE_WITH\|example.invalid' "$ENV_FILE"; then
  echo "Environment file still contains placeholders." >&2
  exit 1
fi

env_value() {
  key=$1
  value=$(sed -n "s/^${key}=//p" "$ENV_FILE" | tail -n 1 | tr -d '\r')
  [ -n "$value" ] || { echo "Required environment key $key is missing or empty." >&2; exit 1; }
  printf '%s' "$value"
}

DOMAIN=$(env_value DOMAIN)
ACME_EMAIL=$(env_value ACME_EMAIL)
POSTGRES_DB=$(env_value POSTGRES_DB)
POSTGRES_USER=$(env_value POSTGRES_USER)
POSTGRES_PASSWORD=$(env_value POSTGRES_PASSWORD)
DATABASE_URL=$(env_value DATABASE_URL)
AUTH_SECRET=$(env_value AUTH_SECRET)
AUTH_URL=$(env_value AUTH_URL)

case "$DOMAIN" in
  *.*) ;;
  *) echo "DOMAIN must be a fully qualified domain name." >&2; exit 1 ;;
esac
if ! printf '%s' "$DOMAIN" | grep -Eq '^[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?(\.[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$'; then
  echo "DOMAIN is not a valid fully qualified domain name." >&2
  exit 1
fi
[ "$AUTH_URL" = "https://$DOMAIN" ] || { echo "AUTH_URL must equal https://DOMAIN exactly." >&2; exit 1; }
[ "${#AUTH_SECRET}" -ge 32 ] || { echo "AUTH_SECRET must be at least 32 characters." >&2; exit 1; }
case "$DATABASE_URL" in
  postgres://*|postgresql://*) ;;
  *) echo "DATABASE_URL must use postgres:// or postgresql://." >&2; exit 1 ;;
esac
case "$DATABASE_URL" in
  *REPLACE_WITH*|*example.invalid*) echo "DATABASE_URL contains a placeholder." >&2; exit 1 ;;
esac
if ! printf '%s' "$ACME_EMAIL" | grep -Eq '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'; then
  echo "ACME_EMAIL is not valid." >&2
  exit 1
fi

if [ -n "$(git -C "$REPO_DIR" status --porcelain)" ]; then
  echo "Refusing deployment: the Git worktree is not clean." >&2
  exit 1
fi

command -v docker >/dev/null 2>&1 || { echo "Docker is required." >&2; exit 1; }
docker compose version >/dev/null

sudo install -d -m 0700 -o 1001 -g 1001 /srv/sinotaris/data/storage
sudo install -d -m 0700 -o 1001 -g 1001 /srv/sinotaris/data/storage/archives /srv/sinotaris/data/storage/templates /srv/sinotaris/data/storage/generated
sudo install -d -m 0700 -o 999 -g 999 /srv/sinotaris/data/postgres
sudo install -d -m 0700 -o "$(id -u)" -g "$(id -g)" /srv/sinotaris/backups

GIT_SHA=$(git -C "$REPO_DIR" rev-parse --verify HEAD)
SHORT_SHA=$(printf '%s' "$GIT_SHA" | cut -c1-12)
export DOMAIN ACME_EMAIL POSTGRES_DB POSTGRES_USER POSTGRES_PASSWORD DATABASE_URL AUTH_SECRET AUTH_URL GIT_SHA

compose() {
  docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" "$@"
}

echo "Validating Compose configuration..."
compose config --quiet

PREVIOUS_APP_IMAGE=""
APP_CONTAINER=$(compose ps -a -q app 2>/dev/null || true)
if [ -n "$APP_CONTAINER" ]; then
  PREVIOUS_APP_IMAGE=$(docker inspect --format '{{.Config.Image}}' "$APP_CONTAINER" 2>/dev/null || true)
fi

if [ "$(compose ps --status running --services app 2>/dev/null || true)" = "app" ]; then
  echo "Existing deployment detected; creating a downtime-consistent backup first."
  SINOTARIS_LOCK_HELD=1 sh "$SCRIPT_DIR/scripts/backup.sh"
fi

export APP_IMAGE_TAG="sinotaris:$SHORT_SHA"
export APP_MIGRATE_IMAGE_TAG="sinotaris-migrate:$SHORT_SHA"

echo "Building immutable local image tags for git $GIT_SHA..."
compose build migrate app
echo "Applying forward-only Prisma migrations..."
compose up --no-build --abort-on-container-exit --exit-code-from migrate migrate

rollback_on_failure() {
  status=$?
  trap - EXIT HUP INT TERM
  [ "$status" -ne 0 ] || exit 0
  echo "Deployment smoke check failed. Database migrations are forward-only and are NOT rolled back." >&2
  if [ -n "$PREVIOUS_APP_IMAGE" ]; then
    echo "Restoring previous app image reference: $PREVIOUS_APP_IMAGE" >&2
    APP_IMAGE_TAG=$PREVIOUS_APP_IMAGE compose up -d --no-build app caddy || \
      echo "CRITICAL: automatic application rollback failed; inspect Compose immediately." >&2
  else
    echo "No previous app image exists; stopping app and Caddy to fail closed." >&2
    compose stop caddy app || echo "CRITICAL: failed to stop first-deploy services." >&2
  fi
  exit "$status"
}
trap rollback_on_failure EXIT
trap 'exit 1' HUP INT TERM

echo "Starting services without deleting volumes..."
compose up -d --no-build db app caddy
DOMAIN=$DOMAIN sh "$SCRIPT_DIR/scripts/smoke.sh"
trap - EXIT HUP INT TERM

cat <<EOF
Deployment health checks passed for git $GIT_SHA.
Previous app image reference: ${PREVIOUS_APP_IMAGE:-none}
Database migrations are forward-only. Never run 'docker compose down -v'.
EOF
