# openKCal

<p align="center">
  <strong>An open-source, local-first nutrition, calorie, and macro tracker crafted with an OLED-native interface, openGym ecosystem sync, HealthifyMe-grade wellness features, AI vision tools, and a shared community food database.</strong>
</p>

<p align="center">
  <a href="https://openkcal.onrender.com"><strong>🌐 Live Web App: https://openkcal.onrender.com</strong></a>
</p>

<p align="center">
  <a href="#features">Features</a> •
  <a href="#opengym-integration">openGym Sync</a> •
  <a href="#healthifyme-wellness-suite">HealthifyMe Features</a> •
  <a href="#ai-vision-skills">AI Vision Tools</a> •
  <a href="#community-database">Community Database</a> •
  <a href="#self-hosting">Self-Hosting</a> •
  <a href="#android-apk">Android APK</a>
</p>

---

## Overview

**openKCal** is a private, local-first nutrition and fitness tracking application designed to accompany [openGym](https://github.com/DuarteSantos8/openGym). It functions completely standalone in your browser without an account, and seamlessly connects to a lightweight self-hosted server for multi-device sync, community recipes, and automated background backups.

Your data stays on hardware you control: plain JSON files instead of opaque databases, zero third-party telemetry, and zero ads.

---

## Features

### 1. UI & Experience (openGym HIG)
- **OLED True-Black Theme**: Strict `#000000` surface matching openGym's design standards.
- **Micro-Interactions**: Hairline dividers, stroke-based 24×24 system iconography, and smooth hardware-accelerated animations.
- **Customizable Palettes**: Accent color choices including Lime, Sky, Turmeric, Violet, Orange, Pink, Teal, and Gold.

### 2. Diary & Food Logging
- **Meal-by-Meal Diary**: Breakfast, Lunch, Snacks, and Dinner tracked against dynamic calorie and macro targets.
- **5,956+ Food Offline Catalogue**: Pre-compiled from **IFCT 2017** (ICMR-NIN Indian raw foods) and **USDA FNDDS** (cooked dishes with household measurements like cups, bowls, and slices).
- **Comprehensive Nutrient Breakdown**: Energy, protein, carbs, net carbs, fat, fiber, sugars, saturated fat, and sodium.
- **Recipe Dish Builder**: Combine raw ingredients with cooked pot weights and yield servings.
- **Open Food Facts Live Fallback & Barcode Scanner**: Scan barcodes or search millions of branded products with automatic background fallback to Open Food Facts when not found in the local catalogue.

### 3. openGym Ecosystem Integration
- **Direct 2-Way Sync**: Connect your openKCal instance to your self-hosted [openGym](https://github.com/DuarteSantos8/openGym) server.
- **User Pairing Token (`SYNC_TOKEN_OG_...`)**: Generate a pairing token in openGym and paste it into openKCal for secure, live background synchronization.
- **Workout & Burn Integration**: Automatically imports logged workouts, completed exercises, and sets, calculating exact calories burned using MET standards.
- **Biometric Sync**: Automatically aligns bodyweight records and body circumference measurements (waist, chest, arms, thighs, hips).
- **CSV Data Compatibility**: One-click import and export matching openGym CSV formats.

### 4. HealthifyMe-Grade Wellness Suite
- **Intermittent Fasting Tracker**: Support for 16:8, 14:10, 18:6, 20:4, and custom fast schedules with live countdown timers, stage progress, and completion logs.
- **Water Intake Tracker**: Visual glass counter and progress gauge with customizable daily targets (e.g. 2.5L–4L) and 250ml / 500ml quick-add controls.
- **Exercise Burn Tracker**: Dedicated activity logging with MET-based caloric calculations for cardio, walking, running, and resistance sessions.
- **Diet Quality Score (DQS)**: Real-time 1–10 nutritional rating analyzing protein density, fiber sufficiency, and sugar/saturated fat moderations.
- **Interactive Trends**: Visual weight trajectories, caloric intake vs. burn graphs, and macronutrient balance across 1-week, 1-month, 3-month, and 1-year windows.
- **AI Coach Chat**: Conversational nutritionist providing daily meal assessments, macro recommendations, and quick shortcuts to vision logging tools.

### 5. AI Vision Tools & Skills
- **Photo Meal Logging**: Photograph your plate or meal; AI identifies components, estimates portions, and provides a 1-tap **"Save as Recipe Dish & Log"** button that shares the recipe globally.
- **Nutrition Facts Label OCR**: Photograph nutrition facts on packaged food (+ optional front photo); AI normalizes all values per 100g and adds the food to the global community library.
- **Bring Your Own Key (BYOK)**: Connect Anthropic (Claude), OpenAI (GPT-4o), Google Gemini, or local OpenAI-compatible endpoints (Ollama, LM Studio, vLLM, OpenRouter). Keys remain client-side or AES-256 encrypted on your server.

### 6. Shared Community Database
- **Automatic Community Sharing**: Every custom food, nutrition label scan, and recipe dish created by any user is automatically synchronized to `recipes.json` and instantly shared with all users across the instance.
- **Author Attribution**: Items display creator credits (e.g. `Recipe by Priya`, `Shared by Alex`) in the food library and food details.

### 7. In-App Onboarding & APK Distribution
- **In-App Onboarding Guide**: Built directly into the SPA at `/welcome`, `#welcome`, and in Settings, complete with an interactive macro plate and feature overview.
- **Direct Android APK Download**: Hosted directly at `/download/openkcal.apk` with live file size check and SHA-256 verification hash.
- **Automated GitHub Releases**: Packaged and signed via automated GitHub Actions workflow (`.github/workflows/release-apk.yml`).

---

## Quick Start

### Prerequisites
- [Node.js](https://nodejs.org) 22 or newer

```bash
# Clone the repository
git clone https://github.com/zayn0001/openKCal.git
cd openKCal

# Install dependencies
npm install

# Start development preview (client on :5173 with hot reload)
npm run dev
```

To run both the server and client together with full account and sync capabilities:

```bash
# Start the full server on :3000 (also serves dist/ in production)
npm start
```

| Command | Description |
|---|---|
| `npm run dev` | Starts Vite dev server on port 5173 with HMR |
| `npm start` | Starts Node.js backend server on port 3000 |
| `npm run build` | Compiles production bundle into `dist/` |
| `npm test` | Runs unit & integration test suite (35+ tests) |
| `npm run lint` | Runs oxlint across all source files |
| `npm run android` | Builds debug Android APK via Capacitor |

---

## Self-Hosting

### Docker Compose

```bash
# Copy example environment variables
cp .env.example .env

# Build and run container in detached mode
docker compose up -d --build
```

The app will be available on `http://localhost:3000`. The first account created automatically becomes the server owner and administrator.

All server data is kept inside `./data-server`:
- `db.json`: Accounts, passwords (scrypt), WebAuthn passkey public keys, and invite codes.
- `recipes.json`: Shared community foods and recipe dishes created by all users.
- `state/<uid>.json`: User sync state files (diaries, foods, weight logs).
- `ai/<uid>.json`: Encrypted user AI configuration and keys.
- `audit.log`: Security audit trail for sign-ins and administrative changes.

### S3 & Supabase Bucket Mirroring

For stateless cloud hosts (such as Render free tier), openKCal includes automatic S3 bucket mirroring via `server/mirror.js`:
- Set `MIRROR_ENDPOINT`, `MIRROR_BUCKET`, `MIRROR_KEY_ID`, and `MIRROR_SECRET`.
- When set, openKCal automatically synchronizes disk changes to the bucket every 2 seconds and restores state on startup.

---

## Android APK

openKCal can be built as a standalone native Android application via Capacitor:

```bash
# Build Android APK locally
npm run build
npx cap sync android
cd android && ./gradlew assembleRelease
```

Automated release builds and signing are handled via GitHub Actions in [`.github/workflows/release-apk.yml`](.github/workflows/release-apk.yml) utilizing GitHub repository secrets:
- `ANDROID_KEYSTORE_BASE64`
- `KEYSTORE_PASSWORD`
- `KEY_ALIAS`
- `KEY_PASSWORD`

---

## Security & Privacy

- **Scrypt Password Hashing**: Per-account cryptographic salt, compared in constant time with exponential backoff on failed attempts.
- **Passkeys (FIDO2 / WebAuthn)**: Native biometric and hardware security key sign-in.
- **Strict Network Controls**: Webhook and AI outbound requests strictly refuse loopback and internal private addresses to eliminate SSRF risks.
- **Client-Side Data Ownership**: All calculations and local logs function completely offline in the browser even without a network connection.

---

## License

All rights reserved. Bundled IFCT 2017 nutritional datasets are copyright ICMR - National Institute of Nutrition (Hyderabad).
