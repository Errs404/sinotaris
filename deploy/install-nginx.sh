#!/bin/sh
set -eu

if [ "$(id -u)" -eq 0 ]; then
  echo "Run as the named non-root sudo deployer, not root." >&2
  exit 1
fi

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
SOURCE="$SCRIPT_DIR/nginx/sinotaris.bootstrap-http.conf.example"
TARGET=/etc/nginx/sites-enabled/sinotaris.conf

sudo nginx -v >/dev/null 2>&1 || { echo "Host Nginx is not installed or sudo nginx is not permitted." >&2; exit 1; }
[ -f "$SOURCE" ] || { echo "Missing bootstrap Nginx template." >&2; exit 1; }
[ -d /etc/nginx/sites-enabled ] || { echo "/etc/nginx/sites-enabled does not exist on this host." >&2; exit 1; }

if [ -e "$TARGET" ]; then
  echo "$TARGET already exists; refusing to overwrite it automatically." >&2
  echo "Review differences and install the desired configuration manually." >&2
  exit 1
fi

echo "Installing the HTTP bootstrap site for sinotaris.reverse.my.id..."
sudo install -m 0644 -o root -g root "$SOURCE" "$TARGET"
if ! sudo nginx -t; then
  sudo install -m 0644 -o root -g root /dev/null "$TARGET"
  echo "Nginx validation failed; the new site was replaced with an inert empty file and was not reloaded." >&2
  echo "Remove or repair $TARGET from an attended console before retrying." >&2
  exit 1
fi
sudo systemctl reload nginx

cat <<'EOF'
HTTP bootstrap configuration installed and Nginx reloaded.
Next, from an attended console, obtain/verify the certificate, for example:
  sudo certbot --nginx -d sinotaris.reverse.my.id
Certbot may modify the enabled site. Review the resulting TLS configuration against:
  deploy/nginx/sinotaris.production-https.conf.example
Before application deployment, confirm HTTPS serves the correct certificate for
sinotaris.reverse.my.id. An existing certificate for another domain is not valid.
EOF
