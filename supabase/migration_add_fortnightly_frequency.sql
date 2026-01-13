-- Migration: Add 'fortnightly' to recurring_transactions frequency constraint
-- This migration updates the check constraint to allow 'fortnightly' frequency

-- Drop the existing constraint
-- PostgreSQL may auto-generate constraint names, so we'll drop by finding the constraint name
DO $$
DECLARE
    constraint_name TEXT;
BEGIN
    -- Find the constraint name for the frequency check
    SELECT conname INTO constraint_name
    FROM pg_constraint
    WHERE conrelid = 'recurring_transactions'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%frequency%';
    
    -- Drop the constraint if it exists
    IF constraint_name IS NOT NULL THEN
        EXECUTE format('ALTER TABLE recurring_transactions DROP CONSTRAINT %I', constraint_name);
    END IF;
END $$;

-- Add the new constraint with 'fortnightly' included
ALTER TABLE recurring_transactions 
ADD CONSTRAINT recurring_transactions_frequency_check 
CHECK (frequency IN ('daily', 'weekly', 'fortnightly', 'monthly', 'yearly'));
