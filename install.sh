#!/usr/bin/env bash
# One-shot installer / updater for the wps app on a Linux VPS that may already
# host other services. Everything lives in /opt/wps; the app listens only on
# 127.0.0.1:8087 and your existing reverse proxy forwards the domain to it.
#
#   curl -fsSL https://raw.githubusercontent.com/centreespoirgatineau/wps/main/install.sh | sudo bash
#   — or —  sudo bash install.sh   (from a clone)
set -euo pipefail

REPO="${WPS_REPO:-https://github.com/centreespoirgatineau/wps.git}"
DIR="${WPS_DIR:-/opt/wps}"
DOMAIN="${WPS_DOMAIN:-wps.davidhatin.com}"
PORT=8087

bold() { printf '\033[1m%s\033[0m\n' "$*"; }
ok()   { printf '  \033[32m✓\033[0m %s\n' "$*"; }
warn() { printf '  \033[33m!\033[0m %s\n' "$*"; }
die()  { printf '  \033[31m✗\033[0m %s\n' "$*" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || die "Run as root: sudo bash install.sh"
# When run as `curl … | bash`, stdin is the script itself: take answers from the terminal.
[ -t 0 ] || exec < /dev/tty

bold "1/6  Checking Docker"
if ! command -v docker >/dev/null 2>&1; then
  warn "Docker is not installed."
  read -r -p "  Install Docker now with the official script? [y/N] " a
  [[ "${a,,}" == y* ]] || die "Docker is required."
  curl -fsSL https://get.docker.com | sh
fi
docker compose version >/dev/null 2>&1 || die "Docker Compose plugin missing (apt install docker-compose-plugin)."
ok "Docker $(docker --version | sed 's/Docker version //;s/,.*//') with Compose"

bold "2/6  Code in $DIR"
if [ -d "$DIR/.git" ]; then
  git -C "$DIR" pull --ff-only && ok "Updated from git"
elif [ -f "$DIR/package.json" ]; then
  ok "Using existing files (not a git clone)"
else
  command -v git >/dev/null 2>&1 || (apt-get update -qq && apt-get install -y -qq git)
  git clone --depth 1 "$REPO" "$DIR" && ok "Cloned $REPO"
fi
cd "$DIR"
mkdir -p data && chown -R 1000:1000 data   # 'node' user inside the container

bold "3/6  Configuration (.env)"
if [ ! -f .env ]; then
  cp .env.example .env
  read -r -p "  Public URL [https://$DOMAIN]: " url; url="${url:-https://$DOMAIN}"
  read -r -p "  Twilio Account SID: " sid
  read -r -s -p "  Twilio Auth Token (hidden): " tok; echo
  read -r -p "  Twilio sending number (E.164, e.g. +18195551234): " from
  sed -i "s|^APP_URL=.*|APP_URL=$url|; s|^TWILIO_ACCOUNT_SID=.*|TWILIO_ACCOUNT_SID=$sid|; s|^TWILIO_AUTH_TOKEN=.*|TWILIO_AUTH_TOKEN=$tok|; s|^TWILIO_FROM=.*|TWILIO_FROM=$from|" .env
  sed -i "s|^APP_SECRET=.*|APP_SECRET=$(head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n')|" .env
  chmod 600 .env
  ok ".env written (chmod 600). Edit it any time: nano $DIR/.env, then: bash update.sh"
else
  ok ".env already present (kept as is)"
fi

bold "4/6  Building and starting the container"
docker compose up -d --build --remove-orphans
sleep 2
if curl -fsS "http://127.0.0.1:$PORT/healthz" >/dev/null; then
  ok "App is answering on 127.0.0.1:$PORT (not reachable from the internet directly)"
else
  docker compose logs --tail=30 wps; die "The app did not start. See the logs above."
fi

bold "5/6  First administrator"
admins="$(docker compose exec -T wps node --no-warnings=ExperimentalWarning -e "const {DatabaseSync}=require('node:sqlite');const d=new DatabaseSync('/data/wps.sqlite');console.log(d.prepare(\"SELECT COUNT(*) n FROM contacts WHERE role='admin'\").get().n)" 2>/dev/null || echo 0)"
if [ "$admins" = "0" ]; then
  read -r -p "  Your mobile number (e.g. (819) 555-1234): " phone
  read -r -p "  First name [David]: " fn; fn="${fn:-David}"
  read -r -p "  Last name [Hatin]: " ln; ln="${ln:-Hatin}"
  docker compose exec -T wps node --no-warnings=ExperimentalWarning scripts/make-admin.js "$phone" "$fn" "$ln" "Centre Espoir de Gatineau" fr
else
  ok "An administrator already exists"
fi

bold "6/6  Reverse proxy for $DOMAIN → 127.0.0.1:$PORT"
listeners="$(ss -ltnpH 'sport = :80 or sport = :443' 2>/dev/null | sed -n 's/.*users:(("\([^"]*\)".*/\1/p' | sort -u | tr '\n' ' ')"
if [ -z "$listeners" ]; then
  warn "Nothing listens on ports 80/443."
  read -r -p "  Start a Caddy container that will obtain HTTPS for $DOMAIN automatically? [y/N] " a
  if [[ "${a,,}" == y* ]]; then
    sed "s/DOMAIN/$DOMAIN/" deploy/Caddyfile.standalone > deploy/Caddyfile
    docker compose -f docker-compose.yml -f deploy/docker-compose.caddy.yml up -d
    ok "Caddy started. Point the DNS A record for $DOMAIN to this server's IP; HTTPS is automatic."
  fi
elif echo "$listeners" | grep -q docker-proxy; then
  ctn="$(docker ps --format '{{.Names}} {{.Ports}}' | grep -E ':(80|443)->' | awk '{print $1}' | head -1)"
  img="$(docker inspect -f '{{.Config.Image}}' "$ctn" 2>/dev/null || true)"
  warn "Ports 80/443 belong to the container '$ctn' ($img)."
  net="$(docker inspect -f '{{range $k,$v := .NetworkSettings.Networks}}{{$k}} {{end}}' "$ctn" | awk '{print $1}')"
  echo "  A containerised proxy cannot reach 127.0.0.1 of the host, so attach wps to its network:"
  echo "      docker network connect $net wps"
  echo "  then forward $DOMAIN to  http://wps:8080  in that proxy:"
  case "$img" in
    *nginx-proxy-manager*|*jc21*) echo "   • Nginx Proxy Manager → Proxy Hosts → Add: domain $DOMAIN, scheme http, forward host 'wps', port 8080, Websockets ON, SSL tab → Request a new certificate, Force SSL.";;
    *traefik*) echo "   • Traefik: add the labels from deploy/traefik-labels.yml to docker-compose.yml (see deploy/README.md), or deploy through your panel (Coolify/Dokploy) from the GitHub repo.";;
    *caddy*) echo "   • Caddy: add the block from deploy/Caddyfile.snippet (use 'reverse_proxy wps:8080') and reload Caddy.";;
    *) echo "   • Add a host for $DOMAIN forwarding to http://wps:8080 (WebSocket/SSE friendly: no response buffering).";;
  esac
  read -r -p "  Run 'docker network connect $net wps' now? [y/N] " a
  [[ "${a,,}" == y* ]] && docker network connect "$net" wps 2>/dev/null && ok "wps attached to network $net"
