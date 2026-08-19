#!/bin/sh
set -eu

BASE_URL=http://127.0.0.1:3000

echo "Checking loopback app health endpoint..."
health=$(curl --fail --silent --show-error --max-time 20 "$BASE_URL/api/health")
printf '%s' "$health" | grep -q '"status":"ok"' || { echo "Unexpected local health response." >&2; exit 1; }

echo "Checking loopback login page..."
curl --fail --silent --show-error --max-time 20 --output /dev/null "$BASE_URL/login"
echo "Loopback app smoke checks passed."
