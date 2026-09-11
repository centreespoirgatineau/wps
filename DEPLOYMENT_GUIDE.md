# Deployment guide — wps.davidhatin.com

For David. Estimated time: 30 minutes, most of it waiting for DNS.

## 0. What you need at hand

- SSH access to the Hostinger VPS (hPanel → VPS → *Browser terminal* works too).
- Twilio Console open: **Account SID**, **Auth Token**, and your Canadian local
  number in E.164 form (`+1819…`). You are on a paid Twilio account (a trial
  account can only text numbers you verified by hand).
- Wix DNS for davidhatin.com.
- The GitHub repository `centreespoirgatineau/wps` filled with this code (step 1).

## 1. Put the code on GitHub (once)

From the folder that contains this project (the zip delivered in `[Claude] Admin`):

```bash
git init -b main
git add .
git commit -m "wps v1"
git remote add origin https://github.com/centreespoirgatineau/wps.git
git push -u origin main
```

Nothing secret is in the repository: `.env` is git-ignored.

## 2. DNS at Wix

Wix → Domains → davidhatin.com → *Manage DNS records* → **Add record**:

| Type | Host name | Value | TTL |
|---|---|---|---|
| A | `wps` | *the VPS public IPv4* (hPanel → VPS → Overview) | 1 hour |

Do not touch the other records. Propagation is usually under 15 minutes.

## 3. Install on the VPS

```bash
ssh root@<vps-ip>
curl -fsSL https://raw.githubusercontent.com/centreespoirgatineau/wps/main/install.sh | sudo bash
```

The script:

1. checks Docker (offers to install it if absent — unlikely, your VPS already runs containers);
2. clones the repository into `/opt/wps`;
3. asks for the public URL and the three Twilio values and writes `/opt/wps/.env` (permissions 600);
4. builds and starts **one container** named `wps`, bound to `127.0.0.1:8087` only — it is not reachable from the internet until your reverse proxy forwards to it, and it cannot interfere with anything else on the server (own folder, own container, memory-capped, read-only filesystem, no root);
5. asks for your mobile number and creates the first administrator;
6. looks at what owns ports 80 and 443 and prints the exact steps for **that** proxy.

Step 6 is the only part that depends on your server. The cases:

**a. A panel runs the proxy (Coolify, Dokploy, Easypanel, Nginx Proxy Manager).**
The script tells you the container and network name. Two options:

- *Simplest:* deploy through the panel instead — "New application → from GitHub
  → centreespoirgatineau/wps" (it detects the `Dockerfile`), set the domain
  `wps.davidhatin.com`, add a persistent volume mounted on `/data`, paste the
  variables from `.env.example` with your values, deploy. The panel handles
  HTTPS. In that case stop the script's container: `cd /opt/wps && docker compose down`.
- *Or keep the script's container* and add a proxy host in the panel pointing to
  `http://wps:8080`, after `docker network connect <panel-network> wps` (the
  script offers to run it). In Nginx Proxy Manager: enable *Websockets support*
  and request an SSL certificate on the SSL tab.

**b. Nginx installed on the host.** The script installs the site file
(`deploy/nginx.conf`) and reloads Nginx. Then, once DNS is live:
`certbot --nginx -d wps.davidhatin.com`.

**c. Caddy or Apache on the host.** Follow the printed line; snippets are in `deploy/`.

**d. Nothing on 80/443.** The script offers to start a Caddy container that
obtains the certificate automatically.

## 4. First login and Twilio webhooks

1. Open https://wps.davidhatin.com — enter your mobile number, receive the code, sign in. You land on the admin dashboard.
2. Admin → *Paramètres*: check the default pickup location, optionally add a photo of the door.
3. Twilio Console → Phone Numbers → your number → *Messaging configuration*:
   - *A message comes in* → Webhook, `https://wps.davidhatin.com/twilio/inbound`, HTTP POST.
     (Lets STOP/START texts update the contact's status. Twilio already blocks
     sending to numbers that texted STOP; this keeps the list in sync.)
   - Delivery receipts are automatic: the app passes `https://wps.davidhatin.com/twilio/status`
     with each message, so *Livré / Échec* shows per contact.
4. Admin → *Contacts* → open your own contact → *Envoyer un texto de test*. You
   should receive it within seconds. If not, Admin → *Textos* shows Twilio's error.

## 5. Daily use

- **New offer:** Admin → *+ Nouvelle offre* → photos, title, what one lot contains,
  number of lots, max per contact, pickup, window → *Continuer* → review the
  recipients and the SMS text → *Envoyer*. Delivery status appears live.
- **During the day:** the offer page updates live (reservations, chat). Mark lots
  *Récupéré* when people come; *Non récupéré* for a no-show (blocks them on the
  next offer — you can lift it from the offer page or the contact page).
- **Contacts:** add directly, or approve requests under *Demandes* (the person
  gets a welcome text with their personal link). *Régénérer le lien* if a phone
  is lost. Contacts can leave the list themselves from *Moi*.
- **Admin re-verification:** admin pages ask for an SMS code once every 12 hours.
  Contacts opening their personal link never see a code.

## 6. Operations

| Task | Command (on the VPS) |
|---|---|
| Update after a code change | automatic within 2 minutes of a push to `main` once `autoupdate.sh` is in cron (see below); or `sudo bash /opt/wps/update.sh` by hand |
| Enable auto-deploy (once) | `(crontab -l 2>/dev/null; echo "*/2 * * * * bash /opt/wps/autoupdate.sh") \| crontab -` — log in `/var/log/wps-autoupdate.log` |
| Logs | `docker compose -f /opt/wps/docker-compose.yml logs -f` |
| Backup (DB + photos → `/opt/wps/backups`) | `sudo bash /opt/wps/backup.sh` — add to cron: `0 3 * * * bash /opt/wps/backup.sh` |
| Change a setting (e.g. Twilio number) | `nano /opt/wps/.env` then `sudo bash /opt/wps/update.sh` |
| Add another admin | Admin → Contacts → open the contact → Rôle: Administrateur |
| Remove everything | `cd /opt/wps && docker compose down && cd / && rm -rf /opt/wps` (plus the proxy host entry) |

Data lives in `/opt/wps/data/` (`wps.sqlite` + `uploads/`). Copying that folder
is a complete backup.

## 7. Troubleshooting

- **SMS "Simulé" instead of sent** — `.env` is missing a Twilio value or `SMS_DRY_RUN=1`. Fix and run `update.sh`.
- **Twilio error 21608** — trial account: upgrade, or verify the recipient's number in the Twilio console.
- **Twilio error 21211** — invalid recipient number; check the contact's phone.
- **Personal links open the login page** — the token was regenerated, or the contact was removed. Send the link again from the contact page.
- **Page loads but chat does not update live** — the proxy buffers responses. Use the snippets in `deploy/` (buffering off, long read timeout). The page still refreshes when reopened.
- **Certificate errors** — DNS not propagated yet, or the A record points elsewhere; `dig +short wps.davidhatin.com` must return the VPS IP.
- **Fonts look different** — headings use *Source Serif 4* from Google Fonts with a system serif fallback; without internet access to fonts.googleapis.com the fallback shows. Cosmetic only.

## 8. Cost

Twilio Canada: a few cents per SMS segment plus about $1.15/month for the number.
An offer to 30 contacts is roughly 30–60 segments (accented French may use two).
Hostinger: nothing extra — the container uses under 100 MB of RAM.
