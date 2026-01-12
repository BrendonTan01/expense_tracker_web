# Deployment Guide - Vercel

This guide explains how to deploy your Expense Tracker app entirely on Vercel using Supabase for the database.

## Overview

Your app will be deployed entirely on Vercel:
- **Frontend**: Static files served by Vercel
- **Backend**: Vercel serverless functions (API routes)
- **Database**: Supabase (PostgreSQL)

## Prerequisites

1. A GitHub account
2. A Supabase account (free tier available)
3. A Vercel account (free tier available)

## Step-by-Step Deployment

### Step 1: Set Up Supabase Database

1. **Create Supabase account**: Go to [supabase.com](https://supabase.com) and sign up
2. **Create a new project**:
   - Click "New Project"
   - Choose a name (e.g., "expense-tracker")
   - Set a database password (save it!)
   - Choose a region
   - Click "Create new project"
3. **Get your API keys**:
   - Go to **Settings** → **API**
   - Copy your **Project URL** (e.g., `https://xxxxx.supabase.co`)
   - Copy your **anon/public key** (starts with `eyJ...`)
4. **Set up database schema**:
   - Go to **SQL Editor** in Supabase
   - Click "New query"
   - Copy and paste the contents of `supabase/schema.sql`
   - Click "Run"

For detailed Supabase setup, see [SUPABASE_SETUP.md](./SUPABASE_SETUP.md)

### Step 2: Push Code to GitHub

1. Make sure your code is committed
2. Push to GitHub:
   ```bash
   git add .
   git commit -m "Ready for Vercel deployment"
   git push origin main
   ```

### Step 3: Deploy to Vercel

1. **Sign up at [vercel.com](https://vercel.com)** with GitHub
2. **Click "Add New Project"** or "New Project"
3. **Import your GitHub repository**
4. **Configure the project**:
   - **Framework Preset**: Vite (should auto-detect)
   - **Root Directory**: `./` (leave as default)
   - **Build Command**: `npm run build` (should auto-fill)
   - **Output Directory**: `dist` (should auto-fill)
5. **Add Environment Variables**:
   - Click **Environment Variables**
   - Add:
     - **Name**: `VITE_SUPABASE_URL`
       **Value**: `https://xxxxx.supabase.co` (your Supabase Project URL)
       **Environments**: ✅ Production, ✅ Preview, ✅ Development
     - **Name**: `VITE_SUPABASE_ANON_KEY`
       **Value**: `eyJ...` (your Supabase anon key)
       **Environments**: ✅ Production, ✅ Preview, ✅ Development
6. **Deploy**: Click "Deploy"
7. **Wait for deployment** (usually 1-2 minutes)
8. **Get your URL**: Vercel will provide a URL like `https://your-app.vercel.app`

### Step 4: Test Your Deployment

1. Visit your Vercel URL
2. Try creating a bucket, transaction, etc.
3. Check Supabase dashboard → **Table Editor** to verify data is being saved
4. Check browser console for any errors

**That's it!** Your app is now live and accessible to anyone with the URL!

## Local Development

To run locally with Supabase:

1. **Create a `.env` file** in the root directory:
   ```env
   VITE_SUPABASE_URL=https://xxxxx.supabase.co
   VITE_SUPABASE_ANON_KEY=eyJ...
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Start development server**:
   ```bash
   npm run dev
   ```

4. Visit `http://localhost:5173`

## How It Works

### Vercel Serverless Functions

Your API routes are in the `api/` directory:
- `api/buckets.js` → `/api/buckets`
- `api/transactions.js` → `/api/transactions`
- `api/recurring.js` → `/api/recurring`
- `api/health.js` → `/api/health`

Vercel automatically converts these to serverless functions.

### Frontend

The frontend is built with Vite and served as static files. API calls use relative URLs (`/api/...`) which work seamlessly with Vercel's serverless functions.

### Database

Supabase provides a PostgreSQL database that works perfectly with serverless functions. Data persists between function invocations.

## Troubleshooting

### "Missing Supabase environment variables" error
- Make sure environment variables are set in Vercel dashboard
- Check that variable names match exactly: `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`
- Make sure variables are enabled for all environments (Production, Preview, Development)
- Redeploy after adding/updating environment variables

### Database connection errors
- Verify your Supabase Project URL is correct (no trailing slash)
- Check that your API keys are correct
- Make sure you ran the schema.sql script in Supabase
- Check Supabase dashboard → **Settings** → **API** for correct values

### Build fails on Vercel
- Check Vercel build logs for specific errors
- Ensure all TypeScript errors are fixed: `npm run build`
- Verify Node.js version (Vercel uses 18+ by default)
- Check that all dependencies are in `package.json`

### API routes return 404
- Make sure files are in the `api/` directory
- Check that file names match the route (e.g., `api/buckets.js` → `/api/buckets`)
- Verify `vercel.json` is configured correctly

### CORS errors
- Supabase handles CORS automatically
- Vercel serverless functions also handle CORS
- If you see CORS errors, check that you're using the correct Supabase URL

### Data not persisting
- Check Supabase dashboard → **Table Editor** to see if data is being saved
- Verify database schema was created correctly
- Check Supabase logs for any errors

## Environment Variables Reference

| Variable | Description | Where to Get It |
|----------|-------------|-----------------|
| `VITE_SUPABASE_URL` | Your Supabase project URL | Supabase Dashboard → Settings → API |
| `VITE_SUPABASE_ANON_KEY` | Your Supabase anon/public key | Supabase Dashboard → Settings → API |

## Cost Comparison

| Service | Free Tier | Notes |
|---------|-----------|-------|
| Vercel | ✅ Yes | Unlimited for personal projects, great CDN |
| Supabase | ✅ Yes | 500MB database, 2GB bandwidth/month |

## Advantages of This Setup

✅ **Everything on one platform** (Vercel)  
✅ **No separate backend service needed**  
✅ **Serverless functions scale automatically**  
✅ **Free tiers available**  
✅ **PostgreSQL database** (more robust than SQLite)  
✅ **Automatic HTTPS**  
✅ **Global CDN** for fast loading  
✅ **Easy to deploy** (just push to GitHub)

## Next Steps

1. **Test your deployed app** thoroughly
2. **Set up custom domain** (optional, Vercel supports this)
3. **Monitor usage** in Vercel and Supabase dashboards
4. **Set up backups** (Supabase has automatic backups on paid plans)

## Need Help?

- [Vercel Documentation](https://vercel.com/docs)
- [Supabase Documentation](https://supabase.com/docs)
- [Vercel Discord](https://vercel.com/discord)
- [Supabase Discord](https://discord.supabase.com)
