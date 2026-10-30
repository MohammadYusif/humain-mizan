#!/bin/sh
# Hosts such as Railway mount volumes owned by root. Start as root only to hand the data folders to
# the unprivileged app user, then run the server as that user. Without root (e.g. `docker run -u`),
# just run the command.
set -e
RUNS="${HACK_RUNS_DIR:-/app/runs}"
if [ "$(id -u)" = "0" ]; then
  mkdir -p "$RUNS" /app/data/uploads
  # Top level only: a bind mount from Windows or macOS may not allow chown; that is fine there.
  chown app:app "$RUNS" /app/data /app/data/uploads 2>/dev/null || true
  exec setpriv --reuid=app --regid=app --init-groups "$@"
fi
exec "$@"
