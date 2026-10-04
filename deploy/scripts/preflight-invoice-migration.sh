#!/bin/sh
set -eu
: "${GIT_SHA:?GIT_SHA is required}"
DEPLOY_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
ENV_FILE="$DEPLOY_DIR/.env.production"
[ -f "$ENV_FILE" ] || { echo "Production environment file is required." >&2; exit 1; }
PROXY_MODE=${PROXY_MODE:-$(sed -n 's/^PROXY_MODE=//p' "$ENV_FILE" | tail -n 1 | tr -d '\r')}
case "$PROXY_MODE" in nginx|caddy) ;; *) echo "Invalid PROXY_MODE." >&2; exit 1;; esac
compose() {
  if [ "$PROXY_MODE" = nginx ]; then
    docker compose --env-file "$ENV_FILE" -f "$DEPLOY_DIR/compose.yml" -f "$DEPLOY_DIR/compose.nginx.yml" "$@"
  else
    docker compose --env-file "$ENV_FILE" -f "$DEPLOY_DIR/compose.yml" "$@"
  fi
}
compose exec -T db sh -c 'exec psql -X -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"' <<'SQL'
DO $$
DECLARE invoice_count bigint := 0; item_count bigint := 0; applied boolean := false;
BEGIN
  IF to_regclass('public._prisma_migrations') IS NOT NULL THEN
    SELECT EXISTS (SELECT 1 FROM "_prisma_migrations"
      WHERE migration_name = '20260823120000_add_invoice_payments'
      AND finished_at IS NOT NULL AND rolled_back_at IS NULL) INTO applied;
  END IF;
  IF applied THEN RETURN; END IF;
  IF to_regclass('public."Invoice"') IS NOT NULL THEN SELECT count(*) INTO invoice_count FROM "Invoice"; END IF;
  IF to_regclass('public."InvoiceItem"') IS NOT NULL THEN SELECT count(*) INTO item_count FROM "InvoiceItem"; END IF;
  RAISE NOTICE 'Invoice: %, InvoiceItem: %', invoice_count, item_count;
  IF invoice_count > 0 OR item_count > 0 THEN
    RAISE EXCEPTION 'Invoice migration requires empty placeholder tables';
  END IF;
END $$;
SQL
