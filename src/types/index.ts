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

export interface AppState {
  buckets: Bucket[];
  transactions: Transaction[];
  recurringTransactions: RecurringTransaction[];
}