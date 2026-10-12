import React, { createContext, useContext, useState, useRef, useEffect, useCallback, useMemo, ReactNode } from 'react';
import { AppState, Bucket, Transaction, RecurringTransaction, Budget } from '../types';
import { appStateApi, bucketsApi, transactionsApi, recurringApi, budgetsApi, getSessionGeneration, assertSessionGeneration } from '../utils/api';
import { useAuth } from './AuthContext';
import { createTransactionUndo, deleteIndividually, DeleteResult } from '../utils/transactionDeletion';
import { todayIsoLocal } from '../utils/dateHelpers';

interface AppStateContextType {
  state: AppState;
  loading: boolean;
  error: string | null;
  refreshAll: (processRecurring?: boolean) => Promise<void>;
  // Buckets
  addBucket: (bucket: Bucket) => Promise<void>;
  updateBucket: (id: string, updates: Partial<Bucket>) => Promise<void>;
  deleteBucket: (id: string) => Promise<void>;
  // Transactions
  addTransaction: (transaction: Omit<Transaction, 'id'> & { id?: string }) => Promise<void>;
  updateTransaction: (id: string, updates: Partial<Transaction>) => Promise<void>;
  deleteTransaction: (id: string) => Promise<void>;
  deleteTransactions: (ids: string[]) => Promise<DeleteResult>;
  createDeleteUndo: (transactions: Transaction[]) => () => Promise<void>;
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
  const userIdRef = useRef(user?.id);
  const generationRef = useRef(0);
  if (userIdRef.current !== user?.id) {
    userIdRef.current = user?.id;
    generationRef.current += 1;
  }
  const generation = generationRef.current;
  const sessionGeneration = getSessionGeneration();
  const assertActive = useCallback(() => {
    assertSessionGeneration(sessionGeneration);
    if (!user?.id || userIdRef.current !== user.id || generationRef.current !== generation) {
      throw new Error('Your account changed. Please retry from the current account.');
    }
  }, [user?.id, generation, sessionGeneration]);
  const [state, setState] = useState<AppState>(EMPTY_STATE);
  const stateOwner = useRef(sessionGeneration);
  const visibleState = stateOwner.current === sessionGeneration ? state : EMPTY_STATE;
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mutationRevision = useRef(0);
  const refreshSequence = useRef(0);
  const applyMutation = useCallback((update: (previous: AppState) => AppState) => {
    assertActive();
    mutationRevision.current += 1;
    setState(update);
  }, [assertActive]);

  const refreshAll = useCallback(async (processRecurring = true) => {
    if (!user) return;
    assertActive();
    const sequence = ++refreshSequence.current;
    let revision = mutationRevision.current;
    const ownsRefresh = () => userIdRef.current === user.id &&
      generationRef.current === generation && getSessionGeneration() === sessionGeneration &&
      refreshSequence.current === sequence;
    const canApply = () => ownsRefresh() && mutationRevision.current === revision;
    setLoading(true);
    setError(null);
    try {
      const data = await appStateApi.load();
      if (!canApply()) return;
      setState(data);
      // Generate recurring transactions
      if (processRecurring && data.recurringTransactions.length) {
        const result = await recurringApi.process(todayIsoLocal());
        assertActive();
        if (result.available === false) return;
        if (!ownsRefresh()) return;
        // The second read starts after processing; preserve any later local writes.
        revision = mutationRevision.current;
        const processed = await appStateApi.load();
        if (canApply()) setState(processed);
      }
    } catch (err: any) {
      if (canApply()) setError(err.message || 'Failed to load data');
      if (!processRecurring) throw err;
    } finally {
      if (ownsRefresh()) setLoading(false);
    }
  }, [user, generation, assertActive]);

  useEffect(() => {
    stateOwner.current = sessionGeneration;
    setState(EMPTY_STATE);
    setError(null);
    if (user) {
      refreshAll();
    } else {
      setLoading(false);
      setState(EMPTY_STATE);
    }
  }, [user, refreshAll]);

  // Bucket operations
  const addBucket = useCallback(async (bucket: Bucket) => {
    assertActive();
    const created = await bucketsApi.create(bucket);
    assertActive();
    applyMutation(prev => getSessionGeneration() !== sessionGeneration ? prev : ({ ...prev, buckets: [...prev.buckets, created] }));
  }, [assertActive, applyMutation]);

  const updateBucket = useCallback(async (id: string, updates: Partial<Bucket>) => {
    assertActive();
    const updated = await bucketsApi.update(id, updates);
    assertActive();
    applyMutation(prev => getSessionGeneration() !== sessionGeneration ? prev : ({ ...prev, buckets: prev.buckets.map(b => b.id === id ? updated : b) }));
  }, [assertActive, applyMutation]);

  const deleteBucket = useCallback(async (id: string) => {
    assertActive();
    await bucketsApi.delete(id);
    assertActive();
    applyMutation(prev => getSessionGeneration() !== sessionGeneration ? prev : ({ ...prev, buckets: prev.buckets.filter(b => b.id !== id) }));
  }, [assertActive, applyMutation]);

