-- Create buckets table
CREATE TABLE IF NOT EXISTS buckets (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  color TEXT
);

-- Create recurring_transactions table
CREATE TABLE IF NOT EXISTS recurring_transactions (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK(type IN ('expense', 'income')),
  amount REAL NOT NULL,
  description TEXT NOT NULL,
  bucketId TEXT,
  frequency TEXT NOT NULL CHECK(frequency IN ('daily', 'weekly', 'monthly', 'yearly')),
  startDate TEXT NOT NULL,
  endDate TEXT,
  lastApplied TEXT,
  FOREIGN KEY (bucketId) REFERENCES buckets(id) ON DELETE SET NULL
);

-- Create transactions table
CREATE TABLE IF NOT EXISTS transactions (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK(type IN ('expense', 'income')),
  amount REAL NOT NULL,
  description TEXT NOT NULL,
  bucketId TEXT,
  date TEXT NOT NULL,
  isRecurring INTEGER NOT NULL DEFAULT 0,
  recurringId TEXT,
  FOREIGN KEY (bucketId) REFERENCES buckets(id) ON DELETE SET NULL,
  FOREIGN KEY (recurringId) REFERENCES recurring_transactions(id) ON DELETE SET NULL
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date);
CREATE INDEX IF NOT EXISTS idx_transactions_recurring ON transactions(recurringId);
CREATE INDEX IF NOT EXISTS idx_recurring_start_date ON recurring_transactions(startDate);
