# Thally

**A thali you can tally.** Thally is a food and weight tracker that works on its own in your
browser, with no account, and becomes a shared, synced app when you run its small server.
Your data stays in a folder (or a bucket) you control: no third-party account, no ads, no telemetry.

It follows [openGym](https://github.com/DuarteSantos8/openGym): a local-first web app, plain files
instead of a database, one container to self-host, and the same set of account, admin and
integration features.

## What it does

**Logging**

- A diary by meal (breakfast, lunch, snack, dinner) against your daily calorie and macro targets.
  Tap any entry to see its full nutrition, change the amount or move it to another meal.
- 5,956 foods to search: Indian raw foods from IFCT 2017 and cooked dishes with household portions
  (cup, piece, slice) from USDA FNDDS.
- **Nutrition facts for every food you pick**: energy, protein, carbohydrate and sugars, fat and
  saturated fat, fibre and sodium, for the amount you chose and per 100 g, with the share of
  energy from protein, carbs and fat and where the numbers come from.
- Packaged foods by barcode, scanned with the camera or typed in, looked up on Open Food Facts.
- **Dishes:** join ingredients into a dish (your rajma chawal, your mum’s dal), with servings and,
  if you weigh the pot, the cooked weight. Dishes are saved to your account, show up first in every
  search, and can be opened and changed later. A whole logged meal can be saved as a dish too.
- Your own foods from a label, water by the glass, and a breakdown of every nutrient for the day.

**Targets and progress**

- Daily targets from your profile (Mifflin-St Jeor). Never fewer than 1,200 kcal.
- A weight log with a trend line and your goal weight.

**On your own AI provider** (optional)

- **Tell Thally what you ate:** say it (the browser’s dictation) or type it, like “two rotis, a
  katori of dal and a chai”. An agent searches your own foods and the catalogue, estimates grams,
  and when a home-made dish isn’t in your list it drafts one from ingredients. You review every
  entry and every new dish, change grams or meals, untick anything, and only then is it logged and
  saved.
- **Photo logging:** photograph your plate and get draft entries with estimated grams to correct.
- **Weekly review:** a short read of your last seven days against your targets.
- Every model call uses the provider **you** connect in Settings → AI: Anthropic (Claude), OpenAI,
  Google Gemini, or any OpenAI-compatible endpoint (Ollama, LM Studio, vLLM, OpenRouter). You
  bring the key and you are billed for your own use; the server owner pays for nobody’s AI.

**Accounts, sharing and admin** (with the server, as in openGym)

- Sign in with a password or a **passkey**, by name or a sign-in e-mail. Add another device with a
  one-time code instead of typing your password there.
- The first account owns the server. Others join with an **invite code** (or sign-up can be open
  or closed). Admins get a dashboard: people, switching accounts off, one-time password reset
  codes, admin roles, handing over ownership, deleting accounts, invite codes, and an
  **activity log** of sign-ins, failures and admin actions.
- **Settings:** profile and targets, modules, units (kcal/kJ, kg/lb, cm/inches), look (theme and
  accent), reminders, AI, integrations, data and backup, account, about.
- **Modules:** switch whole parts of the app off (water, weight, barcode lookup, AI, reminders,
  webhooks), with “Just logging” and “Everything” presets. Nothing is deleted.
- **Meal reminders** by notification, in your time zone, skipped when that meal is already logged.
- **Webhooks** to Home Assistant, n8n, Node-RED or ntfy when you log food, weigh in or save a
  dish: signed with HMAC-SHA256, retried with backoff, with a delivery log, test and retry.
- **Data:** JSON backup and restore, diary and weight as spreadsheets (CSV), reset everything.
- Sync between devices that merges rather than overwrites.

## Run it

You need [Node.js](https://nodejs.org) 22 or newer.

```bash
npm install
npm run dev      # the app on :5173 with hot reload, data in this browser only
```

For accounts, sync, AI and the rest, run the server next to it (`/api` is forwarded to it):

```bash
npm start        # the server on :3000; it also serves the built app from dist/
```

| Command | What it does |
|---|---|
| `npm run dev` | The app with hot reload on port 5173 |
| `npm start` | The server on port 3000 (also serves `dist/` once built) |
| `npm run build` | Production build into `dist/` (offline support and reminders need this build) |
| `npm test` | Unit tests for `src/lib` and the server tests |
| `npm run lint` | oxlint |
| `npm run android` | Android debug APK (see Android below) |

For passkeys during development, set `ORIGIN` to the address in your browser, e.g.
`ORIGIN=http://localhost:5173 npm start`.

## Self-hosting

### Docker

```bash
cp .env.example .env    # optional settings, explained below
docker compose up -d --build
```

Open http://localhost:3000 and create the first account: it owns the server. Put it behind HTTPS
(any reverse proxy) before using it over the internet, set `ORIGIN` to the address people type,
and `TRUST_PROXY=1` so sign-in limits see each visitor’s own address.

Everything lives in `./data-server`, so backing up that folder backs up the server:

| File | What |
|---|---|
| `db.json` | Accounts (password hashes, passkeys’ public keys), invite codes, pending reset codes |
| `sessions.json` | Sign-in sessions, stored as hashes of their tokens |
| `state/<id>.json` | Each person’s synced data |
| `ai/<id>.json` | Each person’s AI settings; keys encrypted with `secret` |
| `hooks/<id>.json` | Webhooks (URL and signing secret encrypted) and their delivery log |
| `push/<id>.json`, `vapid.json` | Reminder subscriptions and the server’s push keys |
| `audit.log` | The activity log, one JSON object per line |
| `secret` | The key that encrypts stored API keys and webhook secrets. Lose it and those must be entered again |

### Render free tier

Render’s free web services have no persistent disk. `server/mirror.js` (from the openGym fork)
keeps the data folder in an S3-compatible bucket instead (Supabase Storage, Cloudflare R2 or
Backblaze B2): it downloads the bucket on start, refuses to start if it can’t read it, uploads
changes every 2 seconds, and uploads anything pending on shutdown.

1. In Supabase, make sure the **private** `default` bucket exists (the one openGym uses) and you
   have an S3 access key (Storage → S3 connection → New access key).
2. Check `MIRROR_ENDPOINT` and `MIRROR_REGION` in `render.yaml` match your project. Thally keeps
   its files under `thally/` in that bucket (`MIRROR_PREFIX`), so it never touches openGym’s.
3. In Render: **New → Blueprint**, pick this repository, and enter `MIRROR_KEY_ID` and
   `MIRROR_SECRET` when asked. Leave `ORIGIN` empty for now.
4. Open the service’s address and create your account straight away (the first account owns it).
5. Set `ORIGIN` to that address (e.g. `https://thally-abcd.onrender.com`) to turn passkeys on.

Limits: a cold start of about a minute after 15 idle minutes; a hard crash can lose the last ~2
seconds of writes; one instance per bucket folder. openGym’s own mirror copies the whole bucket
into its data folder on start, `thally/` included, so whoever can read openGym’s server can read
Thally’s files too (API keys and webhook secrets in them stay encrypted with Thally’s `secret`,
which is also in that folder);
Supabase pauses free projects after about a week without activity. Reminders are only sent while
the service is awake, so on a free plan that sleeps they are unreliable.

### Settings

| Variable | Default | What it does |
|---|---|---|
| `PORT` | `3000` | Port the server listens on |
| `DATA_DIR` | `./data-server` (`/data` in Docker) | Where everything is stored |
| `ORIGIN` | unset | The exact address people use, e.g. `https://thally.example.com`. Turns passkeys on and marks cookies `Secure` |
| `SIGNUP` | `invite` | Who may create an account after the first: `invite` (a code from an admin), `open` (anyone), `closed` (nobody) |
| `ALLOW_GUEST` | `1` | `0` removes “Use without an account”, so the server’s app is for signed-in people only |
| `ADMIN_UIDS` | unset | Comma-separated account IDs that are always admins (Settings → Account → Account ID) |
| `TRUST_PROXY` | unset | `1` behind a reverse proxy that overwrites `X-Forwarded-For` |
| `ALLOW_LAN` | unset | `1` lets everyone’s AI endpoints and webhooks reach home-network addresses. Admins always may, and may also use this machine (Ollama on localhost) |
| `AI_DAILY_LIMIT` | `40` | AI requests per person per day |
| `AUDIT_LOG` | `1` | `0` turns the activity log off |
| `AUDIT_MAX`, `AUDIT_DAYS` | `5000`, `90` | How much of the activity log is kept |
| `AUDIT_IP` | unset | `net` records the network part of addresses (`203.0.113.0/24`), `full` the whole address |
| `PUSH_CONTACT` | unset | An e-mail push services can contact about this server’s notifications |
| `MIRROR_ENDPOINT` | unset | S3 endpoint; when set, the data folder is mirrored to a bucket |
| `MIRROR_BUCKET`, `MIRROR_KEY_ID`, `MIRROR_SECRET` | unset | Required with `MIRROR_ENDPOINT` |
| `MIRROR_REGION` | `auto` | Bucket region (`auto` suits R2; Supabase wants the project’s region) |
| `MIRROR_PREFIX` | unset | A folder in the bucket for Thally’s files (e.g. `thally/`), needed when the bucket is shared with another app |

## AI on your own provider

Each person connects their own provider in **Settings → AI**: pick it, paste an API key (optional
for a local endpoint), use **List models** to pick a model, tick the box confirming what is sent,
**Save** and **Test the connection**.

- Keys are encrypted with the server’s `secret` (AES-256-GCM, bound to the account and provider),
  never returned to the browser, and never part of the synced data or a backup export.
- What goes to the provider, only when you use a feature: what you say or type to log a meal, with
  the names and nutrients of your foods and dishes it searches; the meal photo (shrunk in the
  browser); for a weekly review, your daily totals, targets and weight change for those seven days.
  Dictation is the browser’s own: Chrome sends the audio to Google to turn it into text.
- The meal agent has two tools, searching foods and proposing the meal. It can’t write anything:
  the server checks every food it names against the real catalogue and your list, works out new
  dishes’ nutrients itself, and the app saves only what you confirm.
- After an update that sends a new kind of data, the consent box must be ticked again.
- Anthropic is called through the official SDK (default model `claude-opus-5-5`, with automatic
  fallback to another model if the first declines a review). OpenAI, Gemini and compatible
  endpoints are called over HTTPS with the key in a header, never in the URL.
- A compatible endpoint may only be on the server’s own network for admins (or for everyone with
  `ALLOW_LAN=1`); cloud metadata addresses are never reachable.
- Answers are estimates and drafts you correct. Not medical advice.

## Webhooks

Settings → Integrations → Add a webhook. Events: `food.logged` (new diary entries, with the day’s
totals), `weighin.logged`, `dish.saved`. Each delivery is a `POST` of
`{ version, id, type, createdAt, data }` with these headers:

- `X-Thally-Event`, `X-Thally-Delivery` (the same id on every retry of one delivery)
- `X-Thally-Signature: t=<unix seconds>,v1=<hex>`: HMAC-SHA256 of `<t>.<raw body>` with the
  webhook’s secret, shown once when you add it

```js
import crypto from 'node:crypto'
function verify(secret, rawBody, header) {
  const m = /^t=(\d+),v1=([0-9a-f]{64})$/.exec(header || '')
  if (!m || Math.abs(Date.now() / 1000 - Number(m[1])) > 300) return false
  const want = crypto.createHmac('sha256', secret).update(`${m[1]}.${rawBody}`).digest()
  const got = Buffer.from(m[2], 'hex')
  return got.length === want.length && crypto.timingSafeEqual(got, want)
}
```

Answer `2xx` within 10 seconds. Timeouts, connection errors, `408`, `425`, `429` and `5xx` are
retried after about 30 s, then 1, 2, 4, 8, 16 and 32 minutes (`Retry-After` is honoured); `410`
pauses the webhook. Only events from the last 7 days are sent, so restoring a backup doesn’t replay
history. Pending retries are kept in memory, so a restart drops them.

## Download page and Android app

The server serves a download page at **`/welcome`** (`website/index.html`) and the Android app at
**`/download/thally.apk`**, so anyone can install it even though the repository is private. The
sign-in screen and Settings → About link to the page.

A release:

```bash
npm run apk                       # signed release build (needs android/keystore.properties)
node scripts/release-apk.mjs      # copies it to releases/thally.apk, writes size and SHA-256
gh release create v0.3.0 releases/thally.apk --title "Thally 0.3.0"
```

Bump `versionCode` and `versionName` in `android/app/build.gradle` first. The APK is signed with a
key kept outside the repository (`android/keystore.properties`, git-ignored, says where). **Back
that key up**: Android only installs an update signed with the same key, so losing it means
everyone has to uninstall and reinstall.

## Android

```bash
npm run android                   # debug build
```

Needs JDK 21 and the Android SDK; the APK appears under `android/app/build/outputs/apk/debug/`.
It is the standalone app: data stays on the phone, with no sync, AI or reminders, because those
come from your server. For those on a phone, open your server’s address in the browser and install
it from the browser menu. On some Windows networks Java can’t download over IPv6; set
`JAVA_OPTS` and `GRADLE_OPTS` to `-Djava.net.preferIPv4Stack=true` first.

## How it is built

```
src/lib/       Pure logic, each piece unit-tested: targets, nutrition, dishes, search, units,
               settings, state merge, week summary, CSV, barcode parsing
src/views/     The four tabs: Diary, Foods, Weight, Settings
src/settings/  The settings pages (account, admin, AI, reminders, integrations, data, basics)
src/*.jsx      Shared dialogs: food picker and detail, nutrition panel, dish builder, sign-in
src/store.js   All app data, persisted in the browser; src/sync.js pushes and pulls it
server/        server.js (routes), accounts.js, passkeys.js, ai.js, hooks.js, push.js, audit.js,
               secure.js (encryption, signatures, outbound address rules), mirror.js
scripts/       Build the food catalogue from the source datasets
android/       Capacitor shell
```

### How sync works

The whole state is one JSON document with a revision number. A device sends its copy with the
revision it last saw. If the server has moved on, it answers `409` with the current copy; the device
merges and tries again. The merge (`src/lib/state.js`) unions diary entries and foods by id, keeps
deletions deleted on both sides, and for a single value (one day’s weight, a settings section) lets
the device making the change win. “Reset everything” replaces instead of merging.

### Security

- Passwords: scrypt with a per-account salt, compared in constant time; 10 to 256 characters, and
  the most-guessed ones refused. Wrong passwords pause the account (5 free, then 1 minute doubling
  to an hour) and the address (20 sign-in attempts per 15 minutes).
- Passkeys: WebAuthn, bound to `ORIGIN`; only public keys are stored.
- Sessions: `HttpOnly`, `SameSite=Strict` cookies for 30 days; stored as hashes; a new password signs
  out every other device.
- Changing the password or e-mail, adding or removing a passkey, making a device code, handing over
  ownership and deleting the account all need the password or a passkey, not just a session.
- Admins can’t act on the owner or on other admins (only the owner can), and can’t reset an admin’s
  password. Reset and invite codes are stored as hashes and work once.
- Requests that change anything must be JSON, which blocks cross-site form posts.
- Outbound requests (AI endpoints, webhooks, push) refuse private and metadata addresses at connect
  time as well as when saved, so DNS tricks don’t get around it.

## Food data

`src/foods-data.json` is generated. Do not edit it by hand.

| Source | What | Notes |
|---|---|---|
| IFCT 2017 (National Institute of Nutrition, Hyderabad) | 525 Indian raw foods, from Table 1 | Copyright NIN/ICMR. Fine for personal use; check their terms before publishing or distributing this app. Carbohydrate excludes fibre. No sugars, saturated fat or sodium, and no household portions. |
| USDA FNDDS 2021-2023 | 5,431 foods as eaten, with portions | Public domain. Carbohydrate includes fibre. |
| Open Food Facts | Packaged foods, looked up live by barcode | Open Database Licence. Crowd-sourced, so check the numbers. |

To rebuild the catalogue (Python 3 with `pymupdf`):

```bash
python scripts/extract_ifct.py path/to/IFCT2017.pdf > data/ifct.json
python scripts/build_foods.py path/to/FoodData_Central_survey_food_csv_2024-10-31
```

The FNDDS folder is the unzipped “Survey Foods (FNDDS)” CSV download from
https://fdc.nal.usda.gov/download-datasets. The IFCT extractor reads the table by word position
and checks every row against the book’s own energy formula; rows that fail are dropped and
reported (3 of 528: N001, P080, S005).

## Not built (yet)

From openGym, these were left out as they don’t fit a food tracker or need native work:

- Translations (openGym has 20 languages; Thally is English only)
- iPhone app, Apple Watch and Wear OS apps, Apple Health and Health Connect
- Importing from other apps (MyFitnessPal, Cronometer); progress photos; the MCP server

## Credits

Accounts, admin, modules, integrations and the Render deployment follow
[openGym](https://github.com/DuarteSantos8/openGym) by Duarte Santos. Food data comes from the
sources above.

## Licence

No licence has been chosen yet, so all rights are reserved. The bundled IFCT 2017 data has its own
copyright (see Food data).
