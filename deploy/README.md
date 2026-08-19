# Production deployment (single Ubuntu VPS)

This directory supports `sinotaris.reverse.my.id` with Docker Compose, PostgreSQL 17, and the Next.js standalone server. `PROXY_MODE=nginx` integrates with an existing host Nginx installation. `PROXY_MODE=caddy` keeps the optional containerized Caddy path. These files do not deploy automatically.

## Public-production gate

A staging environment or private pilot remains the default recommendation. Before public launch, an accountable operator must explicitly accept or close these blockers:

- [ ] No application-level rate limiter is implemented. Neither supplied proxy configuration enables general request rate limiting; use a reviewed upstream WAF/proxy policy.
- [ ] MFA is not implemented.
- [ ] Central session revocation is not implemented.
- [ ] OCR runs synchronously in the web process instead of a bounded background queue; concurrent OCR can exhaust the 2 GiB/2 CPU app limit.
- [ ] A full isolated restore drill has not been automated or proven by these files.
- [ ] Encrypted off-host backup and verified retention are not yet operated.
- [ ] Monitoring/alerting beyond health checks and logs is not configured.
- [ ] Administrator bootstrap and incident ownership must be documented.

Do not treat successful container startup as approval to launch publicly.

## Layout and security model

- PostgreSQL 5432 is never published.
- In Nginx mode, app 3000 is bound only to `127.0.0.1`; the existing host Nginx owns public ports 80/443.
- In Caddy mode, app 3000 is not published; only Caddy publishes TCP 80/443 and UDP 443.
- `backend` is an internal Docker network. Containerized Caddy reaches app over `frontend`; host Nginx reaches `127.0.0.1:3000`.
- Private persistent data is under `/srv/sinotaris/data`. App storage is owned by UID/GID 1001 with mode 0700.
- App root is read-only except `/app/storage` and a 512 MiB `/tmp` tmpfs.
- App and migration images run as UID/GID 1001 and carry the full Git SHA in `org.opencontainers.image.revision`.
- PostgreSQL and optional Caddy images are digest-pinned. Node 24 Bookworm Slim is also digest-pinned.
- Caddy logs JSON to stdout with Docker rotation. Nginx templates log to `/var/log/nginx/sinotaris.access.log` and `.error.log`; configure host logrotate and restrict access.
- URLs may appear in logs. Never put secrets or client data in query strings.

## 1. Prepare Ubuntu and the operator

Use a supported Ubuntu LTS VPS.

1. Create a named non-root sudo deployer and install its SSH public key.
2. Prove key and sudo access in a second session before changing SSH settings.
3. Rotate provider-supplied root credentials. Disable root/password SSH only after key access works; validate `sshd -t` first.
4. Configure UFW without dropping the active SSH session:

   ```sh
   sudo ufw allow OpenSSH
   sudo ufw allow 80/tcp
   sudo ufw allow 443/tcp
   sudo ufw enable
   sudo ufw status verbose
   ```

   Add `443/udp` only for Caddy/HTTP3 if desired.

5. Install Docker Engine and its Compose plugin from Docker's official apt repository. Ensure `flock` is present (`util-linux` on Ubuntu). Docker group membership is root-equivalent.
6. Point the domain A/AAAA records at this VPS. Remove an unusable AAAA record.
7. Clone a reviewed commit to `/opt/sinotaris`, owned by the deployer.

## 2. Create production environment on the VPS

Never copy a development `.env` or commit production secrets.

```sh
cd /opt/sinotaris
cp deploy/.env.production.example deploy/.env.production
chmod 600 deploy/.env.production
openssl rand -base64 48  # AUTH_SECRET
openssl rand -base64 36  # separate POSTGRES_PASSWORD
editor deploy/.env.production
```

Use simple `KEY=value` lines without shell expressions. Required validation includes:

- `PROXY_MODE` is exactly `nginx` or `caddy`; use `nginx` for the existing shared host proxy.
- `DOMAIN` is an FQDN.
- `AUTH_URL` equals `https://DOMAIN` exactly.
- `AUTH_SECRET` has at least 32 characters.
- PostgreSQL fields are nonempty.
- `DATABASE_URL` starts with `postgres://` or `postgresql://` and contains no placeholders.
- `ACME_EMAIL` has a valid email shape.

