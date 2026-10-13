import { BackupData } from './utils/backup';
import { useState, useEffect, useRef, Component, ReactNode, Suspense, lazy } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppState, Transaction, Bucket, RecurringTransaction, Budget, TransactionTemplate } from './types';
import { generateId } from './utils/storage';
import { backupApi, appStateApi, bucketsApi, transactionsApi, recurringApi, budgetsApi, RecurringEditPatch } from './utils/api';
import { todayIsoLocal } from './utils/dateHelpers';
import { useAuth } from './contexts/AuthContext';
import BucketManager from './components/BucketManager';
import TransactionForm from './components/TransactionForm';
import TransactionList from './components/TransactionList';
import Settings from './components/Settings';
import DataBackup from './components/DataBackup';
import TransactionTemplates from './components/TransactionTemplates';

// Lazy load heavy components to reduce initial bundle size
const Summary = lazy(() => import('./components/Summary'));
const RecurringTransactionManager = lazy(() => import('./components/RecurringTransactionManager'));
const BudgetManager = lazy(() => import('./components/BudgetManager'));
const Reflections = lazy(() => import('./components/Reflections'));
const CalendarView = lazy(() => import('./components/CalendarView'));

type Tab =
  | 'summary'
  | 'calendar'
  | 'transactions'
  | 'reflections'
  | 'settings'
  | 'buckets'
  | 'recurring'
  | 'budgets';

// Error Boundary Component
class ErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean; error: Error | null }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: any) {
    console.error('Error caught by boundary:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '2rem', textAlign: 'center' }}>
          <h2>Something went wrong</h2>
          <p>{this.state.error?.message || 'An unexpected error occurred'}</p>
          <button onClick={() => this.setState({ hasError: false, error: null })}>
            Try again
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

function App() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [state, setState] = useState<AppState>({
    buckets: [],
    transactions: [],
    recurringTransactions: [],
    budgets: [],
  });
  const [activeTab, setActiveTab] = useState<Tab>('summary');
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionStatus, setActionStatus] = useState<{ phase: 'pending' | 'success'; message: string } | null>(null);
  const userIdRef = useRef(user?.id);
  userIdRef.current = user?.id;
  const stateRef = useRef(state);
  stateRef.current = state;
  const accountLifetime = useRef({ id: user?.id, mounted: true });
  if (accountLifetime.current.id !== user?.id) accountLifetime.current = { id: user?.id, mounted: true };
  useEffect(() => {
    const owner = accountLifetime.current;
    owner.mounted = true;
    return () => { owner.mounted = false; };
  }, [user?.id]);
  const readSequence = useRef(0);
  const ownsAccount = (owner: typeof accountLifetime.current) => owner.mounted && accountLifetime.current === owner;
  const showSaved = (owner: typeof accountLifetime.current, message: string) => {
    if (!ownsAccount(owner)) return;
    setActionStatus({ phase: 'success', message });
    setTimeout(() => { if (ownsAccount(owner)) setActionStatus(current => current?.message === message ? null : current); }, 2000);
  };


