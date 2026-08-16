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

```bash
cd mobile
npm install
npx expo start
```

- **Package ID**: `com.brendontan.expensetracker`
- **EAS project**: configured in `mobile/app.json` / `mobile/eas.json`
- **Play Store**: published as an **unlisted** listing for personal use (not publicly discoverable)

Production mobile builds and submits use Expo EAS (`eas build` / `eas submit`) from the `mobile/` directory.

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
