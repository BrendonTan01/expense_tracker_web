# Expense Tracker

Personal finance tracker for the web and Android. Track income, expenses, and investments; organize spending with custom buckets; set budgets; and review trends with summary, calendar, and reflection views.

The web app deploys to **Vercel** with **Supabase** for auth and data. The Android app in `mobile/` is built with **Expo** and is published to the **Google Play Store as an unlisted app** for personal use.

The [Diagnostic and Development Roadmap](https://chatgpt.com/space/page_c1b355e4a6c88191870655c598ec957a) is the source of truth for priorities, decisions and progress. Consult it before making changes and update affected items with implementation and verification results. This README provides setup instructions and supporting evidence; it is not a separate backlog.

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

This separate backend requires a private random `JWT_SECRET` of at least 32 characters and binds only to `127.0.0.1`. Missing, short, or the former public placeholder secret prevents startup. Generate a local value with `openssl rand -hex 32` and set it in your shell; do not commit it. Changing the secret invalidates existing SQLite login tokens. This does not configure or change Supabase authentication.

```bash
npm run server          # API on http://localhost:3001
npm run dev             # frontend
# or both:
npm run dev:all
```

Use the local Express server only if you intentionally want SQLite; production and the mobile app use Supabase.

### Development checks

`npm test` runs the isolated Node regression suite. GitHub Actions runs this suite, the web build and mobile TypeScript checks on pushes and pull requests without production credentials. Database migration/concurrency tests remain separate: the ordinary suite does not prove deployed database behavior, and repository branch protection must be configured separately if these checks should be required before merging.

### Batch 1 development checkpoint

Implemented against `8a9c66d`: session generation and persistence ordering, account-scoped templates in both clients, awaited deletion with partial-result reconciliation and original-ID undo, reflection draft/deletion repairs, hidden-tab route registration, and fail-closed optional SQLite signing configuration. Independent review also reproduced a refresh overwriting a completed deletion; mutation revisions and refresh sequencing now prevent that race. No database migration, production rollout, dependency upgrade or Play Store release is included.

Old `transaction_templates` storage has no recorded owner. It is preserved untouched but deliberately not displayed or assigned to any account. New templates use account-specific keys. A later ownership-confirmed recovery flow may be needed if those old templates should be reused. Undo retains recurring associations; it refuses to overwrite a conflicting record and reconciles lost create responses by the original ID. Unconfirmed deletes require refresh; a failed undo can be retried while its toast remains available. Another toast or an account change can dismiss that undo action.

Validation: `npm test` **71/71 passed**, `npm run build` passed (existing empty vendor-chunk notices), mobile `npx tsc --noEmit` passed, and `git diff --check` passed. Independent tester and security reviews found no remaining blocking issue in the changed scope after follow-up fixes. The tests use isolated mocked services/storage and lightweight component hosts; no production data was used. GitHub Actions execution and native Android compilation remain unverified. Brendon reported the six-step remaining Batch 1 staging phone checklist passed on 12 October 2026: delete/undo, reflection editing, logout/account-template isolation, first-bucket draft return, ordinary connection failure and cleanup. The five-step navigation phone checklist also passed. These phone reports do not cover bulk partial failures, recurring-linked undo, delayed auth/expiry races, reflection deletion or hosted authorization; their automated and hosted closeout evidence is recorded below.

Phone checks on staging (about 15–20 minutes; use synthetic data only):

Manual-test follow-up: Templates was originally accessed only from Add → Quick add from template → Manage. The navigation pass below now also adds More → Transaction Templates. Inspecting that path exposed a missed ownerless storage read in `TransactionTemplatesSection`; it now uses the manager's account-specific key and cancels stale reads on blur/account changes. Five additional component regression tests, mobile TypeScript and independent tester/security review passed. Brendon subsequently reported the account-isolation phone check passed for the manager and quick-add strip.

1. **Restart the test environment.** Stop the existing Expo/staging launcher with Ctrl+C. If the staging API runs in a separate terminal, stop that too: the launcher reuses an already-running API and would otherwise retain old handlers. In Terminal run `cd "/Users/brendontan/Desktop/expense tracker web/mobile"` then `npm run start:staging`. Keep Mac and phone on the same Wi-Fi. Confirm the terminal says `STAGING ONLY`, scan the new QR code in Expo Go, and sign in with your existing test account (Account A). If prompted by Expo, choose Proceed anonymously. Expected: the test app opens. If startup fails or the staging label is absent, report that before proceeding.

2. **Make a template and hide Transactions.** Tap Add (+), then Manage beside Quick add from template, and create an income template named `B1 A template`, description `B1 entry`, amount `1.23` (income avoids needing a bucket for this step). Return to More → Settings → Tabs and turn Transactions off. Tap the central Add button. Expected: New Transaction opens even though its tab is hidden. Return to Add (+) → Quick add from template → Manage → Use on the template. Expected: the entry form opens with the template values. Save once, then turn Transactions back on. Expected: exactly one `B1 entry` record appears.

3. **Delete and undo.** Delete that synthetic record, then tap Undo promptly when deletion succeeds. Expected: it disappears only after a confirmed delete, then returns exactly once with its original details. Pull down to refresh. Expected: still exactly one copy. Repeat with several selected synthetic records if comfortable; all acknowledged deletions and undo results should match the list. If a generated recurring test entry already exists, also delete/undo it and confirm its Recurring label remains. If none exists, report that check as skipped rather than modifying a real schedule.

4. **Save, clear and separate reflection drafts.** Open More → Reflections → current year → current month. Use a period without important test notes, or copy its existing text first. Save `B1 monthly`, leave and reopen the month, then clear every character and save. Expected: it stays empty after reopening. Type `B1 monthly draft` without saving; go back to the year and type `B1 yearly draft`. Return to the month. Expected: the monthly draft remains separate. Save each in its own view and reopen them. Expected: the monthly/yearly texts are in the correct periods, including after reopening the app.

5. **Check logout and a second account.** Sign out of A. Close/reopen Expo Go and open the staging project. Expected: A does not silently sign back in. Use Create Account for a second test email with a unique password of at least six characters (Account B), or sign in to an existing second test account. Do not share passwords in chat. Open Add (+) → Quick add from template → Manage. Expected: A's template is absent from both the manager and the Quick add strip on the entry form. Create a distinct `B1 B template`. Background the app for ten seconds and return, then close/reopen it. Expected: the account shown in More → Settings remains B; A's transactions and templates never appear. Sign out and return to A. Expected: A's template is present and B's is absent in both places. Return from Manage to Add and confirm newly saved templates appear in Quick add. On A, enable Remember me when signing in, background/return and verify it remains A; then sign out and verify reopening still stays signed out. Account expiry/delayed-response races are covered by automated tests, not simulated by this routine check.

6. **Check first-bucket return on the fresh account.** On B, if it has no buckets, tap Add, choose Expense and enter description `B1 bucket return` with amount `2.34`. Tap Create your first bucket and create `B1 test bucket`. Expected: the app returns to the entry form with description and amount preserved, and the new bucket selected. Save once and confirm a single entry. If B already has buckets, mark this check skipped; do not delete existing buckets to force it.

7. **Check an ordinary connection failure.** While viewing a synthetic transaction, temporarily turn off Wi-Fi and mobile data, return to the app and try deleting it. Expected: no false deletion success and no Undo for an unconfirmed delete. Reconnect, sign in again if necessary, and refresh; confirm the actual list before retrying. A request may already have reached the server if connectivity was cut mid-request, so report the displayed outcome rather than assuming rollback. Transient-offline sign-out is a known AUTH01 follow-up, not a new Batch 1 success criterion. Deterministic partial failures, lost responses and refresh races are agent-owned automated checks.

8. **Clean up and report.** Restore Transactions tab visibility, remove only records/templates created for these checks, and restore any copied reflection text. Keep test accounts for future checks. Reply with each step number and Pass, Fail or Skipped. For a failure include what you tapped, what happened and the error text or screenshot, without credentials. Also say whether the recurring undo and first-bucket checks ran.

Phone checks are supplemented by the agent-owned hosted closeout below. Native Android compilation remains a separate release gate; the phone report alone does not prove it.

Full refresh-token handling and transient-offline session behavior remain in AUTH01. Currency/date aggregation fixes remain in Batch 2. Device testing does not require a commit or deployment, but restart the local staging API session to load changed handlers before checking reflection deletion.

### Batch 1 hosted closeout on 12 October 2026

Batch 1 core development verification is closed (SEC01, SEC02, WRITE01, UX01 and REF01). Independent closeout review added nine regression checks: overlapping login order/persistence races, actual browser template component account switching and rejected writes, all four allowed tab configurations, orphan reflection years and retry/cancellation behavior. Full `npm test` passed **94/94**, mobile `npx tsc --noEmit` passed, and `git diff --check` passed. Existing web-build validation remains applicable: no product code changed during closeout. Tester and security reviewers found no blocking issue in the inspected scope.

Component tests use inert trees/hooks and installed router code; they are not real React DOM or native navigation-container rendering. These limits do not invalidate the scoped development evidence, but native compilation/device release checks remain separate. CI execution and branch protection remain ENG01 follow-up after an authorized push.

Against the isolated staging project `tfjegsgjwyzcixlueosi`, `tests/hosted-batch1.mjs` passed using the real reflection handler and hosted Supabase Auth/PostgREST. For monthly and yearly reflections it verified owner create/read/update, same-period replacement, empty save/reload, foreign-ID read/update rejection, foreign typed/legacy delete leaving the owner unchanged, spoofed-owner create remaining owned by the authenticated account, direct RLS insert/owner-transfer denial, and actual absence after typed and legacy deletion. Shared monthly/yearly IDs remain isolated by type; missing/repeated deletion is idempotent; unauthenticated operations are rejected.

The existing `tests/hosted-reliability.mjs` was also rerun successfully: complete six-table export/restore, cross-user reads/writes/references, anonymous/receipt grants, concurrent recurring processing, invalid restore rollback, wrong-account confirmation and durable retry receipts. Both suites created fresh disposable users and removed them in cleanup; Brendon's phone-test accounts A and B were preserved. No schema changes or production traffic occurred.

Repeat the focused hosted check only against approved staging, with the private credential file outside Git:

```bash
STAGING_CONFIG="/Users/brendontan/Desktop/expense-tracker-backups/staging/credentials.json" \
EXPECTED_STAGING_REF=tfjegsgjwyzcixlueosi \
node tests/hosted-batch1.mjs
```

The harness pins the staging project and HTTPS origin, refuses redirected/off-project requests, suppresses handler logs and uses account tokens for ordinary operations. Admin credentials are confined to creating/removing disposable users. Only IDs returned by this run enter cleanup; if creation has an unknown result, inspect the staging users' `batch1_test_run` metadata for the printed run ID. These hosted scripts are intentionally excluded from ordinary `npm test` and CI without private staging configuration.

These checks exercise local handlers against hosted services, not deployed Vercel routes or a native Android binary. Full session lifecycle and password reauthentication remain AUTH01; dependency advisory follow-up remains DEP01. Development completion does not imply a production or Play Store release.

### Mobile navigation checkpoint (UX03)

The mobile route audit led to a dedicated More menu. Money tools contains Transaction Templates, Buckets, Budgets and Recurring Transactions; Review contains Transactions, Calendar and Reflections; Your data contains Backup & Restore; App contains Settings. Appearance, tab visibility, account details and sign out are now under More → Settings. Hidden tabs remain reachable through More. Tapping More returns to this menu.

Calendar offers Add on this day. Summary links directly to budgets and reflections. Every explicit Add, Edit or Use Template action creates a fresh editor route; creating a first bucket returns to the same draft. Quick add still offers Manage as a second route to templates. These are mobile-only changes with no dependency, API or database changes. The web route audit identified existing template-use differences; no web navigation changes are included.

Validation: the complete isolated suite passed **85/85**, mobile `npx tsc --noEmit` and `git diff --check` passed. Independent tester review found no blocker in the navigation scope. Tests exercise screen handlers and the installed router, not a mounted native navigation container.

Phone navigation checks (staging, synthetic data only; reload Expo after the code changes):

1. Open More. Visit each of its nine rows and check that the destination matches the label. For screens inside More, use Back and expect the menu. From any tool, tapping the More tab should also return to the menu. Check the menu in light/dark mode and with larger device text; rows should remain readable and tappable.
2. Go to More → Settings → Tabs. Hide Transactions, Calendar and Reflections wherever offered. Open each through More; all should still work. Tap Add and expect New Transaction. Restore your preferred tab visibility afterwards.
3. Open Calendar, select a different day, and tap Add on this day. Expect that date in the form. Save a synthetic income entry of 1.23 and confirm it appears on the selected day.
4. Edit that entry, then tap Add without saving the edit. Expect a blank New Transaction rather than the previous description/amount. Use a template from More → Transaction Templates; expect only that template’s values. Tap Add again and expect another blank form. These explicit actions start a fresh entry; persistent unsaved-draft recovery is not implemented.
5. On Summary, use Set up a budget (when empty) or Manage budgets (when populated), then Open reflections when that dashboard section is enabled. Expect the correct tool, with Back returning to More. Also recheck Batch 1 step 6 for first-bucket draft preservation if an empty test account is available.
6. Remove only the synthetic entries made here, restore appearance/tab preferences, and report Pass/Fail/Skipped by step. Phone verification, Android system Back behavior and native compilation remain pending until actually exercised.

Remaining audit findings are tracked in the canonical roadmap: visible alternatives to long-press-only deletion in budgets/recurring, consistent unsaved-change protection, and mobile/web template-use parity. This checkpoint documents current behavior, not a second prioritised backlog.

### Dependency advisory triage on 11 October 2026

The diagnostic's root audit reported zero advisories; mobile reported 28 affected-package entries (19 high, 9 moderate), propagated from three underlying advisories. No forced upgrades or dependency changes were made in Batch 1. These findings remain tracked; this is a scoped reachability assessment, not a claim that the native application is vulnerability-free.

- **braces 3.0.3**, via Expo Metro → metro-file-map → micromatch: [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) concerns deeply nested patterns causing stack exhaustion. Installed `metro-file-map/src/watchers/common.js` passes configured watch globs (including the fixed `**/*`) to micromatch. No path from account transaction input to these patterns was found. Temporary mitigation: run development/build tooling only against trusted project configuration; do not expose Metro publicly or build unreviewed external projects in a privileged environment. The advisory lists no patched version; recheck upstream before the next SDK/toolchain upgrade.
- **node-forge 1.4.0**, via Expo CLI and code-signing-certificates: [GHSA-86w9-cpqp-85rv](https://github.com/advisories/GHSA-86w9-cpqp-85rv) concerns RSA signature verification. Installed code-signing-certificates calls `certificate.verify` and public-key `verify`; this is a relevant crypto code path, not an automatically dismissible audit entry. The inspected CLI caller loads project certificate/private-key files; the signing helper verifies its own generated signature. Temporary mitigation: use trusted local signing material and authenticated upstream services, do not import unknown certificates or keys, and keep this unresolved for supported upstream remediation before a signed-update release. No evidence here proves that a crafted signature can bypass the installed Android verifier.
- **uuid 7.0.3**, via Expo config plugins → xcode: [GHSA-w5hq-g745-h8pq](https://github.com/advisories/GHSA-w5hq-g745-h8pq) affects specific v3/v5/v6 calls with supplied buffers. Installed `xcode/lib/pbxProject.js` uses `uuid.v4()` without a supplied buffer to create project IDs. The affected API was not found on that observed path. Track the upstream xcode dependency update; do not force an incompatible major uuid override merely to clear the count.

The application source does not directly import these three packages. A complete native bundle reachability analysis remains unperformed. Review this assessment whenever SDK versions, signing, watch configuration or dependency paths change. Expo-compatible upgrades should follow [Expo's official upgrade steps](https://docs.expo.dev/workflow/upgrading-expo-sdk-walkthrough/); audit's suggested Expo 44 downgrade is not a compatible repair for this SDK 57 project.

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
