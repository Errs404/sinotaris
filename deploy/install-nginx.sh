#!/bin/sh
set -eu

if [ "$(id -u)" -eq 0 ]; then
  echo "Run as the named non-root sudo deployer, not root." >&2
  exit 1
fi

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
SITE_SOURCE="$SCRIPT_DIR/nginx/sinotaris.bootstrap-http.conf.example"
LIMITS_SOURCE="$SCRIPT_DIR/nginx/00-sinotaris-limits.conf.example"
SITE_TARGET=/etc/nginx/sites-enabled/sinotaris.conf
LIMITS_TARGET=/etc/nginx/conf.d/00-sinotaris-limits.conf

sudo nginx -v >/dev/null 2>&1 || { echo "Host Nginx is not installed or sudo nginx is not permitted." >&2; exit 1; }
[ -f "$SITE_SOURCE" ] || { echo "Missing bootstrap Nginx template." >&2; exit 1; }
[ -f "$LIMITS_SOURCE" ] || { echo "Missing Nginx rate-limit zone template." >&2; exit 1; }
[ -d /etc/nginx/sites-enabled ] || { echo "/etc/nginx/sites-enabled does not exist on this host." >&2; exit 1; }
[ -d /etc/nginx/conf.d ] || { echo "/etc/nginx/conf.d does not exist on this host." >&2; exit 1; }

if ! sudo nginx -T 2>&1 | grep -Eq 'include[[:space:]]+/etc/nginx/conf\.d/\*\.conf;'; then
  echo "Nginx does not appear to include /etc/nginx/conf.d/*.conf in its http context." >&2
  echo "Review /etc/nginx/nginx.conf manually; rate-limit zones cannot be installed safely." >&2
  exit 1
fi

for target in "$LIMITS_TARGET" "$SITE_TARGET"; do
  if [ -e "$target" ]; then
    echo "$target already exists; refusing to overwrite it automatically." >&2
    echo "Review differences and install the desired configuration manually." >&2
    exit 1
  fi
done

rollback_new_files() {
  # The sudo policy permits install but may not permit rm. Empty files are inert.
  sudo install -m 0644 -o root -g root /dev/null "$SITE_TARGET" || true
  sudo install -m 0644 -o root -g root /dev/null "$LIMITS_TARGET" || true
}

echo "Installing Sinotaris rate-limit zones and HTTP bootstrap site..."
sudo install -m 0644 -o root -g root "$LIMITS_SOURCE" "$LIMITS_TARGET"
sudo install -m 0644 -o root -g root "$SITE_SOURCE" "$SITE_TARGET"
if ! sudo nginx -t; then
  rollback_new_files
  echo "Nginx validation failed; both new files were replaced with inert empty files and Nginx was not reloaded." >&2
  echo "Remove or repair $LIMITS_TARGET and $SITE_TARGET from an attended console before retrying." >&2
  exit 1
fi
sudo systemctl reload nginx

cat <<'EOF'
Rate-limit zones and HTTP bootstrap configuration installed; Nginx reloaded.
Next, from an attended console, obtain/verify the certificate, for example:
  sudo certbot --nginx -d sinotaris.reverse.my.id
Certbot may modify the enabled site. Review the resulting TLS configuration against:
  deploy/nginx/sinotaris.production-https.conf.example
Keep /etc/nginx/conf.d/00-sinotaris-limits.conf enabled; both site templates reference its zones.
Before application deployment, confirm HTTPS serves the correct certificate for
sinotaris.reverse.my.id. An existing certificate for another domain is not valid.
EOF