  // Load state from API on mount (only when user is authenticated)
  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }

    const owner = accountLifetime.current;
    const sequence = ++readSequence.current;
    const active = () => ownsAccount(owner) && readSequence.current === sequence;
    const loadData = async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await appStateApi.load();
        if (active()) setState(data);
      } catch (err) {
        if (!active()) return;
        const errorMessage = err instanceof Error ? err.message : 'Failed to load data';
        setError(errorMessage);
        console.error('Failed to load data:', err);
        // Don't block the UI - allow user to see the app even if API fails
        // They'll see the error message but can still interact
      } finally {
        if (active()) setLoading(false);
      }
    };
    loadData();
  }, [user]);

  // Trigger recurring generation when tab becomes visible (e.g. user returns next day)
  const [visibilityTrigger, setVisibilityTrigger] = useState(0);
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        setVisibilityTrigger((n) => n + 1);
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);

  // The server commits occurrences and schedule progress together. No client fallback.
  useEffect(() => {
    if (loading || !user || !stateRef.current.recurringTransactions.length) return;
    let cancelled = false;
    const sequence = readSequence.current;
    const owner = accountLifetime.current;
    const active = () => !cancelled && ownsAccount(owner) && readSequence.current === sequence;
    const process = async () => {
      try {
        const now = new Date();
        const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
        const result = await recurringApi.process(today);
        if (result.available === false) return;
        const data = await appStateApi.load();
        if (active()) setState(data);
      } catch (err) {
        if (active()) setError(err instanceof Error ? err.message : 'Recurring entries could not be processed. Please retry later.');
      }
    };
    void process();
    return () => { cancelled = true; };
  }, [loading, visibilityTrigger, user]);

  const handleAddBucket = async (bucket: Bucket) => {
    const owner = accountLifetime.current;
    try {
      setActionStatus({ phase: 'pending', message: 'Saving bucket...' });
      const newBucket = await bucketsApi.create(bucket);
      if (!ownsAccount(owner)) return;
      ++readSequence.current;
      setState((prev) => ({
        ...prev,
        buckets: [...prev.buckets, newBucket],
      }));
      setActionStatus({ phase: 'success', message: 'Bucket saved' });
      setTimeout(() => { if (ownsAccount(owner)) setActionStatus(null); }, 2000);
    } catch (err) {
      if (!ownsAccount(owner)) return;
      setActionStatus(null);
      setError(err instanceof Error ? err.message : 'Failed to create bucket');
      console.error('Failed to create bucket:', err);
    }
  };

  const handleUpdateBucket = async (id: string, updates: Partial<Bucket>) => {
    const owner = accountLifetime.current;
    try {
      setActionStatus({ phase: 'pending', message: 'Updating bucket...' });
      const updatedBucket = await bucketsApi.update(id, updates);
      if (!ownsAccount(owner)) return;
      ++readSequence.current;
      setState((prev) => ({
        ...prev,
        buckets: prev.buckets.map((b) => (b.id === id ? updatedBucket : b)),
      }));
      setActionStatus({ phase: 'success', message: 'Bucket updated' });
      setTimeout(() => { if (ownsAccount(owner)) setActionStatus(null); }, 2000);
    } catch (err) {
      if (!ownsAccount(owner)) return;
      setActionStatus(null);
      setError(err instanceof Error ? err.message : 'Failed to update bucket');
      console.error('Failed to update bucket:', err);
    }
  };

  const handleDeleteBucket = async (id: string) => {
    const owner = accountLifetime.current;
    try {
      setActionStatus({ phase: 'pending', message: 'Deleting bucket...' });
      await bucketsApi.delete(id);
      if (!ownsAccount(owner)) return;
      ++readSequence.current;
      setState((prev) => ({
        ...prev,
        buckets: prev.buckets.filter((b) => b.id !== id),
      }));
      setActionStatus({ phase: 'success', message: 'Bucket deleted' });
      setTimeout(() => { if (ownsAccount(owner)) setActionStatus(null); }, 2000);
    } catch (err) {
      if (!ownsAccount(owner)) return;
      setActionStatus(null);
      setError(err instanceof Error ? err.message : 'Failed to delete bucket');
      console.error('Failed to delete bucket:', err);
    }
  };

  const handleAddTransaction = async (transactionData: Omit<Transaction, 'id' | 'isRecurring' | 'recurringId'>) => {
    const owner = accountLifetime.current;
    // Prevent adding expense transactions if no buckets exist
    if (transactionData.type === 'expense' && state.buckets.length === 0) {
      setError('Please create at least one bucket before adding expense transactions.');
      setActiveTab('buckets');
      return;
    }

    try {
      setActionStatus({
        phase: 'pending',
        message: editingTransaction ? 'Updating transaction...' : 'Saving transaction...',
      });
      if (editingTransaction) {
        const updatedTransaction = await transactionsApi.update(editingTransaction.id, {
          ...transactionData,
          isRecurring: editingTransaction.isRecurring,
          recurringId: editingTransaction.recurringId,
        });
        if (!ownsAccount(owner)) return;
        ++readSequence.current;
        setState((prev) => ({
          ...prev,
          transactions: prev.transactions.map((t) =>
            t.id === editingTransaction.id ? updatedTransaction : t
          ),
        }));
        setEditingTransaction(null);
        setActionStatus({ phase: 'success', message: 'Transaction updated' });
      } else {
        const newTransaction = await transactionsApi.create({
          ...transactionData,
          id: generateId(),
          isRecurring: false,
        });
        if (!ownsAccount(owner)) return;
        ++readSequence.current;
        setState((prev) => ({
          ...prev,
          transactions: [...prev.transactions, newTransaction],
        }));
        setActionStatus({ phase: 'success', message: 'Transaction saved' });
      }
      setTimeout(() => { if (ownsAccount(owner)) setActionStatus(null); }, 2000);
    } catch (err) {
      if (!ownsAccount(owner)) return;
      setActionStatus(null);
      setError(err instanceof Error ? err.message : 'Failed to save transaction');
      console.error('Failed to save transaction:', err);
    }
  };

  const handleDuplicateTransaction = (transaction: Transaction) => {
    setEditingTransaction(null);
    handleAddTransaction({
      type: transaction.type,
      amount: transaction.amount,
      description: transaction.description,
      bucketId: transaction.bucketId,
      date: todayIsoLocal(),
      tags: transaction.tags,
      notes: transaction.notes,
    });
  };

  const handleCreateRecurringFromTransaction = async (transaction: Transaction) => {
    if (!transaction.bucketId && transaction.type === 'expense') {
      setError('Expense transactions need a bucket to create a recurring transaction.');
      return;
    }

    try {
      const newRecurring: RecurringTransaction = {
        id: generateId(),
        transaction: {
          type: transaction.type,
          amount: transaction.amount,
          description: transaction.description,
          bucketId: transaction.bucketId,
          tags: transaction.tags,
          notes: transaction.notes,
        },
        frequency: 'monthly',
        startDate: transaction.date,
      };
      await handleAddRecurring(newRecurring);
      setActiveTab('recurring');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create recurring transaction');
      console.error('Failed to create recurring transaction:', err);
    }
  };

  const handleBulkDeleteTransactions = async (ids: string[]) => {
    const owner = accountLifetime.current;
    try {
      setActionStatus({ phase: 'pending', message: 'Deleting transactions...' });
      await Promise.all(ids.map(id => transactionsApi.delete(id)));
      if (!ownsAccount(owner)) return;
      ++readSequence.current;
      setState((prev) => ({
        ...prev,
        transactions: prev.transactions.filter(t => !ids.includes(t.id)),
      }));
      setActionStatus({ phase: 'success', message: 'Transactions deleted' });
      setTimeout(() => { if (ownsAccount(owner)) setActionStatus(null); }, 2000);
    } catch (err) {
      if (!ownsAccount(owner)) return;
      setActionStatus(null);
      setError(err instanceof Error ? err.message : 'Failed to delete transactions');
      console.error('Failed to delete transactions:', err);
    }
  };

  const handleUseTemplate = (template: TransactionTemplate) => {
    setEditingTransaction(null);
    // Templates always use system date by default when used
    const systemDate = todayIsoLocal();
    handleAddTransaction({
      type: template.type,
      amount: template.amount || 0,
      description: template.description,
      bucketId: template.bucketId,
      date: systemDate,
      tags: template.tags,
      notes: template.notes,
    });
  };

  const handleImportData = async (backup: BackupData) => {
    const owner = accountLifetime.current;
    if (!user) throw new Error('Sign in before restoring a backup.');
    await backupApi.restore(backup, user.id);
    // Do not generate new occurrences during restore; show the restored snapshot.
    try {
      const sequence = ++readSequence.current;
      const restored = await appStateApi.load();
      if (!ownsAccount(owner)) return;
      if (readSequence.current !== sequence) throw new Error('Concurrent change while refreshing restored data');
      setState(restored);
      setError(null);
    } catch {
      if (!ownsAccount(owner)) return;
      setError('Backup restored, but the refreshed data could not be loaded. Reload the app.');
    }
  };

  const handleDeleteTransaction = async (id: string) => {
    const owner = accountLifetime.current;
    try {
      setActionStatus({ phase: 'pending', message: 'Deleting transaction...' });
      await transactionsApi.delete(id);
      if (!ownsAccount(owner)) return;
      ++readSequence.current;
      setState((prev) => ({
        ...prev,
        transactions: prev.transactions.filter((t) => t.id !== id),
      }));
      setActionStatus({ phase: 'success', message: 'Transaction deleted' });
      setTimeout(() => { if (ownsAccount(owner)) setActionStatus(null); }, 2000);
    } catch (err) {
      if (!ownsAccount(owner)) return;
      setActionStatus(null);
      setError(err instanceof Error ? err.message : 'Failed to delete transaction');
      console.error('Failed to delete transaction:', err);
    }
  };

  const handleEditTransaction = (transaction: Transaction) => {
    // Prevent editing transactions if no buckets exist
    if (state.buckets.length === 0) {
      setError('Please create at least one bucket before editing transactions.');
      setActiveTab('buckets');
      return;
    }
    setEditingTransaction(transaction);
    setActiveTab('transactions');
  };

  const handleCancelEdit = () => {
    setEditingTransaction(null);
  };

  const handleAddRecurring = async (recurring: RecurringTransaction) => {
    const owner = accountLifetime.current;
    ++readSequence.current;
    try {
      setError(null);
      setActionStatus({ phase: 'pending', message: 'Saving recurring...' });
      const saved = await recurringApi.create(recurring);
      if (!ownsAccount(owner)) throw new Error('Account changed. Please try again.');
      ++readSequence.current;
      setState(prev => ({ ...prev, recurringTransactions: [...prev.recurringTransactions.filter(r => r.id !== saved.id), saved] }));
      showSaved(owner, 'Recurring saved');
    } catch (err) {
      if (ownsAccount(owner)) { setActionStatus(null); setError(err instanceof Error ? err.message : 'Failed to create recurring transaction'); }
      throw err;
    }
  };

  const handleUpdateRecurring = async (
    id: string,
    updates: RecurringEditPatch,
    options: { applyToGenerated: 'all' | 'fromNext'; requestId: string; today: string }
  ) => {
    const owner = accountLifetime.current;
    ++readSequence.current;
    try {
      setError(null);
      setActionStatus({ phase: 'pending', message: 'Updating recurring...' });
      await recurringApi.edit(id, updates, { historyScope: options.applyToGenerated, requestId: options.requestId, today: options.today });
      if (!ownsAccount(owner)) throw new Error('Account changed. Please try again.');
      let loaded = false;
      for (let attempt = 0; attempt < 3; attempt++) {
        const sequence = ++readSequence.current;
        const data = await appStateApi.load();
        if (!ownsAccount(owner)) throw new Error('Account changed. Please try again.');
        if (readSequence.current !== sequence) continue;
        setState(data);
        loaded = true;
        break;
      }
      if (!loaded) throw new Error('Data changed while refreshing. Your save may be complete; retry this draft to confirm it.');
      showSaved(owner, 'Recurring updated');
    } catch (err) {
      if (ownsAccount(owner)) { setActionStatus(null); setError(err instanceof Error ? err.message : 'Save could not be confirmed. Retry this draft to confirm the result.'); }
      throw err;
    }
  };

  const handleDeleteRecurring = async (id: string) => {
    const owner = accountLifetime.current;
    try {
      setActionStatus({ phase: 'pending', message: 'Deleting recurring...' });
      await recurringApi.delete(id);
      if (!ownsAccount(owner)) return;
      ++readSequence.current;
      setState((prev) => ({
        ...prev,
        recurringTransactions: prev.recurringTransactions.filter((r) => r.id !== id),
        transactions: prev.transactions.filter((t) => t.recurringId !== id),
      }));
      setActionStatus({ phase: 'success', message: 'Recurring deleted' });
      setTimeout(() => { if (ownsAccount(owner)) setActionStatus(null); }, 2000);
    } catch (err) {
      if (!ownsAccount(owner)) return;
      setActionStatus(null);
      setError(err instanceof Error ? err.message : 'Failed to delete recurring transaction');
      console.error('Failed to delete recurring transaction:', err);
    }
  };

  const handleAddBudgets = async (budgets: Budget[], requestId: string) => {
    const owner = accountLifetime.current;
    ++readSequence.current;
    try {
      setError(null);
      setActionStatus({ phase: 'pending', message: 'Saving budgets...' });
      await budgetsApi.createBatch(budgets, requestId);
      if (!ownsAccount(owner)) throw new Error('Account changed. Please try again.');
      let loaded = false;
      for (let attempt = 0; attempt < 3; attempt++) {
        const sequence = ++readSequence.current;
        const data = await appStateApi.load();
        if (!ownsAccount(owner)) throw new Error('Account changed. Please try again.');
        if (readSequence.current !== sequence) continue;
        setState(data);
        loaded = true;
        break;
      }
      if (!loaded) throw new Error('Data changed while refreshing. Your save may be complete; retry this draft to confirm it.');
      showSaved(owner, 'Budgets saved');
    } catch (err) {
      if (ownsAccount(owner)) { setActionStatus(null); setError(err instanceof Error ? err.message : 'Save could not be confirmed. Retry this draft to confirm the result.'); }
      throw err;
    }
  };

  const handleUpdateBudget = async (id: string, updates: Partial<Budget>) => {
    const owner = accountLifetime.current;
    ++readSequence.current;
    try {
      setError(null);
      setActionStatus({ phase: 'pending', message: 'Updating budget...' });
      const updatedBudget = await budgetsApi.update(id, updates);
      if (!ownsAccount(owner)) throw new Error('Account changed. Please try again.');
      ++readSequence.current;
      setState(prev => ({ ...prev, budgets: prev.budgets.map(b => b.id === id ? updatedBudget : b) }));
      showSaved(owner, 'Budget updated');
    } catch (err) {
      if (ownsAccount(owner)) { setActionStatus(null); setError(err instanceof Error ? err.message : 'Failed to update budget'); }
      throw err;
    }
  };

  const handleDeleteBudget = async (id: string) => {
    const owner = accountLifetime.current;
    try {
      setActionStatus({ phase: 'pending', message: 'Deleting budget...' });
      await budgetsApi.delete(id);
      if (!ownsAccount(owner)) return;
      ++readSequence.current;
      setState((prev) => ({
        ...prev,
        budgets: prev.budgets.filter((b) => b.id !== id),
      }));
      setActionStatus({ phase: 'success', message: 'Budget deleted' });
      setTimeout(() => { if (ownsAccount(owner)) setActionStatus(null); }, 2000);
    } catch (err) {
      if (!ownsAccount(owner)) return;
      setActionStatus(null);
      setError(err instanceof Error ? err.message : 'Failed to delete budget');
      console.error('Failed to delete budget:', err);
    }
  };

  const handleSettingsNavigate = (tab: 'buckets' | 'recurring' | 'budgets') => {
    setActiveTab(tab);
  };

  const getActiveSubTab = (): 'buckets' | 'recurring' | 'budgets' => {
    if (['buckets', 'recurring', 'budgets'].includes(activeTab)) {
      return activeTab as 'buckets' | 'recurring' | 'budgets';
    }
    return 'buckets'; // default
  };

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  if (loading) {
    return (
      <div className="app">
        <div style={{ padding: '2rem', textAlign: 'center' }}>Loading...</div>
      </div>
    );
  }

  return (
    <div className="app">
      {error && (
        <div style={{ 
          padding: '1rem', 
          backgroundColor: '#ffebee', 
          color: '#c62828',
          margin: '1rem',
          borderRadius: '4px'
        }}>
          Error: {error}
          <button 
            onClick={() => setError(null)} 
            style={{ marginLeft: '1rem', float: 'right' }}
          >
            ×
          </button>
        </div>
      )}
      {actionStatus && (
        <div className="action-status-overlay" aria-hidden="false">
          <div
            className={`action-status action-status--${actionStatus.phase}`}
            role="status"
            aria-live="polite"
          >
            {actionStatus.phase === 'pending' && (
              <span className="action-status__spinner" aria-hidden />
            )}
            {actionStatus.phase === 'success' && (
              <span className="action-status__icon action-status__icon--success" aria-hidden>✓</span>
            )}
            <span className="action-status__message">{actionStatus.message}</span>
          </div>
        </div>
      )}
      <header className="app-header">
        <div className="app-header-top">
          <h1>Expense Tracker</h1>
          <div className="app-header-user-info">
            <span className="user-email">{user?.email}</span>
            <button
              onClick={handleLogout}
              className="btn-logout"
            >
              Log Out
            </button>
          </div>
        </div>
        <nav className="tabs">
          <button
            className={`tab ${activeTab === 'summary' ? 'active' : ''}`}
            onClick={() => setActiveTab('summary')}
          >
            Summary
          </button>
          <button
            className={`tab ${activeTab === 'calendar' ? 'active' : ''}`}
            onClick={() => setActiveTab('calendar')}
          >
            Calendar
          </button>
          <button
            className={`tab ${activeTab === 'transactions' ? 'active' : ''}`}
            onClick={() => {
              if (state.buckets.length === 0) {
                setError('No buckets yet. Expense entries need a bucket; income and investment entries can be added without one.');
              }
              setActiveTab('transactions');
            }}
          >
            Transactions
          </button>
          <button
            className={`tab ${activeTab === 'reflections' ? 'active' : ''}`}
            onClick={() => setActiveTab('reflections')}
          >
            Reflections
          </button>
          <button
            className={`tab ${activeTab === 'settings' || ['buckets', 'recurring', 'budgets'].includes(activeTab) ? 'active' : ''}`}
            onClick={() => setActiveTab('settings')}
          >
            Settings
          </button>
        </nav>
      </header>

      <main className="app-main">
        <ErrorBoundary key={`${user?.id}:${activeTab}`}>
        {activeTab === 'summary' && (
          <Suspense fallback={<div style={{ padding: '2rem', textAlign: 'center' }}>Loading summary...</div>}>
            <Summary transactions={state.transactions} buckets={state.buckets} budgets={state.budgets} />
          </Suspense>
        )}

        {activeTab === 'calendar' && (
          <Suspense fallback={<div style={{ padding: '2rem', textAlign: 'center' }}>Loading calendar...</div>}>
            <CalendarView
              transactions={state.transactions}
              buckets={state.buckets}
              recurringTransactions={state.recurringTransactions}
              budgets={state.budgets}
              onEditTransaction={handleEditTransaction}
              onDeleteTransaction={handleDeleteTransaction}
            />
          </Suspense>
        )}

        {activeTab === 'transactions' && (
          <div className="transactions-view">
            {state.buckets.length === 0 && (
              <div style={{ 
                padding: '1.25rem', 
                margin: '0 0 1rem 0',
                backgroundColor: '#fff3cd',
                border: '1px solid #ffc107',
                borderRadius: '6px'
              }}>
                <h2 style={{ marginBottom: '0.5rem' }}>No buckets yet</h2>
                <p style={{ marginBottom: '0.5rem' }}>
                  You can still add income and investment entries. Create at least one bucket to start tracking expenses.
                </p>
                <button
                  onClick={() => setActiveTab('buckets')}
                  className="btn btn-primary"
                >
                  Create a bucket
                </button>
              </div>
            )}
            <TransactionTemplates
              buckets={state.buckets}
              onUseTemplate={handleUseTemplate}
            />
            <div className="transactions-form-section">
              <h2>{editingTransaction ? 'Edit' : 'Add'} Transaction</h2>
              <TransactionForm
                buckets={state.buckets}
                transactions={state.transactions}
                onSubmit={handleAddTransaction}
                onCancel={editingTransaction ? handleCancelEdit : undefined}
                initialTransaction={editingTransaction || undefined}
              />
            </div>
            <TransactionList
              transactions={state.transactions}
              buckets={state.buckets}
              onDelete={handleDeleteTransaction}
              onEdit={handleEditTransaction}
              onDuplicate={handleDuplicateTransaction}
              onCreateRecurring={handleCreateRecurringFromTransaction}
              onBulkDelete={handleBulkDeleteTransactions}
            />
          </div>
        )}

        {activeTab === 'reflections' && (
          <Suspense fallback={<div style={{ padding: '2rem', textAlign: 'center' }}>Loading reflections...</div>}>
            <Reflections />
          </Suspense>
        )}

        {activeTab === 'settings' && (
          <>
            <Settings
              activeSubTab={getActiveSubTab()}
              onNavigate={handleSettingsNavigate}
            />
            <div style={{ marginTop: '32px' }}>
              <DataBackup
                appState={state}
                onImport={handleImportData}
              />
            </div>
          </>
        )}

        {activeTab === 'buckets' && (
          <BucketManager
            buckets={state.buckets}
            onAddBucket={handleAddBucket}
            onUpdateBucket={handleUpdateBucket}
            onDeleteBucket={handleDeleteBucket}
          />
        )}

        {activeTab === 'recurring' && (
          <ErrorBoundary>
            <Suspense fallback={<div style={{ padding: '2rem', textAlign: 'center' }}>Loading recurring transactions...</div>}>
              <RecurringTransactionManager
                recurringTransactions={state.recurringTransactions || []}
                buckets={state.buckets || []}
                transactions={state.transactions || []}
                key={user?.id}
                onAdd={handleAddRecurring}
                onUpdate={handleUpdateRecurring}
                onDelete={handleDeleteRecurring}
              />
            </Suspense>
          </ErrorBoundary>
        )}

        {activeTab === 'budgets' && (
          <Suspense fallback={<div style={{ padding: '2rem', textAlign: 'center' }}>Loading budgets...</div>}>
            <BudgetManager
              budgets={state.budgets}
              buckets={state.buckets}
              key={user?.id}
              onAdd={handleAddBudgets}
              onUpdate={handleUpdateBudget}
              onDelete={handleDeleteBudget}
            />
          </Suspense>
        )}
        </ErrorBoundary>
      </main>
    </div>
  );
}

export default App;