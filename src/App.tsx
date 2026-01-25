import { useState, useEffect, useRef, Component, ReactNode, Suspense, lazy } from 'react';
import { AppState, Transaction, Bucket, RecurringTransaction, Budget, TransactionTemplate } from './types';
import { generateId } from './utils/storage';
import { appStateApi, bucketsApi, transactionsApi, recurringApi, budgetsApi } from './utils/api';
import { shouldGenerateTransaction, getOccurrenceDatesUpTo } from './utils/dateHelpers';
import { useAuth } from './contexts/AuthContext';
import BucketManager from './components/BucketManager';
import TransactionForm from './components/TransactionForm';
import TransactionList from './components/TransactionList';
import Login from './components/Login';
import Settings from './components/Settings';
import DataBackup from './components/DataBackup';
import TransactionTemplates from './components/TransactionTemplates';
import DarkModeToggle from './components/DarkModeToggle';
import EnhancedAnalytics from './components/EnhancedAnalytics';

// Lazy load heavy components to reduce initial bundle size
const Summary = lazy(() => import('./components/Summary'));
const RecurringTransactionManager = lazy(() => import('./components/RecurringTransactionManager'));
const BudgetManager = lazy(() => import('./components/BudgetManager'));
const Reflections = lazy(() => import('./components/Reflections'));

