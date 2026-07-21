# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

BotTradeApp is a multi-platform AI trading bot platform:
- **Backend**: Fastify 5 + TypeScript + Drizzle ORM + PostgreSQL (Neon) + Redis (Upstash) + BullMQ
- **Mobile**: React Native 0.75.4 (Android primary, USB deployment)
- **Admin**: React 19 + Vite + Tailwind CSS

Production server: `157.245.215.118:3000` — deployed via paramiko SSH (`deploy_helper.py`), process managed by PM2 (`bottradeapp`).

---

## Commands

### Backend (`backend/`)
```bash
npm run dev          # Start with hot-reload (tsx watch)
npm run build        # Compile TypeScript → dist/
npm run db:push      # Push schema changes to DB (no migration file)
npm run db:generate  # Generate Drizzle migration file
npm run db:seed      # Populate DB with test data
npm run db:studio    # Open Drizzle Studio UI
npm test             # Run Vitest suite
```

Test users (seeded): `admin@bottrade.com`, `creator@bottrade.com`, `user@bottrade.com` — password: `Password123!`

### Mobile (`BotTradeApp/`)
```bash
npm start            # Metro bundler
npm start:clean      # Metro with cache reset
npm run android      # Build + run on connected device
```

**Android build (PowerShell only — gradlew.bat fails in bash):**
```powershell
$env:JAVA_HOME = "C:\Program Files\Microsoft\jdk-17.0.17.10-hotspot"
$env:ANDROID_HOME = "C:\Users\faroo\AppData\Local\Android\Sdk"
$env:PATH = "C:\Program Files\nodejs;" + $env:ANDROID_HOME + "\platform-tools;" + $env:JAVA_HOME + "\bin;" + $env:PATH
$env:GRADLE_USER_HOME = "D:\gradle_home"
Set-Location "D:\Weiblocks\Bot_App\BotTradeApp\android"
.\gradlew.bat assembleDebug --console=plain
```

**Install + launch on device (`ojyhushavolnvc65`):**
```powershell
$adb = $env:ANDROID_HOME + "\platform-tools\adb.exe"
& $adb -s ojyhushavolnvc65 install -r "D:\Weiblocks\Bot_App\BotTradeApp\android\app\build\outputs\apk\debug\app-debug.apk"
& $adb -s ojyhushavolnvc65 shell am start -n "com.botttradeapp/.MainActivity"
```

### Admin (`admin/`)
```bash
npm run dev      # Vite dev server
npm run build    # Production bundle
npm run lint     # ESLint
```

### Deployment
```python
# Upload dist files and restart PM2
python deploy_helper.py   # SSH utilities (run(), upload_file())
python deploy_dist.py     # Full backend dist deploy

# Feature-specific deploy scripts (upload only changed files + test):
python deploy_compounding_fixes.py
python deploy_min_order_removal.py
```

---

## Architecture

### Backend Modules (`backend/src/`)

Each module under `modules/` follows: `*.routes.ts` → `*.service.ts` + `*.schema.ts` (Zod).  
Routes auto-register in `app.ts` via `app.register(xxxRoutes, { prefix: '/...' })`.

Key modules: `auth`, `bots`, `marketplace`, `arena`, `trades`, `portfolio`, `exchange`, `payments`, `notifications`, `trainer`, `admin`, `ws`.

**Zod + fastify-type-provider-zod**: Schemas double as both runtime validation and OpenAPI docs (Swagger at `/docs`). Unknown body fields are stripped unless schema uses `.passthrough()`.

### Background Jobs (`backend/src/jobs/`)

All BullMQ jobs start after server listen in `index.ts`:

| Job | Interval | Purpose |
|-----|----------|---------|
| `price-sync` | 30s | Fetch OHLCV from Binance/Alpaca → Redis |
| `shadow-trade` | 30s | Execute paper trades for shadow sessions |
| `live-trade` | 30s | Execute real trades for active subscriptions |
| `arena-tick` | 5s | Arena competition rounds |
| `portfolio-update` | 5m | Portfolio metrics |
| `notification` | 1m | Push notification delivery |
| `auto-trainer` | scheduled | AI strategy refinement |

