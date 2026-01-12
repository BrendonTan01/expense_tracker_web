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
  
  // Create tables
  db.exec(`
    CREATE TABLE IF NOT EXISTS buckets (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      color TEXT
    );
    
    CREATE TABLE IF NOT EXISTS transactions (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL CHECK(type IN ('expense', 'income')),
      amount REAL NOT NULL,
      description TEXT NOT NULL,
      bucketId TEXT,
      date TEXT NOT NULL,
      isRecurring INTEGER NOT NULL DEFAULT 0,
      recurringId TEXT,
      tags TEXT,
      notes TEXT,
      FOREIGN KEY (bucketId) REFERENCES buckets(id) ON DELETE SET NULL,
      FOREIGN KEY (recurringId) REFERENCES recurring_transactions(id) ON DELETE SET NULL
    );
    
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
    
    CREATE TABLE IF NOT EXISTS budgets (
      id TEXT PRIMARY KEY,
      bucketId TEXT NOT NULL,
      amount REAL NOT NULL,
      period TEXT NOT NULL CHECK(period IN ('monthly', 'yearly')),
      year INTEGER NOT NULL,
      month INTEGER,
      FOREIGN KEY (bucketId) REFERENCES buckets(id) ON DELETE CASCADE
    );
    
    CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date);
    CREATE INDEX IF NOT EXISTS idx_transactions_recurring ON transactions(recurringId);
    CREATE INDEX IF NOT EXISTS idx_recurring_start_date ON recurring_transactions(startDate);
    CREATE INDEX IF NOT EXISTS idx_budgets_bucket_period ON budgets(bucketId, period, year, month);
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
