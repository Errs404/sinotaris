#!/bin/sh
set -eu

DOMAIN=${DOMAIN:-sinotaris.reverse.my.id}
BASE_URL="https://$DOMAIN"

echo "Checking HTTPS health endpoint..."
health=$(curl --fail --silent --show-error --max-time 20 "$BASE_URL/api/health")
printf '%s' "$health" | grep -q '"status":"ok"' || { echo "Unexpected health response." >&2; exit 1; }

echo "Checking login page..."
curl --fail --silent --show-error --max-time 20 --output /dev/null "$BASE_URL/login"

echo "Smoke checks passed for $BASE_URL."
echo "Also verify externally that TCP 5432 and 3000 are closed. In nginx mode, 3000 is bound to loopback only."
