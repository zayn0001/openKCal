# Thali

A food and weight tracker that works offline on its own, and syncs between devices when you
run its small server. No third-party account, no telemetry.

- Diary by meal with calories, protein, carbs, fat and fibre against a target from your profile
- 5,956 foods (Indian raw foods from IFCT 2017, cooked dishes with portions from USDA FNDDS)
- Packaged foods by barcode (camera or typed number) through Open Food Facts
- Your own foods and recipes, weight log with a goal line, water, JSON export and import
- Optional: sign in to sync devices; photo-to-meal logging and a weekly review with your own Anthropic key

## Run it

```bash
npm install
npm run dev      # app on :5173 with hot reload
npm start        # sync server on :3000 (run alongside dev for sign-in and AI)
npm test         # unit tests (src/lib) and server tests
```

### Self-host with Docker

```bash
cp .env.example .env    # optional settings
docker compose up -d --build
```

Open http://localhost:3000. Data lives in `./data-server` (one JSON file per user). The first
person to sign up owns the server; set `SIGNUP=open` to let others create accounts. Put it behind
HTTPS (a reverse proxy) before using it over the internet; session cookies are marked `Secure`
when the proxy sends `X-Forwarded-Proto: https`.

### AI features (off by default)

Set `ANTHROPIC_API_KEY` on the server. Signed-in users then get a **Photo** button on each meal
and a **Weekly review** card. The key never reaches the browser. Photos are downscaled in the
browser and sent to Anthropic through your server; each user is limited to 40 AI calls a day.
`AI_MODEL` picks the model (default `claude-opus-5-5`).

### Android

```bash
npm run android     # builds dist, syncs Capacitor, assembles android/app/build/outputs/apk/debug
```

Needs JDK 21 and the Android SDK. The APK is the standalone app: it stores data on the phone and
has no sync or AI, because those are served by your server. For sync on a phone, open your
server's address in the browser and install it from the browser menu.

## Layout

```
src/lib/      pure logic, each piece unit-tested: targets, nutrition, search, state merge, week summary
src/views/    one file per screen; src/*.jsx are shared dialogs
src/store.js  all app data (persisted in the browser); src/sync.js pushes and pulls it
server/       server.js (node:http, accounts, state, static files) and ai.js (Anthropic calls)
scripts/      build the food catalogue from the source datasets
android/      Capacitor shell
```

## How sync works

The whole state is one JSON document with a revision number. A device sends its copy with the
revision it last saw; if the server has moved on it answers 409 with the current copy, the device
merges (`src/lib/state.js`: diary entries and foods are unioned by id, deletions win, and for a
single value such as a day's weight the device making the change wins) and retries.

## Food data

`src/foods-data.json` is generated; do not edit it by hand.

| Source | What | Notes |
|---|---|---|
| IFCT 2017 (NIN, Hyderabad) | 525 Indian raw foods, Table 1 | Copyright NIN/ICMR. Fine for personal use; check their terms before publishing or distributing this app. Carbohydrate excludes fibre. No household portions. |
| USDA FNDDS 2021-2023 | 5,431 foods as eaten, with portions | Public domain. Carbohydrate includes fibre. |
| Open Food Facts | Packaged foods, looked up live by barcode | ODbL. Crowd-sourced, so check the numbers. A found product is saved to My foods. |

To rebuild the catalogue (Python 3 with `pymupdf`):

```bash
python scripts/extract_ifct.py path/to/IFCT2017.pdf > data/ifct.json
python scripts/build_foods.py path/to/FoodData_Central_survey_food_csv_2024-10-31
```

The FNDDS folder is the unzipped "Survey Foods (FNDDS)" CSV download from
https://fdc.nal.usda.gov/download-datasets. The IFCT extractor checks every row against
the book's own energy formula and drops rows that fail (3 of 528: N001, P080, S005).

## Not built

- iPhone app (needs a Mac), Apple Health / Health Connect, meal reminders
- Passkeys (sign-in is username and password, hashed with scrypt)
- Sessions are kept in memory, so restarting the server signs everyone out
