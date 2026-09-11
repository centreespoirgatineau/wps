# wps — food-surplus SMS reservation platform

When Centre Espoir de Gatineau receives food that must go out the same day, an
administrator photographs it, describes one lot, enters the number of lots and
presses *Send*. Every active contact receives a personal SMS link; they reserve a
lot (after accepting the rules), see who holds the others and coordinate in a
per-offer chat. Offers close at 23:59 (America/Toronto). Fairness rules — a
15-minute cooldown on the next offer for anyone who reserved, and a full block on
the next offer for no-shows — are enforced automatically.

French by default, English on a toggle. Mobile first. No brand.

## Stack

Node.js 22 with **zero npm dependencies**: `node:http`, `node:sqlite`, `fetch`
(Twilio REST), Server-Sent Events for live updates, EJS-style templates compiled
in-house, photos resized in the browser before upload. One Docker container, one
`data/` folder (SQLite database + photos).

```
src/
  server.js            wiring, middleware, error handling
  config.js            environment → config
  lib/http.js          tiny router / body / cookies / static
  lib/view.js          template engine
  lib/db.js            schema (SQLite, WAL)
  lib/rules.js         the fairness rules (publish, reserve, cooldown, no-show, expiry)
  lib/auth.js          sessions, SMS login codes, CSRF, rate limits, personal links
  lib/sms.js           Twilio Messages API + webhook signature check
  lib/sse.js           live channel per offer
  lib/scheduler.js     end-of-day expiry
  lib/time.js          America/Toronto helpers
  routes/              public (login, about, join) · contact (offers, chat, profile) · admin · twilio webhooks
  views/               templates (layout, pages, partials, admin/)
  public/              app.css, app.js, icon.svg
  locales/             fr.js, en.js
scripts/make-admin.js  create the first administrator
test/                  rules engine unit tests + end-to-end HTTP flow
```

## Run locally

```bash
cp .env.example .env            # set APP_URL=http://localhost:8080, SMS_DRY_RUN=1
npm start                       # http://localhost:8080
npm run admin -- "(819) 555-1234" David Hatin "Centre Espoir"   # first admin
npm test
```

With `SMS_DRY_RUN=1` (or no Twilio credentials) texts are logged instead of
sent, and login codes are shown on the login page in development mode.

## Deploy

See **DEPLOYMENT_GUIDE.md**. Short version, on the VPS:

```bash
curl -fsSL https://raw.githubusercontent.com/centreespoirgatineau/wps/main/install.sh | sudo bash
```

## Rules engine (summary)

| Event | Effect |
|---|---|
| Offer published | Lots created; every *pending* penalty becomes *active* on this offer |
| Contact reserves | Lot taken atomically (first writer wins); contact gets a *pending* cooldown |
| Admin marks no-show | Holder gets a *pending* no-show penalty |
| Offer ends (23:59 or closed) | Penalties targeting it are cleared; chat read-only |
| Next offer, cooldown active | Contact may reserve only 15 min after publication |
| Next offer, no-show active | Contact may not reserve at all |

## Security notes

Personal links carry a per-contact token (regenerable by an admin). Login codes
are hashed, rate-limited, single-use, 10-minute. Admin pages require the admin
role and a code-verified session younger than 12 hours. CSRF tokens on every
write. Strict CSP, `noindex`, private photos behind authentication. Secrets only
in `.env`.
