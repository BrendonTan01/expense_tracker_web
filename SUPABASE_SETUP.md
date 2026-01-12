# Supabase Setup Guide

This guide will help you set up Supabase for your Expense Tracker app.

## Step 1: Create a Supabase Account

1. Go to [supabase.com](https://supabase.com)
2. Click "Start your project"
3. Sign up with GitHub (recommended) or email
4. Create a new organization (if needed)

## Step 2: Create a New Project

1. Click "New Project"
2. Fill in the details:
   - **Name**: `expense-tracker` (or any name you prefer)
   - **Database Password**: Create a strong password (save this!)
   - **Region**: Choose the closest region to you
   - **Pricing Plan**: Free tier is perfect to start
3. Click "Create new project"
4. Wait 2-3 minutes for the project to be created

## Step 3: Get Your API Keys

1. Once your project is ready, go to **Settings** → **API**
2. You'll see two important values:
   - **Project URL**: Something like `https://xxxxx.supabase.co`
   - **anon/public key**: A long string starting with `eyJ...`
   - **service_role key**: Another long string (keep this secret!)

## Step 4: Set Up the Database Schema

1. Go to **SQL Editor** in the left sidebar
2. Click "New query"
3. Copy and paste the contents of `supabase/schema.sql`
4. Click "Run" (or press Cmd/Ctrl + Enter)
5. You should see "Success. No rows returned"

## Step 5: Configure Environment Variables

### For Local Development

Create a `.env` file in the root of your project:

```env
VITE_SUPABASE_URL=https://xxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ... (your anon key)
```

### For Vercel Deployment

1. Go to your Vercel project dashboard
2. Go to **Settings** → **Environment Variables**
3. Add these variables:

   - **Name**: `VITE_SUPABASE_URL`
     **Value**: `https://xxxxx.supabase.co` (your Project URL)
     **Environments**: Production, Preview, Development

   - **Name**: `VITE_SUPABASE_ANON_KEY`
     **Value**: `eyJ...` (your anon/public key)
     **Environments**: Production, Preview, Development

4. Click "Save"
5. Redeploy your application

## Step 6: Verify the Setup

1. Start your local development server: `npm run dev`
2. Try creating a bucket or transaction
3. Check Supabase dashboard → **Table Editor** to see your data

## Troubleshooting

### "Missing Supabase environment variables" error
- Make sure your `.env` file exists and has the correct variable names
- Restart your dev server after creating/updating `.env`
- For Vercel, make sure environment variables are set for all environments

### Database connection errors
- Verify your Project URL is correct (no trailing slash)
- Check that your API keys are correct
- Make sure you ran the schema.sql script

### CORS errors
- Supabase handles CORS automatically
- If you see CORS errors, check that you're using the correct Supabase URL

## Security Notes

- **Never commit your `.env` file** to Git (it's already in `.gitignore`)
- The **anon key** is safe to use in frontend code (it's public)
- The **service_role key** should NEVER be exposed in frontend code
- For this app, we only need the anon key

## Next Steps

Once Supabase is set up:
1. Deploy to Vercel (see DEPLOYMENT.md)
2. Add environment variables to Vercel
3. Your app will be live!

## Need Help?

- [Supabase Documentation](https://supabase.com/docs)
- [Supabase Discord](https://discord.supabase.com)
- Check the Supabase dashboard for logs and monitoring
