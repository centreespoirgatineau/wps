#!/usr/bin/env bash
# Pull the latest code and restart the container without losing data.
set -euo pipefail
cd "$(dirname "$0")"
[ -d .git ] && [ -z "${WPS_NO_PULL:-}" ] && git pull --ff-only || true
docker compose up -d --build --remove-orphans
sleep 2 && curl -fsS http://127.0.0.1:8087/healthz >/dev/null && echo "✓ wps updated and healthy" || { docker compose logs --tail=40 wps; exit 1; }