The PostgreSQL password in `DATABASE_URL` must match `POSTGRES_PASSWORD`; URL-encode reserved URL characters. `deploy.sh` reads exact keys without sourcing/executing the file. Compose passes only explicitly listed values to each service. Do not put seed credentials in this file.

## 3. Configure the reverse proxy

### Existing host Nginx

`deploy/compose.nginx.yml` publishes only `127.0.0.1:3000:3000` for the app. Install the HTTP bootstrap site once before nginx-mode deployment:

```sh
cd /opt/sinotaris
sh deploy/install-nginx.sh
```

The installer:

- refuses root execution and refuses to overwrite `/etc/nginx/sites-enabled/sinotaris.conf`,
- installs `deploy/nginx/sinotaris.bootstrap-http.conf.example`,
- runs `sudo nginx -t`,
- replaces a newly installed invalid site with an inert empty file and does not reload (remove or repair it from an attended console),
- reloads host Nginx only after validation.

It does not request or modify certificates. From an attended console, use the host's approved Certbot workflow, for example:

```sh
sudo certbot --nginx -d sinotaris.reverse.my.id
```

Certbot may modify the enabled site. Review the resulting configuration against `deploy/nginx/sinotaris.production-https.conf.example`, especially:

- canonical `server_name sinotaris.reverse.my.id`,
- `client_max_body_size 16m`,
- proxy target `127.0.0.1:3000`,
- forwarded/WebSocket headers,
- 300-second proxy send/read timeouts for synchronous OCR,
- security headers and hidden upstream `Server`,
- certificate paths and HTTPS redirect.

An existing certificate issued for another domain is a certificate mismatch. Verify the certificate SAN and public HTTPS response for `sinotaris.reverse.my.id` before deployment.

In nginx mode, `deploy.sh` starts only database/app, checks loopback health, stops any prior project Caddy container so it cannot contend for 80/443, requires `/etc/nginx/sites-enabled/sinotaris.conf`, runs `sudo nginx -t`, reloads Nginx, then runs the public HTTPS smoke test. It never starts Caddy.

### Optional containerized Caddy

Set `PROXY_MODE=caddy`. The Nginx override is not loaded, and deployment starts database, app, and Caddy. Host Nginx must not already occupy ports 80/443. Standard Caddy has no native general-purpose rate limiter; none is faked here.

## 4. Validate before public launch

Compose requires `GIT_SHA` for build provenance:

```sh
cd /opt/sinotaris
export GIT_SHA=$(git rev-parse --verify HEAD)

# Nginx mode
docker compose --env-file deploy/.env.production \
  -f deploy/compose.yml -f deploy/compose.nginx.yml config --quiet
docker compose --env-file deploy/.env.production \
  -f deploy/compose.yml -f deploy/compose.nginx.yml build migrate app

# Caddy mode instead: use only -f deploy/compose.yml.
unset GIT_SHA
```

Never attach rendered `docker compose config` output containing secrets to a ticket.

Externally verify ports:

```sh
nmap -Pn -p 22,80,443,3000,5432 sinotaris.reverse.my.id
```

Expected externally: 22/80/443 according to policy; 3000/5432 closed or filtered. In Nginx mode, `127.0.0.1:3000` should work locally while public port 3000 stays closed.

## 5. Deploy deliberately

Deployment requires a completely clean Git worktree, including no untracked files:

```sh
cd /opt/sinotaris
sh deploy/deploy.sh
```

The script:

- refuses root and dirty Git state,
- validates env values and `PROXY_MODE`,
- acquires `/var/lock/sinotaris-deploy.lock` using non-blocking `flock`,
- validates the mode-specific Compose model,
- captures the previous app image reference,
- backs up an existing running app,
- builds clean-SHA-tagged/provenance-labelled images,
- applies forward-only migrations,
- starts only selected services,
- runs local/public smoke checks.

