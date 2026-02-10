import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, ReactNode } from 'react';
import { AppState, Bucket, Transaction, RecurringTransaction, Budget } from '../types';
import { appStateApi, bucketsApi, transactionsApi, recurringApi, budgetsApi } from '../utils/api';
import { useAuth } from './AuthContext';
import { todayIsoLocal, getOccurrenceDatesUpTo } from '../utils/dateHelpers';
import { generateId } from '../utils/storage';

interface AppStateContextType {
  state: AppState;
  loading: boolean;
  error: string | null;
  refreshAll: () => Promise<void>;
  // Buckets
  addBucket: (bucket: Bucket) => Promise<void>;
  updateBucket: (id: string, updates: Partial<Bucket>) => Promise<void>;
  deleteBucket: (id: string) => Promise<void>;
  // Transactions
  addTransaction: (transaction: Omit<Transaction, 'id'> & { id?: string }) => Promise<void>;
  updateTransaction: (id: string, updates: Partial<Transaction>) => Promise<void>;
  deleteTransaction: (id: string) => Promise<void>;
  deleteTransactions: (ids: string[]) => Promise<void>;
  // Recurring
  addRecurring: (recurring: RecurringTransaction) => Promise<void>;
  updateRecurring: (id: string, updates: Partial<RecurringTransaction>) => Promise<void>;
  deleteRecurring: (id: string) => Promise<void>;
  // Budgets
  addBudget: (budget: Budget) => Promise<void>;
  updateBudget: (id: string, updates: Partial<Budget>) => Promise<void>;
  deleteBudget: (id: string) => Promise<void>;
}

const AppStateContext = createContext<AppStateContextType | undefined>(undefined);

const EMPTY_STATE: AppState = {
  buckets: [],
  transactions: [],
  recurringTransactions: [],
  budgets: [],
};

export function AppStateProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [state, setState] = useState<AppState>(EMPTY_STATE);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshAll = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const data = await appStateApi.load();
      setState(data);
      // Generate recurring transactions
      await generateRecurringTransactions(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load data');
    } finally {
      setLoading(false);
    }
  }, [user]);

  const generateRecurringTransactions = useCallback(async (currentState: AppState) => {
    const today = todayIsoLocal();
    let hasNewTransactions = false;

    for (const recurring of currentState.recurringTransactions) {
      const dates = getOccurrenceDatesUpTo(
        recurring.frequency,
        recurring.startDate,
        recurring.endDate,
        recurring.lastApplied,
        today
      );

      for (const date of dates) {
        const newTransaction: any = {
          id: generateId(),
          ...recurring.transaction,
          date,
          isRecurring: true,
          recurringId: recurring.id,
        };

        try {
          await transactionsApi.create(newTransaction);
          hasNewTransactions = true;
        } catch (err) {
          console.error('Failed to generate recurring transaction:', err);
        }
      }

      if (dates.length > 0) {
        const lastDate = dates[dates.length - 1];
        try {
          await recurringApi.update(recurring.id, { lastApplied: lastDate });
        } catch (err) {
          console.error('Failed to update lastApplied:', err);
        }
      }
    }

    if (hasNewTransactions) {
      // Reload to get the new transactions
      try {
        const data = await appStateApi.load();
        setState(data);
      } catch (err) {
        console.error('Failed to reload after generating recurring transactions:', err);
      }
    }
  }, []);

  useEffect(() => {
    if (user) {
      refreshAll();
    } else {
      setState(EMPTY_STATE);
    }
  }, [user, refreshAll]);

  // Bucket operations
  const addBucket = useCallback(async (bucket: Bucket) => {
    const created = await bucketsApi.create(bucket);
    setState(prev => ({ ...prev, buckets: [...prev.buckets, created] }));
  }, []);

  const updateBucket = useCallback(async (id: string, updates: Partial<Bucket>) => {
    const updated = await bucketsApi.update(id, updates);
    setState(prev => ({ ...prev, buckets: prev.buckets.map(b => b.id === id ? updated : b) }));
  }, []);

  const deleteBucket = useCallback(async (id: string) => {
    await bucketsApi.delete(id);
    setState(prev => ({ ...prev, buckets: prev.buckets.filter(b => b.id !== id) }));
  }, []);

  // Transaction operations
  const addTransaction = useCallback(async (transaction: Omit<Transaction, 'id'> & { id?: string }) => {
    const created = await transactionsApi.create(transaction);
    setState(prev => ({ ...prev, transactions: [...prev.transactions, created] }));
  }, []);

  const updateTransaction = useCallback(async (id: string, updates: Partial<Transaction>) => {
    const updated = await transactionsApi.update(id, updates);
    setState(prev => ({ ...prev, transactions: prev.transactions.map(t => t.id === id ? updated : t) }));
  }, []);

  const deleteTransaction = useCallback(async (id: string) => {
    await transactionsApi.delete(id);
    setState(prev => ({ ...prev, transactions: prev.transactions.filter(t => t.id !== id) }));
  }, []);

  const deleteTransactions = useCallback(async (ids: string[]) => {
    await Promise.all(ids.map(id => transactionsApi.delete(id)));
    setState(prev => ({ ...prev, transactions: prev.transactions.filter(t => !ids.includes(t.id)) }));
  }, []);

  // Recurring operations
  const addRecurring = useCallback(async (recurring: RecurringTransaction) => {
    const created = await recurringApi.create(recurring);
    setState(prev => ({ ...prev, recurringTransactions: [...prev.recurringTransactions, created] }));
  }, []);

  const updateRecurring = useCallback(async (id: string, updates: Partial<RecurringTransaction>) => {
    const updated = await recurringApi.update(id, updates);
    setState(prev => ({ ...prev, recurringTransactions: prev.recurringTransactions.map(r => r.id === id ? updated : r) }));
  }, []);

  const deleteRecurring = useCallback(async (id: string) => {
    await recurringApi.delete(id);
    setState(prev => ({ ...prev, recurringTransactions: prev.recurringTransactions.filter(r => r.id !== id) }));
  }, []);

  // Budget operations
  const addBudget = useCallback(async (budget: Budget) => {
    const created = await budgetsApi.create(budget);
    setState(prev => ({ ...prev, budgets: [...prev.budgets, created] }));
  }, []);

  const updateBudget = useCallback(async (id: string, updates: Partial<Budget>) => {
    const updated = await budgetsApi.update(id, updates);
    setState(prev => ({ ...prev, budgets: prev.budgets.map(b => b.id === id ? updated : b) }));
  }, []);

  const deleteBudget = useCallback(async (id: string) => {
    await budgetsApi.delete(id);
    setState(prev => ({ ...prev, budgets: prev.budgets.filter(b => b.id !== id) }));
  }, []);

  const value = useMemo(() => ({
    state, loading, error, refreshAll,
    addBucket, updateBucket, deleteBucket,
    addTransaction, updateTransaction, deleteTransaction, deleteTransactions,
    addRecurring, updateRecurring, deleteRecurring,
    addBudget, updateBudget, deleteBudget,
  }), [state, loading, error, refreshAll, addBucket, updateBucket, deleteBucket, addTransaction, updateTransaction, deleteTransaction, deleteTransactions, addRecurring, updateRecurring, deleteRecurring, addBudget, updateBudget, deleteBudget]);

  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>;
}

export function useAppState() {
  const ctx = useContext(AppStateContext);
  if (!ctx) throw new Error('useAppState must be used within an AppStateProvider');
  return ctx;
}
