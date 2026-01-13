import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

let db;

export function initDatabase() {
  const dbPath = join(__dirname, 'expense_tracker.db');
  db = new Database(dbPath);
  
  // Enable foreign keys
  db.pragma('foreign_keys = ON');
  
  // Create users table
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
  
  // Create tables with user_id
  db.exec(`
    CREATE TABLE IF NOT EXISTS buckets (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      color TEXT,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    
    CREATE TABLE IF NOT EXISTS transactions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('expense', 'income')),
      amount REAL NOT NULL,
      description TEXT NOT NULL,
      bucketId TEXT,
      date TEXT NOT NULL,
      isRecurring INTEGER NOT NULL DEFAULT 0,
      recurringId TEXT,
      tags TEXT,
      notes TEXT,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (bucketId) REFERENCES buckets(id) ON DELETE SET NULL,
      FOREIGN KEY (recurringId) REFERENCES recurring_transactions(id) ON DELETE SET NULL
    );
    
    CREATE TABLE IF NOT EXISTS recurring_transactions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('expense', 'income')),
      amount REAL NOT NULL,
      description TEXT NOT NULL,
      bucketId TEXT,
      frequency TEXT NOT NULL CHECK(frequency IN ('daily', 'weekly', 'monthly', 'yearly')),
      startDate TEXT NOT NULL,
      endDate TEXT,
      lastApplied TEXT,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (bucketId) REFERENCES buckets(id) ON DELETE SET NULL
    );
    
    CREATE TABLE IF NOT EXISTS budgets (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      bucketId TEXT NOT NULL,
      amount REAL NOT NULL,
      period TEXT NOT NULL CHECK(period IN ('monthly', 'yearly')),
      year INTEGER NOT NULL,
      month INTEGER,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (bucketId) REFERENCES buckets(id) ON DELETE CASCADE
    );
    
    CREATE TABLE IF NOT EXISTS monthly_summaries (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      year INTEGER NOT NULL,
      month INTEGER NOT NULL CHECK(month >= 1 AND month <= 12),
      summary TEXT,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      UNIQUE(user_id, year, month)
    );
    
    CREATE TABLE IF NOT EXISTS yearly_summaries (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      year INTEGER NOT NULL,
      summary TEXT,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      UNIQUE(user_id, year)
    );
  `);
  
  // Migrate existing data: Add user_id column to existing tables if they don't have it
  // This handles the case where the database already exists
  try {
    const tables = ['buckets', 'transactions', 'recurring_transactions', 'budgets', 'monthly_summaries', 'yearly_summaries'];
    for (const table of tables) {
      const tableInfo = db.prepare(`PRAGMA table_info(${table})`).all();
      const hasUserId = tableInfo.some(col => col.name === 'user_id');
      if (!hasUserId) {
        db.exec(`ALTER TABLE ${table} ADD COLUMN user_id TEXT`);
        // For existing data, we'll leave user_id as NULL (they'll need to be cleaned up or migrated)
        // New data will require user_id
      }
    }
  } catch (error) {
    // Ignore errors if columns already exist or table doesn't exist yet
    console.log('Migration note:', error.message);
  }
  
  // Create indexes
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
    CREATE INDEX IF NOT EXISTS idx_buckets_user_id ON buckets(user_id);
    CREATE INDEX IF NOT EXISTS idx_transactions_user_id ON transactions(user_id);
    CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date);
    CREATE INDEX IF NOT EXISTS idx_transactions_recurring ON transactions(recurringId);
    CREATE INDEX IF NOT EXISTS idx_recurring_user_id ON recurring_transactions(user_id);
    CREATE INDEX IF NOT EXISTS idx_recurring_start_date ON recurring_transactions(startDate);
    CREATE INDEX IF NOT EXISTS idx_budgets_user_id ON budgets(user_id);
    CREATE INDEX IF NOT EXISTS idx_budgets_bucket_period ON budgets(bucketId, period, year, month);
    CREATE INDEX IF NOT EXISTS idx_monthly_summaries_user_id ON monthly_summaries(user_id);
    CREATE INDEX IF NOT EXISTS idx_monthly_summaries_year_month ON monthly_summaries(year, month);
    CREATE INDEX IF NOT EXISTS idx_yearly_summaries_user_id ON yearly_summaries(user_id);
    CREATE INDEX IF NOT EXISTS idx_yearly_summaries_year ON yearly_summaries(year);
  `);
  
  console.log('Database initialized successfully');
  return db;
}

export function getDatabase() {
  if (!db) {
    return initDatabase();
  }
  return db;
}
