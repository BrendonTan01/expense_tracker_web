export interface Bucket {
  id: string;
  name: string;
  color?: string;
}

export interface Transaction {
  id: string;
  type: 'expense' | 'income';
  amount: number;
  description: string;
  bucketId?: string; // Only for expenses
  date: string; // ISO format
  isRecurring: boolean;
  recurringId?: string; // Link to RecurringTransaction if applicable
  tags?: string[]; // Array of tags
  notes?: string; // Optional notes
}

export type RecurringFrequency = 'daily' | 'weekly' | 'monthly' | 'yearly';

export interface RecurringTransaction {
  id: string;
  transaction: Omit<Transaction, 'id' | 'isRecurring' | 'recurringId' | 'date'>;
  frequency: RecurringFrequency;
  startDate: string; // ISO format
  endDate?: string; // ISO format, optional
  lastApplied?: string; // Last date transaction was generated (ISO format)
}

export interface Budget {
  id: string;
  bucketId: string;
  amount: number;
  period: 'monthly' | 'yearly';
  year: number;
  month?: number; // 1-12 for monthly, undefined for yearly
}

export interface MonthlySummary {
  id: string;
  year: number;
  month: number; // 1-12
  summary: string; // Text summary/notes for the month
}

export interface YearlySummary {
  id: string;
  year: number;
  summary: string; // Text summary/notes for the year
}

export interface AppState {
  buckets: Bucket[];
  transactions: Transaction[];
  recurringTransactions: RecurringTransaction[];
  budgets: Budget[];
}