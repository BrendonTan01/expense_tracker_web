export interface Bucket {
  id: string;
  name: string;
  color?: string;
}

export interface Transaction {
  id: string;
  type: 'expense' | 'income' | 'investment';
  amount: number;
  description: string;
  bucketId?: string;
  date: string; // ISO format
  isRecurring: boolean;
  recurringId?: string;
  tags?: string[];
  notes?: string;
}

export type RecurringFrequency = 'daily' | 'weekly' | 'fortnightly' | 'monthly' | 'yearly';

export interface RecurringTransaction {
  id: string;
  transaction: Omit<Transaction, 'id' | 'isRecurring' | 'recurringId' | 'date'>;
  frequency: RecurringFrequency;
  startDate: string;
  endDate?: string;
  lastApplied?: string;
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
  summary: string;
}

export interface YearlySummary {
  id: string;
  year: number;
  summary: string;
}

export interface AppState {
  buckets: Bucket[];
  transactions: Transaction[];
  recurringTransactions: RecurringTransaction[];
  budgets: Budget[];
}

export interface TransactionTemplate {
  id: string;
  name: string;
  type: 'expense' | 'income' | 'investment';
  amount?: number;
  description: string;
  bucketId?: string;
  tags?: string[];
  notes?: string;
}

export interface FilterPreset {
  id: string;
  name: string;
  filters: {
    type?: 'expense' | 'income' | 'investment' | 'all';
    bucketId?: string;
    tag?: string;
    startDate?: string;
    endDate?: string;
    minAmount?: number;
    maxAmount?: number;
  };
}