**Migration risk:** Prisma migrations are not automatically reversible. On startup/smoke failure, deployment attempts to restore the prior app image. Caddy mode recreates app/Caddy. Nginx mode restores only app and leaves shared host Nginx running, which may return 502 during recovery. On first deploy without a prior app, app is stopped; Caddy is also stopped in Caddy mode. Database migrations remain applied.

Nginx-mode inspection:

```sh
export GIT_SHA=$(git rev-parse --verify HEAD)
docker compose --env-file deploy/.env.production -f deploy/compose.yml -f deploy/compose.nginx.yml ps
docker compose --env-file deploy/.env.production -f deploy/compose.yml -f deploy/compose.nginx.yml logs --tail=100 app db migrate
sh deploy/scripts/local-smoke.sh
sh deploy/scripts/smoke.sh
sudo nginx -t
unset GIT_SHA
```

Caddy mode omits `-f deploy/compose.nginx.yml` and may include `caddy` in logs.

## 6. Bootstrap the first administrator once

There are no defaults. Production seed requires explicit controls and creates office/user/subscription atomically. Use a unique password of at least 16 characters:

```sh
read -r -p 'Bootstrap email: ' SEED_EMAIL
read -r -s -p 'Bootstrap password (16+ chars): ' SEED_PASSWORD; printf '\n'
export SEED_EMAIL SEED_PASSWORD GIT_SHA=$(git rev-parse --verify HEAD)

docker compose --env-file deploy/.env.production \
  -f deploy/compose.yml -f deploy/compose.nginx.yml \
  run --rm -e NODE_ENV=production -e ALLOW_PRODUCTION_SEED=1 \
  -e SEED_EMAIL -e SEED_PASSWORD migrate ./node_modules/.bin/tsx prisma/seed.ts

unset SEED_EMAIL SEED_PASSWORD GIT_SHA
```

Omit the Nginx override in Caddy mode. The seed does not print the password and fails if the email already exists.

## Backups and integrity verification

Run manually first, then schedule with a controlled systemd timer:

```sh
BACKUP_ROOT=/srv/sinotaris/backups sh deploy/scripts/backup.sh
```

Backup reads `PROXY_MODE` and uses the same Compose model as deployment. It shares the deployment lock, refuses unsafe/symlink roots, stops app during the PostgreSQL/storage capture, treats restart failure as an error, writes a manifest/checksums, and publishes only complete generations. Either proxy may return 502 during the brief stop.

Copy each generation to encrypted off-host storage and independently verify it. Only then create its local retention marker:

```sh
touch /srv/sinotaris/backups/20260819T120000Z/.offhost-verified
chmod 600 /srv/sinotaris/backups/20260819T120000Z/.offhost-verified
```

Only marked generations older than 14 days are deleted. Unmarked backups remain and disk usage must be monitored. A custom backup root requires `ALLOW_CUSTOM_BACKUP_ROOT=1` and must remain below `/srv/sinotaris`.

Read-only archive verification performs no restore:

```sh
RESTORE_DIR=/srv/sinotaris/backups/20260819T120000Z \
TARGET_PROJECT=sinotaris-restore-drill \
sh deploy/scripts/restore-verify.sh
```

A real restore drill must use isolated database and storage paths and must never target `/srv/sinotaris/data`.

## Rollback and operations

- Automatic smoke rollback uses the exact prior app image and selected proxy mode.
- Manual Nginx-mode Compose commands must consistently include `compose.nginx.yml`.
- Database migration rollback is not automatic; verify backward compatibility before app rollback.
- Never run `docker compose down -v` and never delete `/srv/sinotaris/data` during recovery.
- In Nginx mode, diagnose TLS with DNS, `sudo nginx -t`, host logs, Certbot state, and certificate SAN. Do not expose port 3000 publicly as a shortcut.
- In Caddy mode, diagnose TLS with DNS, ports, Caddy logs, and ACME email.
- Review digest updates intentionally, then rebuild and test.
- Monitor disk, memory, restarts, HTTPS health, backup age, off-host copy verification, and proxy errors before public launch.