type Tab = 'summary' | 'transactions' | 'reflections' | 'settings' | 'buckets' | 'recurring' | 'budgets';

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
  const { user, logout, loading: authLoading } = useAuth();
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
  const stateRef = useRef(state);
  stateRef.current = state;

  // Load state from API on mount (only when user is authenticated)
  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }

    const loadData = async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await appStateApi.load();
        setState(data);
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to load data';
        setError(errorMessage);
        console.error('Failed to load data:', err);
        // Don't block the UI - allow user to see the app even if API fails
        // They'll see the error message but can still interact
      } finally {
        setLoading(false);
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

  // Generate transactions from recurring transactions (after load, and when user returns to tab)
  useEffect(() => {
    if (loading) return;

    const generateRecurringTransactions = async () => {
      const currentState = stateRef.current;
      const newTransactions: Transaction[] = [];
      const updatedRecurring: RecurringTransaction[] = [];
      const today = new Date().toISOString().split('T')[0];

      for (const recurring of currentState.recurringTransactions) {
        if (
          !shouldGenerateTransaction(
            recurring.frequency,
            recurring.startDate,
            recurring.endDate,
            recurring.lastApplied
          )
        ) {
          updatedRecurring.push(recurring);
          continue;
        }

        const occurrenceDates = getOccurrenceDatesUpTo(
          recurring.frequency,
          recurring.startDate,
          recurring.endDate,
          recurring.lastApplied,
          today
        );

        const existingDates = new Set(
          currentState.transactions
            .filter((t) => t.recurringId === recurring.id)
            .map((t) => t.date)
        );

        let latestGenerated: string | undefined = recurring.lastApplied;
        for (const date of occurrenceDates) {
          if (existingDates.has(date)) continue;
          newTransactions.push({
            id: generateId(),
            ...recurring.transaction,
            date,
            isRecurring: true,
            recurringId: recurring.id,
          });
          latestGenerated = date;
        }

        updatedRecurring.push({
          ...recurring,
          lastApplied: latestGenerated ?? recurring.lastApplied,
        });
      }

      if (newTransactions.length > 0) {
        try {
          const savedTransactions = await Promise.all(
            newTransactions.map((t) => transactionsApi.create(t))
          );
          setState((prev) => ({
            ...prev,
            transactions: [...prev.transactions, ...savedTransactions],
          }));
        } catch (err) {
          console.error('Failed to save generated transactions:', err);
        }
      }

      const needsUpdate = updatedRecurring.some((r) => {
        const orig = currentState.recurringTransactions.find((o) => o.id === r.id);
        return orig && orig.lastApplied !== r.lastApplied;
      });
      if (needsUpdate) {
        try {
          await Promise.all(
            updatedRecurring.map(async (r) => {
              const original = currentState.recurringTransactions.find((o) => o.id === r.id);
              if (original && original.lastApplied !== r.lastApplied) {
                await recurringApi.update(r.id, { lastApplied: r.lastApplied });
              }
            })
          );
          setState((prev) => ({
            ...prev,
            recurringTransactions: updatedRecurring,
          }));
        } catch (err) {
          console.error('Failed to update recurring transactions:', err);
        }
      }
    };

    generateRecurringTransactions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, visibilityTrigger]);

  const handleAddBucket = async (bucket: Bucket) => {
    try {
      const newBucket = await bucketsApi.create(bucket);
      setState((prev) => ({
        ...prev,
        buckets: [...prev.buckets, newBucket],
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create bucket');
      console.error('Failed to create bucket:', err);
    }
  };

  const handleUpdateBucket = async (id: string, updates: Partial<Bucket>) => {
    try {
      const updatedBucket = await bucketsApi.update(id, updates);
      setState((prev) => ({
        ...prev,
        buckets: prev.buckets.map((b) => (b.id === id ? updatedBucket : b)),
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update bucket');
      console.error('Failed to update bucket:', err);
    }
  };

  const handleDeleteBucket = async (id: string) => {
    try {
      await bucketsApi.delete(id);
      setState((prev) => ({
        ...prev,
        buckets: prev.buckets.filter((b) => b.id !== id),
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete bucket');
      console.error('Failed to delete bucket:', err);
    }
  };

  const handleAddTransaction = async (transactionData: Omit<Transaction, 'id' | 'isRecurring' | 'recurringId'>) => {
    // Prevent adding expense transactions if no buckets exist
    if (transactionData.type === 'expense' && state.buckets.length === 0) {
      setError('Please create at least one bucket before adding expense transactions.');
      setActiveTab('buckets');
      return;
    }

    try {
      if (editingTransaction) {
        const updatedTransaction = await transactionsApi.update(editingTransaction.id, {
          ...transactionData,
          isRecurring: editingTransaction.isRecurring,
          recurringId: editingTransaction.recurringId,
        });
        setState((prev) => ({
          ...prev,
          transactions: prev.transactions.map((t) =>
            t.id === editingTransaction.id ? updatedTransaction : t
          ),
        }));
        setEditingTransaction(null);
      } else {
        const newTransaction = await transactionsApi.create({
          ...transactionData,
          id: generateId(),
          isRecurring: false,
        });
        setState((prev) => ({
          ...prev,
          transactions: [...prev.transactions, newTransaction],
        }));
      }
    } catch (err) {
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
      date: new Date().toISOString().split('T')[0],
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
    try {
      await Promise.all(ids.map(id => transactionsApi.delete(id)));
      setState((prev) => ({
        ...prev,
        transactions: prev.transactions.filter(t => !ids.includes(t.id)),
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete transactions');
      console.error('Failed to delete transactions:', err);
    }
  };

  const handleUseTemplate = (template: TransactionTemplate) => {
    setEditingTransaction(null);
    handleAddTransaction({
      type: template.type,
      amount: template.amount || 0,
      description: template.description,
      bucketId: template.bucketId,
      date: new Date().toISOString().split('T')[0],
      tags: template.tags,
      notes: template.notes,
    });
  };

  const handleImportData = async (importedData: AppState) => {
    try {
      // Import buckets
      const importedBuckets = await Promise.all(
        importedData.buckets.map(b => bucketsApi.create(b))
      );

      // Import transactions
      const importedTransactions = await Promise.all(
        importedData.transactions.map(t => transactionsApi.create({
          ...t,
          id: generateId(),
        }))
      );

      // Import recurring transactions
      const importedRecurring = await Promise.all(
        importedData.recurringTransactions.map(r => recurringApi.create(r))
      );

      // Import budgets
      const importedBudgets = await Promise.all(
        importedData.budgets.map(b => budgetsApi.create(b))
      );

      setState({
        buckets: importedBuckets,
        transactions: importedTransactions,
        recurringTransactions: importedRecurring,
        budgets: importedBudgets,
      });

      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to import data');
      console.error('Failed to import data:', err);
    }
  };

  const handleDeleteTransaction = async (id: string) => {
    try {
      await transactionsApi.delete(id);
      setState((prev) => ({
        ...prev,
        transactions: prev.transactions.filter((t) => t.id !== id),
      }));
    } catch (err) {
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
    try {
      const newRecurring = await recurringApi.create(recurring);
      setState((prev) => ({
        ...prev,
        recurringTransactions: [...prev.recurringTransactions, newRecurring],
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create recurring transaction');
      console.error('Failed to create recurring transaction:', err);
    }
  };

  const handleUpdateRecurring = async (id: string, updates: Partial<RecurringTransaction>) => {
    try {
      const updatedRecurring = await recurringApi.update(id, updates);
      setState((prev) => ({
        ...prev,
        recurringTransactions: prev.recurringTransactions.map((r) =>
          r.id === id ? updatedRecurring : r
        ),
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update recurring transaction');
      console.error('Failed to update recurring transaction:', err);
    }
  };

  const handleDeleteRecurring = async (id: string) => {
    try {
      await recurringApi.delete(id);
      setState((prev) => ({
        ...prev,
        recurringTransactions: prev.recurringTransactions.filter((r) => r.id !== id),
        transactions: prev.transactions.filter((t) => t.recurringId !== id),
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete recurring transaction');
      console.error('Failed to delete recurring transaction:', err);
    }
  };

  const handleAddBudget = async (budget: Budget) => {
    try {
      const newBudget = await budgetsApi.create(budget);
      setState((prev) => ({
        ...prev,
        budgets: [...prev.budgets, newBudget],
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create budget');
      console.error('Failed to create budget:', err);
    }
  };

  const handleUpdateBudget = async (id: string, updates: Partial<Budget>) => {
    try {
      const updatedBudget = await budgetsApi.update(id, updates);
      setState((prev) => ({
        ...prev,
        budgets: prev.budgets.map((b) => (b.id === id ? updatedBudget : b)),
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update budget');
      console.error('Failed to update budget:', err);
    }
  };

  const handleDeleteBudget = async (id: string) => {
    try {
      await budgetsApi.delete(id);
      setState((prev) => ({
        ...prev,
        budgets: prev.budgets.filter((b) => b.id !== id),
      }));
    } catch (err) {
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

  // Show loading while checking authentication
  if (authLoading) {
    return (
      <div className="app">
        <div style={{ padding: '2rem', textAlign: 'center' }}>Loading...</div>
      </div>
    );
  }

  // Show login if not authenticated
  if (!user) {
    return <Login />;
  }

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
      <header className="app-header">
        <div className="app-header-top">
          <h1>Expense Tracker</h1>
          <div className="app-header-user-info">
            <DarkModeToggle />
            <span className="user-email">{user.email}</span>
            <button
              onClick={logout}
              className="btn-logout"
            >
              Logout
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
        {activeTab === 'summary' && (
          <Suspense fallback={<div style={{ padding: '2rem', textAlign: 'center' }}>Loading summary...</div>}>
            <Summary transactions={state.transactions} buckets={state.buckets} budgets={state.budgets} />
            <EnhancedAnalytics transactions={state.transactions} buckets={state.buckets} />
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
              onAdd={handleAddBudget}
              onUpdate={handleUpdateBudget}
              onDelete={handleDeleteBudget}
            />
          </Suspense>
        )}
      </main>
    </div>
  );
}

export default App;