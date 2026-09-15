#!/usr/bin/env bash
# Consistent backup of every platform's SQLite database + photos into ./backups
# (keeps 14 of each). The second platform is skipped when it is not running.
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p backups
stamp="$(date +%Y-%m-%d_%H%M)"

# service, label, host data directory
snap() {
  local svc="$1" label="$2" dir="$3"
  docker compose exec -T "$svc" node --no-warnings=ExperimentalWarning -e '
    const {DatabaseSync}=require("node:sqlite");
    const d=new DatabaseSync("/data/wps.sqlite"); d.exec("VACUUM INTO \x27/tmp/backup.sqlite\x27");'
  docker compose cp "$svc:/tmp/backup.sqlite" "backups/${label}_$stamp.sqlite"
  tar -czf "backups/${label}_uploads_$stamp.tgz" -C "$dir" uploads
  ls -1t "backups/${label}_"*.sqlite | tail -n +15 | xargs -r rm -f
  ls -1t "backups/${label}_uploads_"*.tgz | tail -n +15 | xargs -r rm -f
  echo "✓ backups/${label}_$stamp.sqlite + ${label}_uploads_$stamp.tgz"
}

snap wps wps data

# Only when the food-bank platform is up; its database is separate and would
# otherwise never be backed up at all.
if [ -n "$(docker compose ps -q wps-spp 2>/dev/null)" ]; then
  snap wps-spp wps-spp data-spp
else
  echo "· wps-spp is not running, skipped"
fi
