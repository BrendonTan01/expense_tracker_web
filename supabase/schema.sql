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
  tags TEXT, -- JSON array of tags
  notes TEXT, -- Optional notes
  FOREIGN KEY (bucketId) REFERENCES buckets(id) ON DELETE SET NULL,
  FOREIGN KEY (recurringId) REFERENCES recurring_transactions(id) ON DELETE SET NULL
);

-- Create budgets table
CREATE TABLE IF NOT EXISTS budgets (
  id TEXT PRIMARY KEY,
  bucketId TEXT NOT NULL,
  amount REAL NOT NULL,
  period TEXT NOT NULL CHECK(period IN ('monthly', 'yearly')),
  year INTEGER NOT NULL,
  month INTEGER, -- NULL for yearly budgets
  FOREIGN KEY (bucketId) REFERENCES buckets(id) ON DELETE CASCADE
);

-- Create monthly_summaries table
CREATE TABLE IF NOT EXISTS monthly_summaries (
  id TEXT PRIMARY KEY,
  year INTEGER NOT NULL,
  month INTEGER NOT NULL CHECK(month >= 1 AND month <= 12),
  summary TEXT,
  UNIQUE(year, month)
);

-- Create yearly_summaries table
CREATE TABLE IF NOT EXISTS yearly_summaries (
  id TEXT PRIMARY KEY,
  year INTEGER NOT NULL UNIQUE,
  summary TEXT
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date);
CREATE INDEX IF NOT EXISTS idx_transactions_recurring ON transactions(recurringId);
CREATE INDEX IF NOT EXISTS idx_recurring_start_date ON recurring_transactions(startDate);
CREATE INDEX IF NOT EXISTS idx_budgets_bucket_period ON budgets(bucketId, period, year, month);
CREATE INDEX IF NOT EXISTS idx_monthly_summaries_year_month ON monthly_summaries(year, month);
CREATE INDEX IF NOT EXISTS idx_yearly_summaries_year ON yearly_summaries(year);