`price-sync` must run first — all trading jobs depend on Redis-cached prices.

### Trading Engine (`backend/src/lib/bot-engine.ts`)

Hybrid decision system per tick:
1. Technical indicators (RSI, MACD, Bollinger Bands, MAs) → signal + confidence
2. AI layer (Claude via `llmChat`) — if `aiMode = 'hybrid' | 'full_ai'` and rate limit not hit
3. Confidence threshold gate (default 60%) — below this → HOLD
4. Execute trade via exchange adapter

`aiMode` options: `rules_only` (indicators only), `hybrid` (indicators + AI confirm), `full_ai` (AI decides).  
AI rate limit: 120 calls/hour **per bot:symbol pair** (not global).

### Database (`backend/src/db/schema/`)

Drizzle ORM, PostgreSQL (Neon). Key tables:
- `bots`, `botSubscriptions` — bot definitions and per-user live subscriptions
- `shadowSessions` — paper trading sessions; `userConfig` JSONB stores all user preferences + `compounding` object
- `botSubscriptions.compoundingSettings` — live compounding config (separate column from `userConfig`)
- `botPositions` — open positions (shadow and live, scoped by `shadowSessionId`)
- `trades`, `botDecisions` — execution history and AI decision audit trail
- `exchangeConnections` — encrypted exchange credentials (AES-256 via `lib/encryption.ts`)

**Schema import rule**: Cross-schema imports use NO `.js` extension (drizzle-kit CJS compat). All other imports use `.js` extension (ESM).

### Mobile Services (`BotTradeApp/src/services/`)

All API calls go through `services/api.ts` (Axios). Key services: `bots.ts`, `marketplace.ts`, `arena.ts`, `dashboard.ts`.

`botsService` key methods: `startShadowMode`, `updateShadowSessionConfig`, `updateUserConfig`, `updateCompounding`, `getCompounding`, `getShadowSessionConfig`.

### Compounding Logic

**Shadow**: stored in `shadowSessions.userConfig.compounding` (JSONB). Shadow job reads fresh each 30s tick and applies `toReinvest` to `totalCompounded` tracker (audit only — virtual balance grows from P&L, not separately).

**Live**: stored in `botSubscriptions.compoundingSettings` (dedicated column). Live job calls `applyCompounding()` after profitable SELL, which physically increases `allocatedAmount` in DB.

### AI / LLM (`backend/src/config/ai.ts`)

Unified `llmChat()` abstraction — routes through Claude (primary), OpenAI (fallback), Gemini (fallback) based on `AI_PROVIDER` env. Default model: `claude-sonnet-4-6`. RAG context from YouTube transcripts + vector embeddings injected into trading decisions.

---

## Key Environment Variables

Backend uses Zod-validated env (`backend/src/config/env.ts`). Config file: `backend/.env.development`.

Critical vars:
- `DATABASE_URL` — Neon PostgreSQL
- `REDIS_URL` — Upstash Redis
- `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`
- `ANTHROPIC_API_KEY`, `AI_PROVIDER=anthropic`, `AI_MODEL=claude-sonnet-4-6`
- `EXCHANGE_ENCRYPTION_KEY` — 32-byte hex for AES-256 credential storage
- `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY` — push notifications

---

## Build System Notes (Android)

- Gradle 8.13, AGP 8.7.3, Kotlin 1.9.24
- `GRADLE_USER_HOME=D:\gradle_home` (C: drive space constraint)
- `settings.gradle` uses `autolinkLibrariesFromCommand()` — Node must be in PATH
- Multiple background Gradle daemons can deadlock: kill with `Stop-Process -Name java -Force`
- Package versions locked: `react-native-reanimated@3.16.7`, `react-native-gesture-handler@2.20.2`

---

## Deployment Pattern

Backend is compiled TypeScript. After changes:
1. `npm run build` in `backend/`
2. Upload changed `dist/` files via `deploy_helper.py` (`upload_file()`)
3. Restart PM2: `pm2 restart bottradeapp`
4. Run API tests to verify (see feature-specific deploy scripts for examples)

Feature deploy scripts (`deploy_*.py`) follow the pattern: upload → restart → health check → API tests with PASS/FAIL counts.
