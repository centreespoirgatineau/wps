# deploy/

Reverse-proxy snippets used by `install.sh`. The app itself only ever listens on
`127.0.0.1:8087` (host) / `wps:8080` (Docker network). Pick the one matching what
already answers on ports 80/443 of the VPS:

| What owns 80/443 | Use |
|---|---|
| Nothing | `docker-compose.caddy.yml` + `Caddyfile.standalone` (automatic HTTPS) |
| Nginx on the host | `nginx.conf` + `certbot --nginx` |
| Apache on the host | `apache.conf` + `certbot --apache` |
| Caddy on the host | `Caddyfile.snippet` |
| Traefik / Coolify / Dokploy / Easypanel (containers) | `traefik-labels.yml`, or simply deploy the GitHub repo through the panel (it has a Dockerfile) with a persistent volume on `/data` and the variables from `.env.example` |
| Nginx Proxy Manager (container) | `docker network connect <npm-network> wps`, then a Proxy Host → `http://wps:8080`, WebSockets on, SSL on |

Server-Sent Events power the live chat: keep response buffering off and read
timeouts long, as the snippets do.