  // Transaction operations
  const addTransaction = useCallback(async (transaction: Omit<Transaction, 'id'> & { id?: string }) => {
    assertActive();
    const created = await transactionsApi.create(transaction);
    assertActive();
    applyMutation(prev => getSessionGeneration() !== sessionGeneration ? prev : ({ ...prev, transactions: [...prev.transactions, created] }));
  }, [assertActive, applyMutation]);

  const updateTransaction = useCallback(async (id: string, updates: Partial<Transaction>) => {
    assertActive();
    const updated = await transactionsApi.update(id, updates);
    assertActive();
    applyMutation(prev => getSessionGeneration() !== sessionGeneration ? prev : ({ ...prev, transactions: prev.transactions.map(t => t.id === id ? updated : t) }));
  }, [assertActive, applyMutation]);

  const deleting = useRef(new Set<string>());
  const deleteTransaction = useCallback(async (id: string) => {
    assertActive();
    if (deleting.current.has(id)) throw new Error('Deletion already in progress');
    deleting.current.add(id);
    try { await transactionsApi.delete(id); }
    finally { deleting.current.delete(id); }
    assertActive();
    applyMutation(prev => getSessionGeneration() !== sessionGeneration ? prev : ({ ...prev, transactions: prev.transactions.filter(t => t.id !== id) }));
  }, [assertActive, applyMutation]);

  const deleteTransactions = useCallback(async (ids: string[]) => {
    assertActive();
    return deleteIndividually(ids, async id => {
      if (deleting.current.has(id)) throw new Error('Deletion already in progress');
      deleting.current.add(id);
      try { await transactionsApi.delete(id); }
      finally { deleting.current.delete(id); }
    }, id => applyMutation(prev => getSessionGeneration() !== sessionGeneration ? prev : ({ ...prev, transactions: prev.transactions.filter(t => t.id !== id) })), assertActive);
  }, [assertActive, applyMutation]);

  const createDeleteUndo = useCallback((transactions: Transaction[]) => {
    assertActive();
    return createTransactionUndo(transactions, transactionsApi, restored => {
      applyMutation(prev => getSessionGeneration() !== sessionGeneration ? prev : ({ ...prev, transactions: [...prev.transactions.filter(t => t.id !== restored.id), restored] }));
    }, assertActive);
  }, [assertActive, applyMutation]);

  // Recurring operations
  const addRecurring = useCallback(async (recurring: RecurringTransaction) => {
    assertActive();
    const created = await recurringApi.create(recurring);
    assertActive();
    applyMutation(prev => getSessionGeneration() !== sessionGeneration ? prev : ({ ...prev, recurringTransactions: [...prev.recurringTransactions, created] }));
  }, [assertActive, applyMutation]);

  const updateRecurring = useCallback(async (id: string, updates: Partial<RecurringTransaction>) => {
    assertActive();
    const updated = await recurringApi.update(id, updates);
    assertActive();
    applyMutation(prev => getSessionGeneration() !== sessionGeneration ? prev : ({ ...prev, recurringTransactions: prev.recurringTransactions.map(r => r.id === id ? updated : r) }));
  }, [assertActive, applyMutation]);

  const deleteRecurring = useCallback(async (id: string) => {
    assertActive();
    await recurringApi.delete(id);
    assertActive();
    applyMutation(prev => getSessionGeneration() !== sessionGeneration ? prev : ({ ...prev, recurringTransactions: prev.recurringTransactions.filter(r => r.id !== id) }));
  }, [assertActive, applyMutation]);

  // Budget operations
  const addBudget = useCallback(async (budget: Budget) => {
    assertActive();
    const created = await budgetsApi.create(budget);
    assertActive();
    applyMutation(prev => getSessionGeneration() !== sessionGeneration ? prev : ({ ...prev, budgets: [...prev.budgets, created] }));
  }, [assertActive, applyMutation]);

  const updateBudget = useCallback(async (id: string, updates: Partial<Budget>) => {
    assertActive();
    const updated = await budgetsApi.update(id, updates);
    assertActive();
    applyMutation(prev => getSessionGeneration() !== sessionGeneration ? prev : ({ ...prev, budgets: prev.budgets.map(b => b.id === id ? updated : b) }));
  }, [assertActive, applyMutation]);

  const deleteBudget = useCallback(async (id: string) => {
    assertActive();
    await budgetsApi.delete(id);
    assertActive();
    applyMutation(prev => getSessionGeneration() !== sessionGeneration ? prev : ({ ...prev, budgets: prev.budgets.filter(b => b.id !== id) }));
  }, [assertActive, applyMutation]);

  const value = useMemo(() => ({
    state: visibleState, loading, error: stateOwner.current === sessionGeneration ? error : null, refreshAll,
    addBucket, updateBucket, deleteBucket,
    addTransaction, updateTransaction, deleteTransaction, deleteTransactions, createDeleteUndo,
    addRecurring, updateRecurring, deleteRecurring,
    addBudget, updateBudget, deleteBudget,
  }), [visibleState, loading, error, refreshAll, addBucket, updateBucket, deleteBucket, addTransaction, updateTransaction, deleteTransaction, deleteTransactions, createDeleteUndo, addRecurring, updateRecurring, deleteRecurring, addBudget, updateBudget, deleteBudget]);

  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>;
}

export function useAppState() {
  const ctx = useContext(AppStateContext);
  if (!ctx) throw new Error('useAppState must be used within an AppStateProvider');
  return ctx;
}
