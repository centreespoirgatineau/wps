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
the About page and in rule 1 of the platform rules; keep it intact.

**There are two platforms, one codebase.** `BRAND=jc` is the church network
described above, at jc.centreespoir.ca. `BRAND=spp` is the *Système de
Prévention de Pertes* at spp.centreespoir.ca: the same offers, the same rules,
the same code, for the food banks and community organisations of the region —
with **no religious wording of any kind** and an invitation to donate. Each
instance is its own container and its own database; only a handful of strings
differ. See §2.

- **Owner / only admin today:** David Hatin, Directeur général (+1 819 208 5721).
- **Live:** https://jc.centreespoir.ca and https://spp.centreespoir.ca
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
- **French by default, always.** The browser's `Accept-Language` is deliberately
  ignored: an English phone must still land on the French interface, and English
  is a choice the visitor makes with the EN toggle (then remembered on the
  contact and in a cookie). Covered by a test.
- **Phone numbers are admin-only.** A contact never sees another contact's
  number: no number, no `tel:`/`sms:` link on the lots list. Admins still see
  them everywhere, and a contact still sees their own on `/reglages`. Contacts
  coordinate through the per-offer chat instead.
- **Static assets are content-hashed** (`app.css?v=<hash>` computed at boot in
  `src/server.js`, over the CSS, the JS and the mark); HTML is
  `Cache-Control: no-store`. This exists because a stale cached stylesheet once
  broke the live layout. Keep it.
- **The slideshow scrolls; it is not a fixed canvas.** Every slide fills the
  screen (`min-height:100dvh`) inside one scroll container with
  `scroll-snap-type:y mandatory`, so a thumb-flick, a mouse wheel and the arrow
  keys all move one slide. The type is fluid (`clamp()` bounded by both vw and
  vh). Scrolling is the only navigation: there are no progress dots and nothing
  is pinned to the bottom of the screen. Three things are easy to get wrong
  again: the phone mock-up iframes need `pointer-events:none` or a scroll
  starting on one dies; the phone sizing must measure **one screen**
  (`deck.clientHeight`), never the slide — a slide that has grown past the fold
  would otherwise report the room it took and the phone would grow to match; and
  in the two-column layout the right-hand column is sized by its content, so
  anything put there without a width of its own takes the whole slide and leaves
  the heading beside it one word per line (hence the `max-width:44vw` cap). The
  first two are covered by a test.
- **There is one slideshow and one preview card per audience**, and the church
  ones must never reach the food banks. `presentation/build/build-deck.mjs` is
  the shell — layout, type scale, scrolling, phone mock-ups — and the wording
  lives in `slides.jc.mjs` / `slides.spp.mjs`; `make-og.mjs` and
  `seed-demo.mjs` both take the brand too, so the demonstration cast in the
  mock-ups is churches or community organisations to match. A brand with no
  deck has **no `/presentation` at all** and its "Qu'est-ce que cette
  plateforme ?" link points at the About page instead (`deckUrl`). When
  changing the shell, rebuild the church deck and check `git diff` is empty —
  that is how the split was proven safe in the first place.
- **A brand is a thin overlay of strings, never a fork.** `BRAND` in the
  environment selects one: `src/locales/spp.fr.js` and `spp.en.js` override
  only the keys that differ, and everything else falls through to `fr.js` /
  `en.js`, so a wording fix is made once for both platforms. Never copy a
  dictionary. `test/brand.test.js` fails if an overlay key matches nothing in
  the reference, if a reference string naming Jesus, the gospel, churches,
  ministries or pastors is *not* overridden for spp, or if the reference itself
  ever stops saying why the church platform exists.
- **A published offer can still be corrected, but not resized.** `/modifier`
  accepts a draft or a *running* offer (`editable()` in `src/routes/admin.js`);
  an offer that has ended is left alone. `lot_count` is frozen once published —
  the field is disabled in the form *and* overwritten server-side from the
  stored offer, because contacts are already holding lots and shrinking the
  count would pull one out from under them. Every other field is editable, and
  the change is announced in that offer's own chat naming what moved
  (`changedFields` → `announceEdit`), posted as the administrator who made it,
  in French: a stored message has no locale to switch on. No SMS is resent —
  David's call, texting thirty organisations over a typo is worse than the typo.
- **The donation ask is a setting, and it is quiet.** `donate_url` (Admin →
  Réglages) must be an https address or empty; empty means the platform never
  mentions money anywhere, which is how the jc instance runs. When set, it
  appears in exactly two places: a small grey text link in the header (contacts
  and visitors, never the admin, never the login page) and one explained section
  on the About page. **It must never touch the reservation path** — a donation
  that appeared to buy priority would break the fairness rules, and these
  organisations are as stretched as the Centre. Validation lives in
  `src/lib/site.js` beside the public address, because that href is shown to the
  whole list.
- **`/presentation` is the one page with its own CSP.** The slideshow is a single
  self-contained file with an inline `<script>`, which the site-wide policy
  forbids; the route allows that exact script by SHA-256 hash rather than by
  `'unsafe-inline'`. The file is read once at boot, so a rebuilt deck only goes
  live on the next deploy. Covered by a test.
