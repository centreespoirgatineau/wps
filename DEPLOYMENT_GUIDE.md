# Deployment guide — jc.centreespoir.ca

For David. Estimated time: 30 minutes, most of it waiting for DNS.

## 0. What you need at hand

- SSH access to the Hostinger VPS (hPanel → VPS → *Browser terminal* works too).
- Twilio Console open: **Account SID**, **Auth Token**, and your Canadian local
  number in E.164 form (`+1819…`). You are on a paid Twilio account (a trial
  account can only text numbers you verified by hand).
- Cloudflare, which holds the DNS for centreespoir.ca.
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

> **Moving to another address later?** Two steps, no terminal: change the `Host(...)`
> line in `deploy/docker-compose.override.traefik.yml` and push (the server picks
> it up within two minutes), then set the new address in **Admin → Réglages →
> Adresse du site** so the links in the text messages follow. Add the DNS record
> first, and leave the old one in place for a while — contacts sign in with links
> that are still in their old text messages.

## 2. DNS at Cloudflare

centreespoir.ca is on Cloudflare. The main website (Wix) is served by the root
record and by `www`; **do not touch either of them.** You are only adding one
subdomain.

Cloudflare → centreespoir.ca → **DNS** → *Add record*:

| Type | Name | IPv4 address | Proxy status | TTL |
|---|---|---|---|---|
| A | `jc` | `72.60.112.197` | **DNS only** (grey cloud) | Auto |

Two things matter here:

- **The proxy must be off (grey cloud, not orange.)** The server gets its HTTPS
  certificate from Let's Encrypt using the TLS-ALPN challenge, which needs to
  answer the TLS handshake itself. With Cloudflare's proxy on, Cloudflare
  answers instead and the certificate never issues — the site shows a
  certificate error and stays broken.
- There is a **wildcard record** (`*`) on this domain, so `jc.centreespoir.ca`
  already resolves somewhere today. An explicit `jc` record wins over the
  wildcard, so simply adding it is enough.

Propagation is usually a couple of minutes on Cloudflare.

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
  `jc.centreespoir.ca`, add a persistent volume mounted on `/data`, paste the
  variables from `.env.example` with your values, deploy. The panel handles
  HTTPS. In that case stop the script's container: `cd /opt/wps && docker compose down`.
- *Or keep the script's container* and add a proxy host in the panel pointing to
  `http://wps:8080`, after `docker network connect <panel-network> wps` (the
  script offers to run it). In Nginx Proxy Manager: enable *Websockets support*
  and request an SSL certificate on the SSL tab.

**b. Nginx installed on the host.** The script installs the site file
(`deploy/nginx.conf`) and reloads Nginx. Then, once DNS is live:
`certbot --nginx -d jc.centreespoir.ca`.

**c. Caddy or Apache on the host.** Follow the printed line; snippets are in `deploy/`.

**d. Nothing on 80/443.** The script offers to start a Caddy container that
obtains the certificate automatically.

## 4. First login and Twilio webhooks

1. Open https://jc.centreespoir.ca — enter your mobile number, receive the code, sign in. You land on the admin dashboard.
2. Admin → *Paramètres*: check the default pickup location, optionally add a photo of the door.
3. Twilio Console → Phone Numbers → your number → *Messaging configuration*:
   - *A message comes in* → Webhook, `https://jc.centreespoir.ca/twilio/inbound`, HTTP POST.
     (Lets STOP/START texts update the contact's status. Twilio already blocks
     sending to numbers that texted STOP; this keeps the list in sync.)
   - Delivery receipts are automatic: the app passes `https://jc.centreespoir.ca/twilio/status`
     with each message, so *Livré / Échec* shows per contact.
4. Admin → *Contacts* → open your own contact → *Envoyer un texto de test*. You
   should receive it within seconds. If not, Admin → *Textos* shows Twilio's error.

## 4b. The second platform — spp.centreespoir.ca

The *Système de Prévention de Pertes* is the same platform for a different
audience: the food banks and community organisations of the region, with no
religious wording anywhere and an invitation to donate. It is **the same code**
running a second time, with its own database, its own contacts and its own
offers. Nothing you do on one shows up on the other.

Standing it up is two steps.

**1. Add the DNS record.** Cloudflare → centreespoir.ca → DNS → *Add record*:

| Type | Name | IPv4 address | Proxy status | TTL |
|---|---|---|---|---|
| A | `spp` | `72.60.112.197` | **DNS only** (grey cloud) | Auto |

Same rule as before: the grey cloud is not optional. With the orange cloud the
certificate never issues and the site stays broken.

**2. Tell me the record is in**, and I add one file to the repository
(`deploy/spp.enabled`) and push. Within two minutes the second container starts,
Traefik gets its certificate, and https://spp.centreespoir.ca is live with you
already an administrator on it — sign in with your own mobile number, exactly
like the church platform. Removing that file again takes it offline just as
cleanly; the database is kept either way.

