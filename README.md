# Thally

**A thali you can tally.** Thally is a food and weight tracker that works on its own in your
browser, with no account, and syncs between your devices when you run its small server.
Your data stays in a folder (or a bucket) you control: no third-party account, no ads, no telemetry.

It follows the shape of [openGym](https://github.com/DuarteSantos8/openGym): a local-first web app,
plain files instead of a database, and one container to self-host.

## What it does

**Logging**

- A diary by meal (breakfast, lunch, snack, dinner) with calories, protein, carbs, fat and fibre
  running against your daily target.
- 5,956 foods to search: Indian raw foods from IFCT 2017 and cooked dishes with household portions
  (cup, piece, slice) from USDA FNDDS.
- Packaged foods by barcode, scanned with the camera or typed in, looked up on Open Food Facts.
  A product you find is saved so it works offline next time.
- Your own foods, and recipes built from ingredients with a per-serving portion.
- Water by the glass.

**Targets and progress**

- A profile (age, sex, height, weight, activity, goal) gives a daily calorie and macro target using
  the Mifflin-St Jeor formula. It never suggests fewer than 1,200 kcal.
- A weight log with a trend line and your goal weight. The target follows your latest weigh-in.

**Your data**

- Everything is stored in the browser and works offline once loaded. Installable to the home screen.
- Export everything as one JSON file, and import it back.
- Optional sync: sign in on each device and they stay in step, merging rather than overwriting.

**Optional AI** (off unless the server has an Anthropic key)

- **Photo logging:** take a picture of your plate and get draft entries with estimated grams.
  You correct and approve every item before it is saved.
- **Weekly review:** a short plain-language read of your last seven days against your targets.

## Quick start

You need [Node.js](https://nodejs.org) 22 or newer.

```bash
npm install
npm run dev
```

Open http://localhost:5173. That is the whole app, storing data in this browser only.

For sign-in, sync and AI during development, run the server next to it:

```bash
npm start
```

| Command | What it does |
|---|---|
| `npm run dev` | The app with hot reload on port 5173; `/api` is forwarded to port 3000 |
| `npm start` | The server on port 3000 (also serves `dist/` if you have built it) |
| `npm test` | Unit tests for `src/lib` and the server tests |
| `npm run build` | Production build into `dist/` |
| `npm run lint` | oxlint |
| `npm run android` | Build the Android debug APK |

## Self-hosting

### Docker

```bash
cp .env.example .env
docker compose up -d --build
```

Open http://localhost:3000 and create your account. Data lives in `./data-server`: `users.json`,
`sessions.json` and one `state/<username>.json` per person. Back up that folder and you have
backed up everything.

Put the server behind HTTPS (any reverse proxy) before using it over the internet. Session cookies
are marked `Secure` when the proxy sends `X-Forwarded-Proto: https`.

### Render free tier

Render's free web services have no persistent disk: everything written is gone after a deploy,
a restart, or the spin-down after 15 minutes idle. `server/mirror.js` keeps the data folder in an
S3-compatible bucket instead (Supabase Storage, Cloudflare R2 or Backblaze B2). It is the same
mirror as in the openGym fork this project borrows from.

On start the mirror downloads the bucket into the data folder, and refuses to start if it cannot
read it, so an empty server never overwrites your data. Then it runs the server unchanged, uploads
changed files every 2 seconds, and uploads anything pending on shutdown.

1. In Supabase, create a **private** bucket named `thally` and an S3 access key
   (Storage → S3 connection → New access key).
2. In `render.yaml`, check `MIRROR_ENDPOINT` and `MIRROR_REGION` match your Supabase project.
3. In Render: **New → Blueprint**, pick this repository, and enter `MIRROR_KEY_ID` and
   `MIRROR_SECRET` when asked (and `ANTHROPIC_API_KEY` if you want the AI features).
4. Open the service's address and create your account straight away: the first account is the
   only one that can sign up.

Limits of this setup:

- **Cold starts.** After 15 minutes idle the service sleeps; the next request takes about a minute.
- **A hard crash can lose the last ~2 seconds of writes.** A normal shutdown uploads everything
  first, and a device pushes its copy again on its next sync.
- **One instance per bucket, one app per bucket.** The mirror copies the whole bucket into the
  data folder, so do not point Thally at a bucket another app uses.
- **Supabase pauses free projects** after about a week without activity. While paused the service
  refuses to start; resume the project in the dashboard.

### Settings

| Variable | Default | What it does |
|---|---|---|
| `PORT` | `3000` | Port the server listens on |
| `DATA_DIR` | `./data-server` (`/data` in Docker) | Where accounts and state are stored |
| `SIGNUP` | unset | `open` lets anyone create an account. Otherwise only the first account can be created |
| `TRUST_PROXY` | unset | `1` when behind a reverse proxy, so sign-in rate limits use the visitor's address |
| `ANTHROPIC_API_KEY` | unset | Turns on photo logging and the weekly review |
| `AI_MODEL` | `claude-opus-5-5` | Model used for both AI features |
| `MIRROR_ENDPOINT` | unset | S3 endpoint. When set, the data folder is mirrored to a bucket |
| `MIRROR_BUCKET`, `MIRROR_KEY_ID`, `MIRROR_SECRET` | unset | Required with `MIRROR_ENDPOINT` |
| `MIRROR_REGION` | `auto` | Bucket region (`auto` suits R2; Supabase wants the project's region) |

## AI features

Set `ANTHROPIC_API_KEY` on the server. Signed-in users then see a **Photo** button on each meal
and a **Weekly review** card in the diary.

- The key stays on the server and never reaches the browser.
- Photos are shrunk in the browser, sent to Anthropic through your server, and not stored.
- The numbers are estimates from a model. Nothing is saved until you approve it.
- Each user is limited to 40 AI calls a day, because calls are billed to the key's owner.
- The weekly review is general guidance, not medical advice.

## Android

```bash
npm run android
```

Needs JDK 21 and the Android SDK. The APK appears under
`android/app/build/outputs/apk/debug/`. It is the standalone app: data stays on the phone and
there is no sync or AI, because those come from your server. For sync on a phone, open your
server's address in the browser and install it from the browser menu.

## How it is built

```
src/lib/       Pure logic, each piece unit-tested:
               targets, nutrition, search, state merge, week summary, barcode parsing
src/views/     One file per screen (Diary, Foods, Weight, Profile)
src/*.jsx      Shared dialogs: food picker, barcode scanner, photo log, account
src/store.js   All app data, persisted in the browser
src/sync.js    Pushes and pulls that data when signed in
server/        server.js  accounts, sessions, state, static files (node:http, no framework)
               ai.js      the two Anthropic calls
               mirror.js  data folder kept in an S3 bucket
scripts/       Build the food catalogue from the source datasets
android/       Capacitor shell
```

The server has two runtime dependencies (`@anthropic-ai/sdk` and `zod`, both for the AI features).
The frontend is React, Vite and Zustand.

### How sync works

The whole state is one JSON document with a revision number. A device sends its copy along with
the revision it last saw. If the server has moved on, it answers `409` with the current copy; the
device merges and tries again. The merge (`src/lib/state.js`) unions diary entries and foods by
id, keeps deletions deleted on both sides, and for a single value such as one day's weight lets
the device making the change win.

### Security

- Passwords are hashed with scrypt and a per-user salt; comparisons are constant-time.
- Sessions are `HttpOnly`, `SameSite=Strict` cookies. Only a hash of each session token is stored.
- Sign-in and sign-up are rate limited (10 attempts per 15 minutes per address).
- State-changing requests must be JSON, which blocks cross-site form posts.
- Sign-up is closed after the first account unless you open it.

## Food data

`src/foods-data.json` is generated. Do not edit it by hand.

| Source | What | Notes |
|---|---|---|
| IFCT 2017 (National Institute of Nutrition, Hyderabad) | 525 Indian raw foods, from Table 1 | Copyright NIN/ICMR. Fine for personal use; check their terms before publishing or distributing this app. Carbohydrate excludes fibre. No household portions. |
| USDA FNDDS 2021-2023 | 5,431 foods as eaten, with portions | Public domain. Carbohydrate includes fibre. |
| Open Food Facts | Packaged foods, looked up live by barcode | Open Database Licence. Crowd-sourced, so check the numbers. |

To rebuild the catalogue (Python 3 with `pymupdf`):

```bash
python scripts/extract_ifct.py path/to/IFCT2017.pdf > data/ifct.json
python scripts/build_foods.py path/to/FoodData_Central_survey_food_csv_2024-10-31
```

The FNDDS folder is the unzipped "Survey Foods (FNDDS)" CSV download from
https://fdc.nal.usda.gov/download-datasets. The IFCT extractor reads the table by word position
and checks every row against the book's own energy formula; rows that fail are dropped and
reported (3 of 528: N001, P080, S005).

## Known limits

- No iPhone app, no Apple Health or Health Connect, no meal reminders.
- Sign-in is username and password; there are no passkeys and no password reset.
- Camera barcode scanning needs a browser with `BarcodeDetector` (Chrome on Android; not Safari).
  Typing the number works everywhere.
- Metric units only.
- Recipes use raw ingredient weights; water lost or gained in cooking is not modelled.

## Credits

Architecture and the Render deployment follow [openGym](https://github.com/DuarteSantos8/openGym)
by Duarte Santos. Food data comes from the sources listed above.

## Licence

No licence has been chosen yet, so all rights are reserved. Note that the bundled IFCT 2017 data
has its own copyright (see Food data).