- **The mark is one square vector**, `src/public/mark.svg` (a lighthouse in
  white on a terracotta disc, 3.5 KB, already in the app's accent colour). The
  same file is the in-page mark and the browser-tab icon, and it is inlined as a
  data URI into the slideshow. No PNG copies, no build step — an earlier
  cornucopia logo needed both, and that tooling is gone.
- **The official logo lives in `brand/logo/`, and nowhere else.** David drew it
  in Adobe Illustrator; `Edit.ai` is the master, and every anniversary poster,
  letterhead, email signature or site asset starts from those files. Source
  them from there — never regenerate a logo, and never hand out anything from
  `brand/propositions/`, which is what I had generated *before* the official one
  existed and is kept only as a record. `brand/build/` composes those proposals
  from `brand/fonts/`; it never reads `brand/logo/`. Three warnings, all in
  `brand/README.md`: five files hold only three drawings (`Icon-01`/`Icon-02`
  are the two lockups renamed, only `Icon-03` is the symbol); the text is
  already outlined; and each SVG carries Illustrator's private `i:pgf` copy of
  the document, which is why thirty paths weigh 320 KB — fine for a printer,
  twenty times too heavy for a web page, so re-export before using one online.
  The master's terracotta is **`#DA7757`**; `--accent` in `src/public/app.css`
  is still `#D97757`, one digit off, and has been since before the logo existed.
- **The link preview is the one raster image**, `src/public/og.png` (1200x630),
  because no messenger renders an SVG in a preview card. It is generated from
  the mark and a few lines of copy by `presentation/build/make-og.mjs` and
  committed; rerun it when the mark or the wording changes. The pages reference
  it with an absolute URL built from `publicUrl()`, and the slideshow carries
  `__ORIGIN__` (a full URL) and `__HOST__` (just the domain, for the address a
  church reads off a slide) placeholders that the `/presentation` route fills in
  — so changing the address in Réglages is still enough. Covered by a test.
  The card is drawn by **Chrome**, headless: Edge's `--headless=new` stopped
  writing the file at some point in 2026 and now exits 0 having done nothing, so
  `make-og.mjs` tries each browser it finds and checks the PNG actually exists.

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
src/routes/public.js   login, personal links, about, join requests, /presentation
src/routes/contact.js  offers, reservations, chat, personal settings, private media
src/routes/admin.js    offers, lots, contacts, requests, SMS log, settings
src/routes/twilio.js   delivery-status and inbound (STOP/START) webhooks
src/views/             templates; `_name.html` are partials, `admin/` is admin-only
src/public/            app.css, app.js, mark.svg  (no build step)
src/locales/fr.js en.js  every user-visible string; FR is the reference
src/locales/spp.fr.js en.js  the food-bank brand: only the strings that differ
scripts/make-admin.js  create/promote an administrator from the CLI
presentation/          the slideshow for churches, served at /presentation (see its README)
brand/logo/            THE OFFICIAL LOGO — David's Illustrator masters. Source every logo here
brand/fonts/ build/ propositions/   the typefaces, the generators, and superseded proposals
test/rules.test.js     rules engine, in-memory DB, no server
test/flow.test.js      end-to-end HTTP against a real server process, SMS in dry-run
test/brand.test.js     the brand overlays and the donation link, dictionaries only
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
| 3rd no-show | Absences add up across offers; at `STRIKE_LIMIT` (3) the contact's status becomes `removed` automatically. Undoing that no-show brings them straight back |

Notes that have already caught me out:

- **An administrator reserves as a manual override.** `canReserve()` waives the
  cooldown and the per-contact maximum for `role = 'admin'`, and `reserveLot()`
  gives them no cooldown either — one could never apply, and it would clutter
  the offer's penalties list. That is *all* it waives: a closed offer, a contact
  who has left the list, the demonstration account and a lot already taken are
  refused for an administrator exactly as for anyone else. The lot then shows as
  held by the administrator's own organisation, which is what a contact sees on
  the page. It is never silent: the lots list carries a banner
  (`offer.admin.override`) saying the limits are not being applied to whoever is
  reading. Three tests in `rules.test.js` and one in `flow.test.js` check both
  halves — that it works, and that an ordinary contact is still stopped.
- **A reservation cannot be undone by the contact who made it.** There is no
  cancel button, no route, and no rules function — reserving is a commitment, and
  a lot handed back late is a lot nobody else planned for. The escape hatch for a
  misclick is an admin freeing the lot (admin → the lot → *Libérer*), which also
  clears any pending no-show on it. The cooldown earned by reserving still stays.
- Cooldowns do not stack: one pending cooldown per contact, however many lots.
- `effectiveStatus()` computes expiry lazily, so an offer is correctly "expired"
  even if the 30 s scheduler has not run yet. Always go through it.
- Pick-ups are **not** tracked (David's decision): the only post-offer action is
  marking a no-show, and only once the offer has ended.
- **Absences are counted from the lots themselves** (`status = 'no_show'`), not
  from a separate counter, so undoing a no-show undoes the strike. An admin is
  never auto-removed — that could lock the only administrator out. Reinstating a
  contact stamps `strikes_reset_at`, which stops earlier absences from counting
  without rewriting what happened.
- **Deleting an offer erases it for good** (admin → an ended offer → Supprimer):
  lots, messages and photo rows go by cascade; penalties, the SMS log rows and
  the photo files on disk are removed explicitly in the route, and every former
  holder is re-checked against the absence limit. A running offer must be closed
  first.

## 5. Roles and what each sees

- **Visitor** — login by phone (6-digit SMS code), About page, join request form.
- **Contact (`role=user`)** — offers, reservations, chat, `/reglages` (language,
  sign out, leave the list). **Never sees admin navigation.** The header shows the
  icon and a gear, nothing else.
- **Admin (`role=admin`)** — everything, plus the tabs row. **The admin works
  from the contact offer page**, `/offres/:id`, not from a page of their own:
  they read exactly what the contacts read, chat with them there, and reserve
  there (as an override, see §4). The admin card in a list opens that page for
  every offer except a draft, which has no contact page until it is published.
  One strip on it (`.admin-bar`) carries *Modifier* and a link to
  `/admin/offres/:id`, which remains the management page — freeing a lot,
  marking an absence, the SMS delivery log, deleting an ended offer. Admin pages require a
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
- **DNS:** Cloudflare holds centreespoir.ca; A record `jc` → 72.60.112.197,
  **proxy off (grey cloud)** — the Traefik TLS-ALPN challenge cannot issue a
  certificate through Cloudflare's proxy. The root and `www` serve the main
  Wix site and a `*` wildcard exists; the explicit `jc` record wins over it.
  Never touch the root, `www`, or the wildcard.
- **Changing the address no longer needs the terminal.** The public address is a
  setting (Admin → Réglages → *Adresse du site*, stored in `settings.public_url`),
  read at boot by `src/lib/site.js` and falling back to `APP_URL`. Every personal
  link and the Twilio status callback are built from `publicUrl()` — never from
  `config.appUrl` directly. Cookie security deliberately still follows the
  environment's `APP_URL`, so a typo in the setting cannot sign everyone out.
- **`update.sh` syncs the reverse-proxy file** from
  `deploy/docker-compose.override.traefik.yml` on every deploy, so routing and
  domain changes ship by pushing to `main`. Editing
  `/opt/wps/docker-compose.override.yml` by hand no longer sticks — change the
  file in the repository instead (or set `WPS_NO_OVERRIDE_SYNC=1`).
- **Auto-deploy:** `autoupdate.sh` runs every 2 minutes from root's crontab; it
  fetches `origin/main`, and if it differs, hard-resets and runs `update.sh`. Log:
  `/var/log/wps-autoupdate.log`. **So: push to main = live within 2 minutes.**
  Say so when you push, and check the log if in doubt.
- **Secrets** live only in `/opt/wps/.env` (chmod 600, git-ignored): Twilio SID,
  token, sending number (a Canadian local number — no A2P 10DLC needed for
  Canadian recipients), `APP_SECRET`. Never print or commit them.
- **Data** is `/opt/wps/data/` for the church platform and `/opt/wps/data-spp/`
  for the food-bank one (SQLite + uploads), separate databases that share
  nothing. `backup.sh` snapshots both, keeping 14 of each; it skips the second
  when that container is not running.

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
- **Verify before claiming.** Run `npm test` (36 tests), and for UI changes take
  real screenshots with Playwright. Two bugs reached him because I asserted instead
  of checking: a stale CSS cache, and test accounts still being texted.
- **Ask rather than guess** on product decisions; he answers quickly and precisely.

## 8. Running it locally

```bash
cp .env.example .env         # APP_URL=http://localhost:8080, SMS_DRY_RUN=1
npm start                    # no install step — zero dependencies
npm run admin -- "(819) 555-0001" David Hatin "Centre Espoir"
npm test                     # 36 tests: rules, HTTP end-to-end, brand overlays
```

With `SMS_DRY_RUN=1` (or no Twilio credentials) texts are logged rather than sent,
and in `NODE_ENV=development` the login code is displayed on the login page — that
is how the automated tests sign in.

## 9. Open items

- Twilio inbound webhook (`/twilio/inbound`, for STOP/START) to confirm in the
  Twilio console. **Both platforms text from the same number, and a number has
  only one inbound webhook**, so STOP/START can only keep one of the two contact
  lists in sync. Twilio still blocks the texts either way; the other list would
  just keep showing the contact as active and its sends would fail with 21610.
  A second sending number for spp is the clean fix.
- Nightly `backup.sh` cron on the VPS not yet installed.
- Root's crontab had the auto-update line duplicated; `crontab -l | sort -u | crontab -`
  cleans it.
- Not yet exercised with real contacts — first real offer still to come.
