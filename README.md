# Expense Tracker

Personal finance tracker for the web and Android. Track income, expenses, and investments; organize spending with custom buckets; set budgets; and review trends with summary, calendar, and reflection views.

The web app deploys to **Vercel** with **Supabase** for auth and data. The Android app in `mobile/` is built with **Expo** and is published to the **Google Play Store as an unlisted app** for personal use.

## Features

- **Auth**: Sign up / log in with per-user data (Supabase + Row Level Security)
- **Buckets**: Custom spending categories for expenses
- **Transactions**: Income, expense, and investment entries with tags, notes, and templates
- **Recurring**: Daily, weekly, fortnightly, monthly, and yearly schedules that auto-generate transactions
- **Budgets**: Monthly and yearly budgets by bucket
- **Summary dashboard**: Period filters, charts, and bucket breakdowns
- **Calendar**: Month/year views with spending heatmap
- **Reflections**: Monthly/yearly notes and review
- **Backup & restore**: Export/import your data
- **Dark mode** and installable **PWA** (web)
- **Mobile app**: Native Android client (Expo) sharing the same backend

## Project layout

| Path | Purpose |
|------|---------|
| `src/` | Web frontend (React + TypeScript + Vite) |
| `api/` | Vercel serverless API routes |
| `backend/` | Optional local Express API (SQLite) for offline/dev use |
| `supabase/` | Database schema and migrations |
| `mobile/` | Expo React Native app (Android / iOS) |

## Getting started (web)

### Prerequisites

- Node.js 18+ (recommended)
- npm
- A Supabase project (see [SUPABASE_SETUP.md](./SUPABASE_SETUP.md))

### Installation

```bash
npm install
```

Create a `.env` file in the project root:

```env
VITE_SUPABASE_URL=https://xxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
```

### Development

**Recommended (frontend + API against Supabase via Vercel-style routes):**

```bash
npm run dev
```

Open the URL shown in the terminal (usually `http://localhost:5173`).

**Optional local Express + SQLite backend:**

```bash
npm run server          # API on http://localhost:3001
npm run dev             # frontend
# or both:
npm run dev:all
```

Use the local Express server only if you intentionally want SQLite; production and the mobile app use Supabase.

### Production build

```bash
npm run build
```

Output is in `dist/`. To serve the built frontend from the local Express server:

```bash
npm run build:start
```

Then visit `http://localhost:3001`.

## Mobile app

The Android (and iOS-capable) client lives in `mobile/`.

The mobile project uses Expo SDK 57 and React Native 0.86.3. Use Node.js 22.13 or newer; install the versions recorded in the lockfile with `npm ci`.

```bash
cd mobile
npm install
npx expo start
```

- **Package ID**: `com.brendontan.expensetracker`
- **EAS project**: configured in `mobile/app.json` / `mobile/eas.json`
- **Play Store**: published as an **unlisted** listing for personal use (not publicly discoverable)

Production mobile builds and submits use Expo EAS (`npx eas-cli@latest build` / `npx eas-cli@latest submit`) from the `mobile/` directory. EAS CLI is run separately rather than bundled into the app dependencies.

### Mobile upgrade verification

From `mobile/`, run:

```bash
npx tsc --noEmit
npx expo-doctor
npx expo export --platform android --output-dir /tmp/expense-tracker-android-check
```

The SDK 54 → 55 → 56 → 57 migration passed type checking and Android JavaScript bundling at each stage. SDK 56's known Hermes regression was resolved by advancing to patched SDK 57. SDK 57 also requires the splash-screen config plugin instead of the old `splash` app setting.

Generated Android files are ignored by Git. After an SDK upgrade, preserve any local native modifications before regenerating with `npx expo prebuild --platform android --clean`. The previous local Android project from this upgrade is preserved under ignored `mobile/.native-backups/`; this folder is not uploaded as source.

JavaScript export and native project generation do **not** prove that an Android APK/AAB builds or runs. Before release, build a fresh Android binary and test login/session handling, API errors, navigation and keyboard/safe-area layout, charts, date selection, biometrics, and file picking/sharing. Test destructive restore only with isolated test data. SDK 56+ changes the global fetch implementation, so API behavior needs device verification even though the app's API code is unchanged.

The development build profile still needs a development client and a distinct application identity before installing it alongside the Play Store app. The mobile API currently points to the production backend; a separate app identity alone does not isolate financial data.

Use `npm audit` to review remaining upstream advisories; do not use `npm audit fix --force` to override Expo's supported native versions. The upgrade is not a security certification or a Play Store release.

## Deployment (web)

Deploy the web app to Vercel with Supabase as the database.

