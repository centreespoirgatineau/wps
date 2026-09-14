#!/usr/bin/env bash
# Pull the latest code and restart the container without losing data.
set -euo pipefail
cd "$(dirname "$0")"
[ -d .git ] && [ -z "${WPS_NO_PULL:-}" ] && git pull --ff-only || true

# Keep the reverse-proxy settings in step with the repository. deploy/ has always
# been the master copy of this file — this just stops it needing to be copied by
# hand, so a change of domain or of routing is a push to GitHub and nothing more.
# Set WPS_NO_OVERRIDE_SYNC=1 to manage docker-compose.override.yml yourself.
SRC="deploy/docker-compose.override.traefik.yml"
if [ -z "${WPS_NO_OVERRIDE_SYNC:-}" ] && [ -f "$SRC" ]; then
  if ! cmp -s "$SRC" docker-compose.override.yml 2>/dev/null; then
    cp -f "$SRC" docker-compose.override.yml
    echo "• reverse-proxy settings updated from $SRC"
  fi
fi

docker compose up -d --build --remove-orphans
sleep 2 && curl -fsS http://127.0.0.1:8087/healthz >/dev/null && echo "✓ wps updated and healthy" || { docker compose logs --tail=40 wps; exit 1; }
