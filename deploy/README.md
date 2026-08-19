# Production deployment (single Ubuntu VPS)

This directory supports a public deployment at `sinotaris.reverse.my.id` with Docker Compose, PostgreSQL 17, the Next.js standalone server, and Caddy-managed TLS. It does **not** deploy automatically.

## Public-production gate

The files support a public endpoint, but the recommended starting point is a staging environment or private pilot. Before a public launch, an accountable operator must explicitly accept or close these blockers:

- [ ] There is no application-level or proxy rate limiter. Standard Caddy has no native general-purpose rate limiter; do not assume one is active. Add a reviewed Caddy plugin build or an upstream WAF/CDN policy before broad exposure.
- [ ] MFA is not implemented.
- [ ] Central session revocation is not implemented.
- [ ] OCR runs in the web process rather than a bounded background queue; concurrent OCR can exhaust the 2 GiB/2 CPU app limit.
- [ ] A full restore drill into an isolated environment has not been automated or proven by these files.
- [ ] An encrypted off-host backup destination and tested retention policy must be configured by the operator.
- [ ] Monitoring/alerting beyond container health and local logs is not configured.
- [ ] An application-specific administrator bootstrap and incident owner are documented.

Do not proceed merely because the containers start. Record approval of this checklist outside the repository.

## Layout and security model

- Only Caddy publishes host ports: TCP 80/443 and UDP 443. PostgreSQL 5432 and app 3000 are not published.
- `backend` is an internal Docker network shared by app/migrate/database. Caddy reaches app over `frontend`.
- Persistent private data is under `/srv/sinotaris/data`; app storage is owned by container UID/GID 1001 and mode 0700.
- The app root filesystem is read-only; only `/app/storage` and a 512 MiB `/tmp` tmpfs are writable.
- Database and Caddy images are digest-pinned. Node 24 Bookworm Slim is pinned in `Dockerfile` to the Docker Hub multi-platform digest resolved on 2026-08-19.
- Caddy writes JSON access logs to stdout. Docker's `json-file` rotation (`10m`, five files) applies. Standard access logs do not include Cookie or Authorization request headers unless credential logging is explicitly enabled; this config does not enable it. Request URLs may still include query strings, so never put secrets or client data in URLs and restrict Docker log access.
- HSTS starts at one day (`max-age=86400`) to limit lockout risk during initial TLS operations. Increase only after stable TLS and domain ownership are proven.

## 1. Prepare Ubuntu and the operator

Use a currently supported Ubuntu LTS VPS. Commands below are examples; review them against your provider and Docker's current official Ubuntu installation guide.

1. Create a named non-root sudo user (for example `deployer`) and install its SSH public key.
2. Open a second SSH session and prove key/sudo access works.
3. Rotate any provider-supplied root password. Only after the second session succeeds, disable SSH root login and password authentication, validate `sshd -t`, and reload SSH. Doing this in the wrong order can lock you out.
4. Configure UFW without dropping the active SSH session:

   ```sh
   sudo ufw allow OpenSSH
   sudo ufw allow 80/tcp
   sudo ufw allow 443/tcp
   sudo ufw allow 443/udp
   sudo ufw enable
   sudo ufw status verbose
   ```

5. Install Docker Engine plus the Compose plugin from Docker's official apt repository. Ensure `flock` is available (`util-linux` on Ubuntu). Add the deployer to the `docker` group only if accepted: Docker group membership is effectively root-equivalent. Log out/in after changing groups.
6. Point the DNS A/AAAA records for `sinotaris.reverse.my.id` to the VPS. Remove an AAAA record if IPv6 does not actually route to the host.
7. Clone the repository to `/opt/sinotaris`, owned by the deployer. Deploy a reviewed commit, not an uncommitted worktree.

## 2. Create production secrets on the VPS

Never copy a development `.env` or commit production secrets.

```sh
cd /opt/sinotaris
cp deploy/.env.production.example deploy/.env.production
chmod 600 deploy/.env.production
openssl rand -base64 48  # use one output for AUTH_SECRET
openssl rand -base64 36  # use a separate output for POSTGRES_PASSWORD
editor deploy/.env.production
```

Set every placeholder using simple `KEY=value` lines without shell expressions. `deploy.sh` parses exact keys without sourcing/executing this file. `DOMAIN` must be an FQDN, `ACME_EMAIL` must be valid, `AUTH_URL` must exactly equal `https://DOMAIN`, and `AUTH_SECRET` must be at least 32 characters. PostgreSQL fields must be nonempty. `POSTGRES_PASSWORD` and the password component in `DATABASE_URL` must represent the same value; URL-encode reserved characters in `DATABASE_URL`. Compose receives required values through `--env-file` interpolation and passes only explicitly listed variables to app/migrate/database. `STORAGE_ROOT` is intentionally absent because the app currently uses `/app/storage` relative to its working directory. Do not add seed credentials to this file.

Generate secrets without pasting them into chat, shell history, tickets, or logs. Keep a protected recovery copy in an approved password/secrets manager.

## 3. Validate before public launch

```sh
cd /opt/sinotaris
export GIT_SHA=$(git rev-parse --verify HEAD)
docker compose --env-file deploy/.env.production -f deploy/compose.yml config --quiet
docker compose --env-file deploy/.env.production -f deploy/compose.yml build migrate app
unset GIT_SHA
```

Review the rendered config carefully. `docker compose config` can render secret values to the terminal; use `--quiet` in shared environments and never attach full rendered output to tickets.

Confirm externally (from another host) that only intended ports are open:

```sh
nmap -Pn -p 22,80,443,3000,5432 sinotaris.reverse.my.id
```

Expected: 22/80/443 according to firewall policy; 3000/5432 closed or filtered.

## 4. Deploy deliberately

