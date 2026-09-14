# CLAUDE.md — wps (plateforme de surplus alimentaire)

Read this first. It is the project's memory: what the app is, the decisions behind
it, how it is deployed, and the rules to respect when changing it.

## 1. What this is

Centre Espoir de Gatineau (food bank, Gatineau QC) sometimes receives food that
must leave the same day — the trigger was $1,500 of sushi trays lost on
2026-09-10. An administrator publishes an **offer**; every active **contact**
(about 30 churches and ministries) receives a personal SMS link; they reserve a
**lot**, coordinate in a per-offer chat, and pick it up. Fairness rules stop the
same organisations taking everything.

The platform exists not only to prevent waste but, in David's words, to use these
surpluses as a tool to preach the gospel of Jesus Christ. That intent is stated in
the About page and in rule 2 of the platform rules; keep it intact.

- **Owner / only admin today:** David Hatin, Directeur général (+1 819 208 5721).
- **Live:** https://wps.davidhatin.com
- **Interface:** French by default, English toggle. Mobile first — most users are
  on a phone. Unbranded: no product name anywhere in the interface.

## 2. Stack and constraints (read before proposing changes)

Node.js 22 with **zero npm dependencies**, on purpose: `node:http`, `node:sqlite`,
global `fetch` for the Twilio REST API, Server-Sent Events for live updates, an
in-house EJS-style template engine, photos resized in the browser before upload.

**Do not add an npm dependency without asking.** The constraint originally came
from a blocked registry in the build sandbox, but it has become a feature: no
supply chain, no install step on the server, a 60 MB image, instant boot. If a
dependency ever looks unavoidable, say so explicitly and let David decide.

Other hard constraints:

- **SQLite, single file** at `data/wps.sqlite` (WAL). Schema in `src/lib/db.js`.
  Schema changes go in the `MIGRATIONS` array there — additive columns only,
  applied automatically at boot. Never a destructive migration: the production
  database holds real contacts.
- **Timezone `America/Toronto` everywhere.** Offers expire at 23:59 local. All
  timestamps are epoch ms; `src/lib/time.js` owns every conversion. Never use the
  server's local time implicitly.
- **French display conventions:** times as `14H05` (capital H, no space), phones as
  `(819) 208-5721`. See `src/lib/phone.js`, `src/lib/time.js`.
- **Static assets are content-hashed** (`app.css?v=<hash>` computed at boot in
  `src/server.js`); HTML is `Cache-Control: no-store`. This exists because a stale
  cached stylesheet once broke the live layout. Keep it.

## 3. Layout of the code

```
src/server.js          wiring: security headers, language, view helpers, error handling
src/config.js          environment → config object
src/lib/http.js        tiny router, body parsing, cookies, static files
src/lib/view.js        template engine (<%= %> escaped, <%- %> raw, <% %> code, include())
src/lib/db.js          schema + migrations + thin SQLite wrapper (db.get/all/run/tx)
src/lib/rules.js       THE FAIRNESS RULES — see §4. Unit-tested in isolation.
src/lib/auth.js        sessions, SMS login codes, CSRF, rate limits, personal links
src/lib/sms.js         Twilio REST, webhook signature check, GSM-7 flattening
src/lib/sse.js         one live channel per offer
src/lib/scheduler.js   30 s tick: expire offers at end of day, tidy auth tables
src/routes/public.js   login, personal links, about, join requests
src/routes/contact.js  offers, reservations, chat, personal settings, private media
src/routes/admin.js    offers, lots, contacts, requests, SMS log, settings
src/routes/twilio.js   delivery-status and inbound (STOP/START) webhooks
src/views/             templates; `_name.html` are partials, `admin/` is admin-only
src/public/            app.css, app.js, icon.svg  (no build step)
src/locales/fr.js en.js  every user-visible string; FR is the reference
scripts/make-admin.js  create/promote an administrator from the CLI
test/rules.test.js     rules engine, in-memory DB, no server
test/flow.test.js      end-to-end HTTP against a real server process, SMS in dry-run
```

## 4. The fairness rules (the heart of the app)

All of it lives in `src/lib/rules.js`. David defined these; do not change the
semantics without asking him.

| Event | Effect |
|---|---|
| Offer published | Lots created; every *pending* penalty becomes *active*, targeting this offer |
| Contact reserves | Lot taken atomically (SQLite `BEGIN IMMEDIATE`, first writer wins); contact earns a *pending* cooldown |
| Cooldown active | On the next published offer, that contact must wait 15 minutes after publication (`COOLDOWN_MINUTES`) |
| Admin marks no-show | Holder earns a *pending* no-show penalty → cannot reserve at all on the next offer |
| Offer ends (23:59 local, or closed by admin) | Status `expired`/`closed`; every penalty targeting it is *cleared*; chat becomes read-only |
| Max per contact | Set per offer by the admin (default 1) |

Notes that have already caught me out:

- A contact cancelling their own reservation **keeps** the cooldown — it was earned
  by the act of taking the lot away from others.
- Cooldowns do not stack: one pending cooldown per contact, however many lots.
- `effectiveStatus()` computes expiry lazily, so an offer is correctly "expired"
  even if the 30 s scheduler has not run yet. Always go through it.
