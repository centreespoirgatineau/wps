#!/usr/bin/env bash
# Consistent backup of the SQLite database + photos into ./backups (keeps 14).
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p backups
stamp="$(date +%Y-%m-%d_%H%M)"
docker compose exec -T wps node --no-warnings=ExperimentalWarning -e '
  const {DatabaseSync}=require("node:sqlite");
  const d=new DatabaseSync("/data/wps.sqlite"); d.exec("VACUUM INTO \x27/tmp/backup.sqlite\x27");' 
docker compose cp wps:/tmp/backup.sqlite "backups/wps_$stamp.sqlite"
tar -czf "backups/uploads_$stamp.tgz" -C data uploads
ls -1t backups/wps_*.sqlite | tail -n +15 | xargs -r rm -f
ls -1t backups/uploads_*.tgz | tail -n +15 | xargs -r rm -f
echo "✓ backups/wps_$stamp.sqlite + uploads_$stamp.tgz"