`deploy/deploy.sh` refuses root and any dirty/untracked Git worktree, checks env permissions and required values, acquires `/var/lock/sinotaris-deploy.lock` with non-blocking `flock`, creates restricted data directories, validates Compose, backs up an existing running app, tags images with the clean commit's 12-character SHA, embeds the full SHA as the OCI revision label, builds, runs migrations, starts services, and runs HTTPS smoke checks. A concurrent deploy or backup fails immediately. It never seeds, commits, pushes, uses `down -v`, or deletes volumes.

```sh
cd /opt/sinotaris
sh deploy/deploy.sh
```

**Migration risk:** `prisma migrate deploy` changes production schema and may not be reversible. Read every new migration and take/verify a backup before execution. The script captures the previous app container's configured image reference before building. If startup or smoke checks fail after the switch, it attempts to recreate app/Caddy with that previous image; on a first deploy with no prior image it stops app/Caddy to fail closed. This does **not** reverse database migrations. The pre-deploy backup briefly stops app traffic and Caddy can return 502 during that interval. On first deploy there is no existing app to back up.

Inspect after startup:

```sh
export GIT_SHA=$(git rev-parse --verify HEAD)
docker compose --env-file deploy/.env.production -f deploy/compose.yml ps
docker compose --env-file deploy/.env.production -f deploy/compose.yml logs --tail=100 app caddy db migrate
sh deploy/scripts/smoke.sh
unset GIT_SHA
```

Compose requires `GIT_SHA` because build provenance is mandatory. For direct Compose commands outside `deploy.sh`, first run `export GIT_SHA=$(git rev-parse --verify HEAD)`; `deploy.sh` and `backup.sh` set it automatically.

## 5. Bootstrap the first administrator once

There are no defaults. Production seed refuses to run unless all explicit controls are present. Use a unique password of at least 16 characters, avoid shell history where practical, run once, then unset values:

```sh
read -r -p 'Bootstrap email: ' SEED_EMAIL
read -r -s -p 'Bootstrap password (16+ chars): ' SEED_PASSWORD; printf '\n'
export SEED_EMAIL SEED_PASSWORD
export GIT_SHA=$(git rev-parse --verify HEAD)
docker compose --env-file deploy/.env.production -f deploy/compose.yml run --rm \
  -e NODE_ENV=production -e ALLOW_PRODUCTION_SEED=1 \
  -e SEED_EMAIL -e SEED_PASSWORD migrate ./node_modules/.bin/tsx prisma/seed.ts
unset SEED_EMAIL SEED_PASSWORD GIT_SHA
```

This creates an example office/trial as implemented by `prisma/seed.ts`; verify that this business bootstrap is appropriate before running it. The seed does not print the password.

## Backups and integrity verification

Run manually first, then schedule with a root-owned systemd timer or similarly controlled scheduler:

```sh
BACKUP_ROOT=/srv/sinotaris/backups sh deploy/scripts/backup.sh
```

The script shares the deployment lock, fails closed into a strictly bounded hidden partial directory, refuses symlink/unsafe backup roots, stops the app while capturing PostgreSQL and all storage, treats a failed app restart as a backup failure, writes a UTC/Git manifest and SHA-256 checksums, and publishes the generation only after completion. This produces brief downtime (Caddy may return 502), but reduces database/file mismatch. It is not a database snapshot across external systems.

Immediately copy each complete generation to encrypted off-host storage using a separately reviewed mechanism. Local backups on the same VPS do not cover VPS loss/ransomware. Do not sync `.partial-*` directories. Independently verify the remote checksums/catalog, then mark only the matching local generation:

```sh
touch /srv/sinotaris/backups/20260819T120000Z/.offhost-verified
chmod 600 /srv/sinotaris/backups/20260819T120000Z/.offhost-verified
```

Local generations older than 14 days are deleted only when this marker exists. Without the marker, retention intentionally leaves them in place and disk usage must be monitored. A custom backup root is refused unless it remains below `/srv/sinotaris` and `ALLOW_CUSTOM_BACKUP_ROOT=1` is explicitly set.

Read-only integrity/catalog verification (no restore):

```sh
RESTORE_DIR=/srv/sinotaris/backups/20260819T120000Z \
TARGET_PROJECT=sinotaris-restore-drill \
sh deploy/scripts/restore-verify.sh
```

The verifier refuses empty/production-like project names, checks all checksums, lists the storage tar, and asks PostgreSQL tooling to list the custom dump. It deliberately restores nothing. A real drill requires isolated database/storage paths and must never point at `/srv/sinotaris/data`; document and test that procedure before public launch.

## Rollback and recovery notes

- Automatic smoke rollback uses the exact previous app container image reference. Manual application rollback can set `APP_IMAGE_TAG` to a previously built Git-SHA image and run Compose with `--no-build`; always account for forward-only database migrations.
- Database migrations are not automatically rolled back. Confirm backward compatibility before reverting app code. Restore from backup only under an approved incident procedure after preserving the failed state.
- Never run `docker compose down -v`; it can delete named Caddy state. Never remove `/srv/sinotaris/data` during rollback.
- If migration fails, app is not started against the new release. Inspect `migrate` logs, preserve the database, and do not repeatedly modify migration history.
- If TLS fails, check DNS, ports, Caddy logs, and ACME email. Do not weaken TLS or expose app port 3000 as a shortcut.

## Routine operations

- Patch Ubuntu and Docker regularly with a tested maintenance window.
- Digest pins do not update automatically. Review and intentionally refresh Node/PostgreSQL/Caddy digests for security updates, then rebuild and test.
- Protect Docker logs, backups, and data as confidential because this system processes notarial/client data.
- Monitor disk, memory, container restarts, HTTPS health, PostgreSQL backup age, and off-host copy success. Configure alerts before a public launch.
