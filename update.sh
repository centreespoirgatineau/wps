#!/usr/bin/env bash
# Pull the latest code and restart the container(s) without losing data.
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

# The second platform (spp.centreespoir.ca) is behind a compose profile, so it
# stays off until deploy/spp.enabled is committed — one file to add, one file to
# remove, no terminal. Its DNS record must exist first, or Traefik cannot get a
# certificate for it.
PROFILE=()
if [ -f deploy/spp.enabled ]; then PROFILE=(--profile spp); fi

docker compose "${PROFILE[@]}" up -d --build --remove-orphans

check() {  # port, name
  sleep 2
  curl -fsS "http://127.0.0.1:$1/healthz" >/dev/null \
    && echo "✓ $2 updated and healthy" \
    || { docker compose logs --tail=40 "$2"; exit 1; }
}
check 8087 wps
if [ ${#PROFILE[@]} -gt 0 ]; then
  # If the second platform will not come up, the first thing to look at is the
  # one-shot container that prepares its data directory.
  curl -fsS http://127.0.0.1:8088/healthz >/dev/null 2>&1 || docker compose logs --tail=20 wps-spp-init || true
  check 8088 wps-spp
fi
