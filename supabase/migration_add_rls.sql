-- Migration: Add user_id columns and RLS policies
-- This migration adds user_id columns to all tables and creates RLS policies
-- so users can only read, update, and delete their own rows

-- Step 1: Add user_id column to all tables
ALTER TABLE buckets 
ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE recurring_transactions 
ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE transactions 
ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE budgets 
ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE monthly_summaries 
ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE yearly_summaries 
ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- Step 2: Create indexes on user_id for better query performance
CREATE INDEX IF NOT EXISTS idx_buckets_user_id ON buckets(user_id);
CREATE INDEX IF NOT EXISTS idx_recurring_transactions_user_id ON recurring_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_user_id ON transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_budgets_user_id ON budgets(user_id);
CREATE INDEX IF NOT EXISTS idx_monthly_summaries_user_id ON monthly_summaries(user_id);
CREATE INDEX IF NOT EXISTS idx_yearly_summaries_user_id ON yearly_summaries(user_id);

-- Step 3: Update unique constraints to include user_id
-- Drop existing unique constraints if they exist
ALTER TABLE monthly_summaries DROP CONSTRAINT IF EXISTS monthly_summaries_year_month_key;
ALTER TABLE yearly_summaries DROP CONSTRAINT IF EXISTS yearly_summaries_year_key;

-- Add new unique constraints with user_id
ALTER TABLE monthly_summaries ADD CONSTRAINT monthly_summaries_user_year_month_key UNIQUE(user_id, year, month);
ALTER TABLE yearly_summaries ADD CONSTRAINT yearly_summaries_user_year_key UNIQUE(user_id, year);

-- Step 4: Enable RLS on all tables (if not already enabled)
ALTER TABLE buckets ENABLE ROW LEVEL SECURITY;
ALTER TABLE recurring_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE budgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE monthly_summaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE yearly_summaries ENABLE ROW LEVEL SECURITY;

-- Step 5: Create RLS policies for buckets table
-- Policy: Users can SELECT their own buckets
CREATE POLICY "Users can view their own buckets"
ON buckets FOR SELECT
USING (auth.uid() = user_id);

-- Policy: Users can INSERT buckets with their own user_id
CREATE POLICY "Users can insert their own buckets"
ON buckets FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Policy: Users can UPDATE their own buckets
CREATE POLICY "Users can update their own buckets"
ON buckets FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Policy: Users can DELETE their own buckets
CREATE POLICY "Users can delete their own buckets"
ON buckets FOR DELETE
USING (auth.uid() = user_id);

-- Step 6: Create RLS policies for recurring_transactions table
CREATE POLICY "Users can view their own recurring transactions"
ON recurring_transactions FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own recurring transactions"
ON recurring_transactions FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own recurring transactions"
ON recurring_transactions FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own recurring transactions"
ON recurring_transactions FOR DELETE
USING (auth.uid() = user_id);

-- Step 7: Create RLS policies for transactions table
CREATE POLICY "Users can view their own transactions"
ON transactions FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own transactions"
ON transactions FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own transactions"
ON transactions FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own transactions"
ON transactions FOR DELETE
USING (auth.uid() = user_id);

-- Step 8: Create RLS policies for budgets table
CREATE POLICY "Users can view their own budgets"
ON budgets FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own budgets"
ON budgets FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own budgets"
ON budgets FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own budgets"
ON budgets FOR DELETE
USING (auth.uid() = user_id);

-- Step 9: Create RLS policies for monthly_summaries table
CREATE POLICY "Users can view their own monthly summaries"
ON monthly_summaries FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own monthly summaries"
ON monthly_summaries FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own monthly summaries"
ON monthly_summaries FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own monthly summaries"
ON monthly_summaries FOR DELETE
USING (auth.uid() = user_id);

-- Step 10: Create RLS policies for yearly_summaries table
CREATE POLICY "Users can view their own yearly summaries"
ON yearly_summaries FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own yearly summaries"
ON yearly_summaries FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own yearly summaries"
ON yearly_summaries FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own yearly summaries"
ON yearly_summaries FOR DELETE
USING (auth.uid() = user_id);
