-- Migration: Fix column name case sensitivity issues
-- This migration renames lowercase columns to quoted camelCase columns
-- Run this if you get errors about columns not existing

-- Note: PostgreSQL stores unquoted identifiers as lowercase
-- We need to rename columns to preserve camelCase for application compatibility

-- Rename columns in recurring_transactions table
DO $$
BEGIN
    -- Check if column exists as lowercase and rename if needed
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'recurring_transactions' 
        AND column_name = 'bucketid'
    ) THEN
        ALTER TABLE recurring_transactions RENAME COLUMN bucketid TO "bucketId";
    END IF;
    
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'recurring_transactions' 
        AND column_name = 'startdate'
    ) THEN
        ALTER TABLE recurring_transactions RENAME COLUMN startdate TO "startDate";
    END IF;
    
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'recurring_transactions' 
        AND column_name = 'enddate'
    ) THEN
        ALTER TABLE recurring_transactions RENAME COLUMN enddate TO "endDate";
    END IF;
    
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'recurring_transactions' 
        AND column_name = 'lastapplied'
    ) THEN
        ALTER TABLE recurring_transactions RENAME COLUMN lastapplied TO "lastApplied";
    END IF;
END $$;

-- Rename columns in transactions table
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'transactions' 
        AND column_name = 'bucketid'
    ) THEN
        ALTER TABLE transactions RENAME COLUMN bucketid TO "bucketId";
    END IF;
    
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'transactions' 
        AND column_name = 'isrecurring'
    ) THEN
        ALTER TABLE transactions RENAME COLUMN isrecurring TO "isRecurring";
    END IF;
    
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'transactions' 
        AND column_name = 'recurringid'
    ) THEN
        ALTER TABLE transactions RENAME COLUMN recurringid TO "recurringId";
    END IF;
END $$;

-- Rename columns in budgets table
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'budgets' 
        AND column_name = 'bucketid'
    ) THEN
        ALTER TABLE budgets RENAME COLUMN bucketid TO "bucketId";
    END IF;
END $$;

-- Drop and recreate indexes with correct column names
DROP INDEX IF EXISTS idx_transactions_recurring;
CREATE INDEX IF NOT EXISTS idx_transactions_recurring ON transactions("recurringId");

DROP INDEX IF EXISTS idx_recurring_start_date;
CREATE INDEX IF NOT EXISTS idx_recurring_start_date ON recurring_transactions("startDate");

DROP INDEX IF EXISTS idx_budgets_bucket_period;
CREATE INDEX IF NOT EXISTS idx_budgets_bucket_period ON budgets("bucketId", period, year, month);