1. Set up Supabase and run `supabase/schema.sql` (plus any migrations in `supabase/`) — see [SUPABASE_SETUP.md](./SUPABASE_SETUP.md)
2. Import this repo in [Vercel](https://vercel.com)
3. Add environment variables:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
4. Deploy and use the Vercel URL

Details: [DEPLOYMENT.md](./DEPLOYMENT.md)

## Usage (web)

1. **Summary** — overview, charts, and budget status
2. **Calendar** — browse spending by day/month/year
3. **Transactions** — add/edit entries; use templates for quick entry
4. **Reflections** — write monthly/yearly notes
5. **Settings** — manage buckets, recurring rules, budgets, backup, and appearance

## Technology stack

### Web
- React 18, TypeScript, Vite
- React Router, Recharts
- Vite PWA plugin

### Mobile
- Expo / React Native
- React Navigation
- EAS Build & Submit

### Backend & data
- Vercel serverless functions (`api/`)
- Supabase (Auth + PostgreSQL + RLS)
- Optional local Express + SQLite (`backend/`)

## API overview

Authenticated endpoints (Bearer token) under `/api`:

| Area | Routes |
|------|--------|
| Auth | `POST /api/auth/register`, `POST /api/auth/login`, `GET /api/auth/verify`, `POST /api/auth/change-password` |
| Buckets | `GET/POST /api/buckets`, `PUT/DELETE /api/buckets/:id` |
| Transactions | `GET/POST /api/transactions`, `PUT/DELETE /api/transactions/:id` |
| Recurring | `GET/POST /api/recurring`, `PUT/DELETE /api/recurring/:id` |
| Budgets | `GET/POST /api/budgets`, `PUT/DELETE /api/budgets/:id` |
| Summaries | `GET/POST /api/summaries` (monthly/yearly notes) |

## Environment variables

```env
VITE_SUPABASE_URL=https://xxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
```

Get these from Supabase → Project Settings → API. On Vercel, set the same names in the project environment variables.

## License

MIT

## Financial reliability update (pending database rollout)

The reliability changes reject fractional-cent amounts in the web/mobile forms and API, and store amounts as exact PostgreSQL `numeric` after migration. Supported amounts are 0.01–9,999,999,999.99. Existing values are not silently rounded. Transaction, recurring, budget (including web bulk editing), and template amount fields use matching inline validation: invalid nonempty input immediately shows a red border and message, required blanks show feedback after blur/save, and correcting the value clears it. Template amounts may remain blank.

Recurring generation now runs through `process_recurring_transactions` in one database transaction. A unique account/schedule/date key prevents duplicate occurrences; schedule progress commits only after successful writes. Month-end and leap-year dates stay anchored to the original start date. Older clients cannot advance progress past missing occurrences after the migration. Existing historical `lastApplied` values are preserved; the migration does not infer or repair previously skipped history. Generation still runs when the app loads/refreshes (and when the web tab becomes visible), not as a background scheduled job.

Backup version 2 exports all six account tables in one snapshot, including monthly/yearly reflections, without the ordinary list endpoint's pagination limit. Restore validates and replaces those records in a single transaction. Version 1 backups preserve reflections they do not contain. Device-local templates/preferences, authentication records and provider settings are outside this **in-app** backup; use a private database backup for disaster recovery. Pending restore request IDs persist per account, so retrying an unchanged file after an uncertain network result cannot repeat a completed restore. A new confirmed restore after a successful response intentionally replaces current records again.

Backup GET/POST requests use `/api/recurring?action=backup` and the implementation in `lib/backup.js`, keeping this plain-Vercel deployment at its existing 12 functions. Recurring processing uses POST `/api/recurring?action=process`. Clients first check `/api/recurring?action=capabilities` with a read-only request; on an older server they skip automatic generation until the backend update is deployed. Missing database RPCs fail closed; neither client falls back to per-record deletion/restoration.

### Verification

```sh
node --test tests/*.test.mjs
npm run build
cd mobile
npx tsc --noEmit
npx expo export --platform android --output-dir /tmp/expense-reliability-export
```

SQL integration tests use an isolated in-memory PostgreSQL runtime, with no production connection. Install the test runtime outside this repository, then from the repository root run:

```sh
npm install --prefix /tmp/expense-db-tests --no-audit --no-fund @electric-sql/pglite@0.5.8
PGLITE_MODULE=/tmp/expense-db-tests/node_modules/@electric-sql/pglite/dist/index.js node tests/database-reliability.mjs
```

Tests exercise exact amounts, calendar boundaries/DST, authenticated account separation, foreign-key ownership, failed restore rollback, legacy backups, repeated recurring processing, old-client progress checks, retry receipts and a 1,461-entry backlog. PGlite is single-connection: real multi-connection serialization and hosted Supabase permissions require staging verification. JavaScript export is not native compilation or phone testing.

### Hosted staging verification — 11 October 2026

The separate Supabase project `expense-tracker-staging` (`tfjegsgjwyzcixlueosi`, Tokyo) now has `schema.sql` and `migration_reliability.sql` applied. It uses the organization's second free active-project slot. No live database records were copied. The production project and the mobile app's production API address remain unchanged.

Run the hosted integration suite from this repository with a private JSON configuration containing `projectRef`, `url`, `anonKey`, and `serviceRoleKey`:

```sh
STAGING_CONFIG="/Users/brendontan/Desktop/expense-tracker-backups/staging/credentials.json" \
EXPECTED_STAGING_REF=tfjegsgjwyzcixlueosi \
node tests/hosted-reliability.mjs
```

Keep that credential file private and outside Git; it also holds the generated staging database password. The suite rejects the known production project, requires an explicit matching staging reference, and confines requests to that project's HTTPS origin. It creates confirmed synthetic users without sending sign-up emails and deletes the accounts created by the run in `finally`. If account creation times out after committing remotely, inspect staging for accounts tagged with that run's `reliability_test_run` metadata; that exceptional cleanup case cannot be confirmed from an absent response.

The hosted run passed:

- Actual API handlers with real Supabase authentication, cent validation, and six-table backup export/restore.
- Six simultaneous recurring RPC requests produced exactly three monthly occurrences, including the February month-end date, with no duplicates.
- Cross-account reads across all seven data/receipt tables, selected cross-account writes and linked-record attacks, anonymous RPC denial, and receipt update/delete denial.
- Invalid amount, missing-reference and invalid-date restores left the original snapshot intact. Wrong-account restore confirmation was rejected. Replaying a completed restore preserved a subsequent edit; changing the payload under the same receipt was rejected.
- A separate controlled concurrency check held a restore transaction open, observed an ordinary REST save waiting on its advisory lock, and confirmed that the save committed after restore and remained in the exported snapshot. All synthetic test accounts were removed afterward.

These checks exercise local API handlers against hosted Auth/PostgREST. They do not verify a deployed Vercel route, a full private database-backup recovery, every authorization path, or device interaction with the new backend. Production rollout remains a separate step.

### Connect Expo Go to staging

On this Mac, start both the real API handlers and Expo from one terminal:

```sh
cd "/Users/brendontan/Desktop/expense tracker web/mobile"
npm run start:staging
```

Keep the phone and Mac on the same Wi-Fi, keep the terminal open, and scan the **new** QR code in Expo Go. Use the dedicated test login in `/Users/brendontan/Desktop/expense-tracker-backups/staging/phone-test-login.txt`. The test account starts empty. Use synthetic data and its separate password; local test traffic uses HTTP on your Wi-Fi.

The launcher reads the private staging configuration from the folder above (override with `STAGING_CONFIG`), starts the API on port 3001 if it is not already running, and starts Expo on port 8083. It selects the Mac's Wi-Fi IPv4 address; set `STAGING_LAN_IP` if your network interface differs. Expo's `--offline` mode uses LAN and anonymous manifest signing, avoiding the prior login/proceed-anonymously prompt; the app still connects to the staging API and Supabase normally. If macOS asks, allow local-network access.

`EXPO_PUBLIC_APP_ENV=staging` and `EXPO_PUBLIC_API_URL` are set only for that Expo process. The app checks `/api/health` for the expected test project before sending app requests, keeps staging tokens/remembered passwords/local preferences/restore receipts separate, and never falls back to production if staging is unavailable. No private backend credential is bundled into the app. The adapter accepts only the fixed staging project and uses its anonymous/publishable key.

Ordinary `npm start` retains the existing production API and production login storage. To switch, stop the staging Expo session, run the ordinary command, and scan its new QR code. Do not use an older Expo session's QR code when intending to test staging. The installed Play Store app is unchanged.

Verified locally: actual HTTP login/verification, dynamic bucket and transaction routes, cent validation, recurring capability/process and backup export/restore; mobile typecheck; Android staging JavaScript export; Expo Doctor (21/21); staging credential/cache isolation and failed-health-check tests. Brendon confirmed the requested phone smoke checks passed on 11 October 2026, including JSON restore after switching import to the file-system picker. Development and staging remain the focus; production and Play Store releases are deferred until explicitly requested.

### Rollout order

1. Keep the live app unchanged while reviewing the diff. Create a fresh private database backup before production rollout; verify restoration into an isolated target. The earlier Desktop backup is a separate snapshot, not proof that this new migration is deployed.
2. Apply `supabase/schema.sql` and then `supabase/migration_reliability.sql` to an isolated test project. Existing projects apply only the migration. It is a one-time transactional migration, not a rerunnable setup script. It aborts on historical fractional-cent/invalid money, duplicate occurrences, cross-account references or noncanonical calendar dates. Inspect failures and agree on corrections; never delete or round historical records automatically.
3. On the test project, verify concurrent recurring runs, an old-style write during restore, failed restores, retry after lost response, account switching, and real API role permissions. The mobile API currently points to production; use a test endpoint before destructive device testing.
4. Apply the reviewed migration to production only as an explicit release step, then deploy the API/web changes and release the matching mobile client. The migration adds tables/constraints/RPCs without renaming existing app fields. It strengthens old-client writes but cannot make the older Play Store app's multi-request restore atomic; do not use that old restore flow.
5. Test transaction CRUD, cent validation, budgets, recurring schedules and the new export/restore on an isolated account. A timed-out restore can have committed; retry the unchanged file so the saved request ID is reused. Avoid concurrent intentional edits while confirming a replacement restore.

Do not undo this migration by converting money back to `REAL`; that loses precision. Revert application code only after reviewing compatibility with the retained constraints. No production migration, deployment or Play Store release is performed by the local verification commands above.