elif echo "$listeners" | grep -qi nginx; then
  sed "s/DOMAIN/$DOMAIN/g" deploy/nginx.conf > "/etc/nginx/sites-available/$DOMAIN.conf" 2>/dev/null \
    && ln -sf "/etc/nginx/sites-available/$DOMAIN.conf" "/etc/nginx/sites-enabled/$DOMAIN.conf" \
    && nginx -t && systemctl reload nginx && ok "Nginx site $DOMAIN installed (HTTP)."
  if command -v certbot >/dev/null 2>&1; then
    echo "  Get the certificate when the DNS record is live:  certbot --nginx -d $DOMAIN"
  else
    echo "  Install certbot then run:  apt install certbot python3-certbot-nginx && certbot --nginx -d $DOMAIN"
  fi
elif echo "$listeners" | grep -qi caddy; then
  warn "Host Caddy detected. Append deploy/Caddyfile.snippet (with your domain) to your Caddyfile and run: systemctl reload caddy"
elif echo "$listeners" | grep -qiE 'apache|httpd'; then
  warn "Apache detected. Enable mod_proxy, mod_proxy_http, mod_ssl and add deploy/apache.conf as a VirtualHost for $DOMAIN, then certbot --apache -d $DOMAIN"
else
  warn "Ports 80/443 are used by: $listeners — forward $DOMAIN to http://127.0.0.1:$PORT (see deploy/)."
fi

echo
bold "Done."
echo "  DNS: at Wix, add an A record  host: wps  →  $(curl -fsS -4 https://ifconfig.me 2>/dev/null || hostname -I | awk '{print $1}')"
echo "  App: https://$DOMAIN   Logs: docker compose -f $DIR/docker-compose.yml logs -f"
echo "  Update later: sudo bash $DIR/update.sh    Backup: sudo bash $DIR/backup.sh"