- Pick-ups are **not** tracked (David's decision): the only post-offer action is
  marking a no-show, and only once the offer has ended.

## 5. Roles and what each sees

- **Visitor** — login by phone (6-digit SMS code), About page, join request form.
- **Contact (`role=user`)** — offers, reservations, chat, `/reglages` (language,
  sign out, leave the list). **Never sees admin navigation.** The header shows the
  icon and a gear, nothing else.
- **Admin (`role=admin`)** — everything, plus the tabs row. Admin pages require a
  code-verified session younger than `ADMIN_FRESH_HOURS` (12); opening a personal
  link is enough for contact pages but not for admin ones.
- **Test account (`no_sms=1`)** — for David to test alone with one real phone.
  Never texted (enforced in `sendSms` itself, not only at the call sites), cannot
  log in by code, signs in only through its personal link. Unticked by default in
  the recipients list.
- **Demonstration account (`(555) 555-5555`)** — typing that number on the login
  screen signs straight in to the contact dashboard: no code, no text message.
  It exists so the contact side can be shown or checked without a second phone.
  It is **read-only**: reserving is refused by `rules.canReserve()` itself (so a
  hand-made request fails too, not just a hidden button), chat and leaving the
  list are refused in the routes, and it is never a recipient when publishing.
  The number is also refused inside `sendSms` regardless of its checkbox.
  All of it lives in `src/lib/demo.js`. Off switch: Admin → Contacts →
  Démonstration, set the status to anything but active — that also ends any
  demo session already open. Note it lets anyone who guesses the number read
  offers, the chat, and the name/organisation/phone of whoever holds a lot.

## 6. Deployment (already live — do not reinvent)

- **GitHub:** `centreespoirgatineau/wps`, branch `main`, public.
- **Server:** Hostinger VPS `srv1161077`, 72.60.112.197, Ubuntu, Docker.
  App in `/opt/wps`, container `wps` listening **only** on `127.0.0.1:8087`.
- **Reverse proxy:** the VPS already runs **Traefik** (`root-traefik-1`, docker
  provider, `exposedbydefault=false`, cert resolver `mytlschallenge`) plus other
  unrelated containers — `psc` (psc.davidhatin.com) and `root-n8n-1`. **Never touch
  them.** wps is routed by labels in `/opt/wps/docker-compose.override.yml`
  (kept out of Git; copy in `deploy/docker-compose.override.traefik.yml`) and is
  attached to the `root_default` network.
- **DNS:** Wix holds davidhatin.com; A record `wps` → 72.60.112.197.
- **Auto-deploy:** `autoupdate.sh` runs every 2 minutes from root's crontab; it
  fetches `origin/main`, and if it differs, hard-resets and runs `update.sh`. Log:
  `/var/log/wps-autoupdate.log`. **So: push to main = live within 2 minutes.**
  Say so when you push, and check the log if in doubt.
- **Secrets** live only in `/opt/wps/.env` (chmod 600, git-ignored): Twilio SID,
  token, sending number (a Canadian local number — no A2P 10DLC needed for
  Canadian recipients), `APP_SECRET`. Never print or commit them.
- **Data** is `/opt/wps/data/` (SQLite + uploads). `backup.sh` snapshots it.

Full operator documentation for David: `DEPLOYMENT_GUIDE.md` (English, written for
a non-developer). Update it when operations change.

## 7. Working agreements with David

- **Language:** conversation with David in **English**; everything user-facing in
  **French** (Quebec), with the English locale kept in step. Never mix inside one
  deliverable.
- **He is not a developer.** Explain in plain terms, give exact steps, never assume
  terminal fluency. When something breaks, say plainly what went wrong and why —
  he values a straight diagnosis over reassurance.
- **Design brief:** minimal, compact, intuitive; light Claude-like palette (warm
  off-white, terracotta accent, serif headings); unbranded; mobile first. When in
  doubt, remove something. He notices layout details — check at 360 px, ~440 px and
  desktop before declaring done.
- **Verify before claiming.** Run `npm test` (15 tests), and for UI changes take
  real screenshots with Playwright. Two bugs reached him because I asserted instead
  of checking: a stale CSS cache, and test accounts still being texted.
- **Ask rather than guess** on product decisions; he answers quickly and precisely.

## 8. Running it locally

```bash
cp .env.example .env         # APP_URL=http://localhost:8080, SMS_DRY_RUN=1
npm start                    # no install step — zero dependencies
npm run admin -- "(819) 555-0001" David Hatin "Centre Espoir"
npm test                     # 15 tests: rules engine + end-to-end HTTP
```

With `SMS_DRY_RUN=1` (or no Twilio credentials) texts are logged rather than sent,
and in `NODE_ENV=development` the login code is displayed on the login page — that
is how the automated tests sign in.

## 9. Open items

- Twilio inbound webhook (`/twilio/inbound`, for STOP/START) to confirm in the
  Twilio console.
- Nightly `backup.sh` cron on the VPS not yet installed.
- Root's crontab had the auto-update line duplicated; `crontab -l | sort -u | crontab -`
  cleans it.
- Not yet exercised with real contacts — first real offer still to come.
