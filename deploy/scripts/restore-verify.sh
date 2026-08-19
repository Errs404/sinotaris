#!/bin/sh
set -eu

umask 077
: "${RESTORE_DIR:?Set RESTORE_DIR to one backup generation directory.}"

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
DEPLOY_DIR=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)
TARGET_PROJECT=${TARGET_PROJECT:-}
POSTGRES_IMAGE=postgres:17@sha256:a426e44bac0b759c95894d68e1a0ac03ecc20b619f498a91aae373bf06d8508d

[ -d "$RESTORE_DIR" ] || { echo "RESTORE_DIR is not a directory." >&2; exit 1; }
[ -f "$RESTORE_DIR/SHA256SUMS" ] || { echo "SHA256SUMS missing." >&2; exit 1; }
[ -f "$RESTORE_DIR/database.dump" ] || { echo "database.dump missing." >&2; exit 1; }
[ -f "$RESTORE_DIR/storage.tar.gz" ] || { echo "storage.tar.gz missing." >&2; exit 1; }

case "$TARGET_PROJECT" in
  sinotaris|production|prod|"")
    echo "Refusing a production/unspecified target. Set TARGET_PROJECT to an isolated verification project name." >&2
    exit 1
    ;;
esac

(cd "$RESTORE_DIR" && sha256sum -c SHA256SUMS)
tar -tzf "$RESTORE_DIR/storage.tar.gz" >/dev/null

# Read-only archive inspection only. No Compose volumes or networks are attached.
docker run --rm --network none --read-only --cap-drop ALL --security-opt no-new-privileges \
  --tmpfs /tmp:rw,noexec,nosuid,size=64m -i "$POSTGRES_IMAGE" pg_restore --list \
  < "$RESTORE_DIR/database.dump" >/dev/null

echo "Backup checksums and archive catalogs are valid."
echo "No data was restored. Perform a documented restore drill only into an isolated database and storage path."
