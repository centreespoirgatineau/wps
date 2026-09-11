#!/usr/bin/env bash
# Pull-based auto-deploy: if GitHub has a newer commit on main, run update.sh.
# Install once (as root):  (crontab -l 2>/dev/null; echo "*/2 * * * * bash /opt/wps/autoupdate.sh") | crontab -
set -euo pipefail
cd "$(dirname "$0")"
git fetch -q origin main || exit 0
local_rev="$(git rev-parse HEAD)"; remote_rev="$(git rev-parse origin/main)"
[ "$local_rev" = "$remote_rev" ] && exit 0
{
  echo "== $(date -Is) deploying ${remote_rev:0:7} (was ${local_rev:0:7})"
  git reset -q --hard origin/main
  WPS_NO_PULL=1 bash update.sh
} >> /var/log/wps-autoupdate.log 2>&1