Both platforms text from the same Twilio number, which costs nothing extra. A
contact on one is not a contact on the other: the two lists are separate, so an
organisation that belongs on both has to be added on both.

**The donation link.** Admin → *Réglages* → *Lien de don* on the spp platform:
paste the Zeffy page address there. Until you do, the platform never mentions
money anywhere. Once set, it shows in exactly two places — a small link in the
header and one paragraph on the *À propos* page. It never appears while someone
is reserving a lot, on purpose: a donation must never look like it buys
priority. Leave the field empty on the church platform, which stays free with no
ask at all.

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

## 5b. Email notices to the Centre

Every time a lot is reserved — on either platform — a short French email goes to
`direction@centreespoir.ca` and `communications@centreespoir.ca`. It says which
organisation reserved, who, their phone number, which offer, which lot, and how
many lots that organisation now holds. When an administrator reserves in
override, the message says so.

It is off until you add three lines to `/opt/wps/.env`, and both containers read
that same file, so one entry covers jc and spp:

```
RESEND_API_KEY=re_xxxxxxxxxxxxxxxxxxxx
MAIL_FROM=Surplus Centre Espoir <notifications@centreespoir.ca>
MAIL_TO=direction@centreespoir.ca,communications@centreespoir.ca
```

Then `sudo bash /opt/wps/update.sh`.

The key comes from **resend.com → API Keys**. `centreespoir.ca` is already a
verified sending domain on that account, so `MAIL_FROM` can be any address on
it; the mailbox does not need to exist, since nobody replies to these.

Three things to know:

- **One email per reservation.** An offer of twenty lots taken by twenty
  churches sends twenty emails. That is the point, but check the sending limit
  on your Resend plan before a large offer.
- **Leaving `MAIL_TO` empty switches it off** completely, which is how a local
  copy runs. `MAIL_DRY_RUN=1` writes the message to the container log instead of
  sending it — useful for a first test without filling an inbox.
- **A failed email never affects a reservation.** The lot is already committed
  before the message is attempted; a failure is written to the log and nothing
  else. So an expired key means silence, not a broken platform — worth knowing,
  because nothing on screen will tell you.

## 6. Operations

| Task | Command (on the VPS) |
|---|---|
| Update after a code change | automatic within 2 minutes of a push to `main` once `autoupdate.sh` is in cron (see below); or `sudo bash /opt/wps/update.sh` by hand |
| Enable auto-deploy (once) | `(crontab -l 2>/dev/null; echo "*/2 * * * * bash /opt/wps/autoupdate.sh") \| crontab -` — log in `/var/log/wps-autoupdate.log` |
| Logs | `docker compose -f /opt/wps/docker-compose.yml logs -f` |
| Backup (DB + photos → `/opt/wps/backups`) | `sudo bash /opt/wps/backup.sh` — add to cron: `0 3 * * * bash /opt/wps/backup.sh` |
| Change a setting (e.g. Twilio number) | `nano /opt/wps/.env` then `sudo bash /opt/wps/update.sh` |
| Turn the email notices on/off, or change who gets them | `nano /opt/wps/.env` (`MAIL_TO=`, empty to stop) then `sudo bash /opt/wps/update.sh` |
| Add another admin | Admin → Contacts → open the contact → Rôle: Administrateur |
| Remove everything | `cd /opt/wps && docker compose down && cd / && rm -rf /opt/wps` (plus the proxy host entry) |

Data lives in `/opt/wps/data/` (`wps.sqlite` + `uploads/`). Copying that folder
is a complete backup.

## 7. Troubleshooting

- **No email when a lot is reserved** — `.env` is missing `RESEND_API_KEY`,
  `MAIL_FROM` or `MAIL_TO`, or `MAIL_DRY_RUN=1`. The container log says
  `[mail not configured]` or `[mail dry-run]`; a rejected key says `[mail] failed`.
- **SMS "Simulé" instead of sent** — `.env` is missing a Twilio value or `SMS_DRY_RUN=1`. Fix and run `update.sh`.
- **Twilio error 21608** — trial account: upgrade, or verify the recipient's number in the Twilio console.
- **Twilio error 21211** — invalid recipient number; check the contact's phone.
- **Personal links open the login page** — the token was regenerated, or the contact was removed. Send the link again from the contact page.
- **Page loads but chat does not update live** — the proxy buffers responses. Use the snippets in `deploy/` (buffering off, long read timeout). The page still refreshes when reopened.
- **Certificate errors** — DNS not propagated yet, or the A record points elsewhere; `dig +short jc.centreespoir.ca` must return the VPS IP.
- **Fonts look different** — headings use *Source Serif 4* from Google Fonts with a system serif fallback; without internet access to fonts.googleapis.com the fallback shows. Cosmetic only.

## 8. Cost

Twilio Canada: a few cents per SMS segment plus about $1.15/month for the number.
An offer to 30 contacts is roughly 30–60 segments (accented French may use two).
Hostinger: nothing extra — the container uses under 100 MB of RAM.
