-- Create buckets table
CREATE TABLE IF NOT EXISTS buckets (
  id TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT
);

-- Create recurring_transactions table
CREATE TABLE IF NOT EXISTS recurring_transactions (
  id TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
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
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
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
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
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
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  year INTEGER NOT NULL,
  month INTEGER NOT NULL CHECK(month >= 1 AND month <= 12),
  summary TEXT,
  UNIQUE(user_id, year, month)
);

-- Create yearly_summaries table
CREATE TABLE IF NOT EXISTS yearly_summaries (
  id TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  year INTEGER NOT NULL,
  summary TEXT,
  UNIQUE(user_id, year)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_buckets_user_id ON buckets(user_id);
CREATE INDEX IF NOT EXISTS idx_recurring_transactions_user_id ON recurring_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_user_id ON transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date);
CREATE INDEX IF NOT EXISTS idx_transactions_recurring ON transactions(recurringId);
CREATE INDEX IF NOT EXISTS idx_recurring_start_date ON recurring_transactions(startDate);
CREATE INDEX IF NOT EXISTS idx_budgets_user_id ON budgets(user_id);
CREATE INDEX IF NOT EXISTS idx_budgets_bucket_period ON budgets(bucketId, period, year, month);
CREATE INDEX IF NOT EXISTS idx_monthly_summaries_user_id ON monthly_summaries(user_id);
CREATE INDEX IF NOT EXISTS idx_monthly_summaries_year_month ON monthly_summaries(year, month);
CREATE INDEX IF NOT EXISTS idx_yearly_summaries_user_id ON yearly_summaries(user_id);
CREATE INDEX IF NOT EXISTS idx_yearly_summaries_year ON yearly_summaries(year);

-- Enable Row Level Security
ALTER TABLE buckets ENABLE ROW LEVEL SECURITY;
ALTER TABLE recurring_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE budgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE monthly_summaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE yearly_summaries ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Users can only access their own rows
-- Buckets policies
CREATE POLICY "Users can view their own buckets" ON buckets FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own buckets" ON buckets FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own buckets" ON buckets FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete their own buckets" ON buckets FOR DELETE USING (auth.uid() = user_id);

-- Recurring transactions policies
CREATE POLICY "Users can view their own recurring transactions" ON recurring_transactions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own recurring transactions" ON recurring_transactions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own recurring transactions" ON recurring_transactions FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete their own recurring transactions" ON recurring_transactions FOR DELETE USING (auth.uid() = user_id);

-- Transactions policies
CREATE POLICY "Users can view their own transactions" ON transactions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own transactions" ON transactions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own transactions" ON transactions FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete their own transactions" ON transactions FOR DELETE USING (auth.uid() = user_id);

-- Budgets policies
CREATE POLICY "Users can view their own budgets" ON budgets FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own budgets" ON budgets FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own budgets" ON budgets FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete their own budgets" ON budgets FOR DELETE USING (auth.uid() = user_id);

-- Monthly summaries policies
CREATE POLICY "Users can view their own monthly summaries" ON monthly_summaries FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own monthly summaries" ON monthly_summaries FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own monthly summaries" ON monthly_summaries FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete their own monthly summaries" ON monthly_summaries FOR DELETE USING (auth.uid() = user_id);

-- Yearly summaries policies
CREATE POLICY "Users can view their own yearly summaries" ON yearly_summaries FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own yearly summaries" ON yearly_summaries FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own yearly summaries" ON yearly_summaries FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete their own yearly summaries" ON yearly_summaries FOR DELETE USING (auth.uid() = user_id);
