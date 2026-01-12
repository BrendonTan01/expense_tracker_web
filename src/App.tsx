import { useState, useEffect, Component, ReactNode } from 'react';
import { AppState, Transaction, Bucket, RecurringTransaction } from './types';
import { generateId } from './utils/storage';
import { appStateApi, bucketsApi, transactionsApi, recurringApi } from './utils/api';
import { shouldGenerateTransaction, getNextOccurrence } from './utils/dateHelpers';
import BucketManager from './components/BucketManager';
import TransactionForm from './components/TransactionForm';
import TransactionList from './components/TransactionList';
import RecurringTransactionManager from './components/RecurringTransactionManager';
import Summary from './components/Summary';

type Tab = 'summary' | 'transactions' | 'buckets' | 'recurring';

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
  const [state, setState] = useState<AppState>({
    buckets: [],
    transactions: [],
    recurringTransactions: [],
  });
  const [activeTab, setActiveTab] = useState<Tab>('summary');
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load state from API on mount
  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await appStateApi.load();
        setState(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load data');
        console.error('Failed to load data:', err);
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, []);

  // Generate transactions from recurring transactions (runs once after initial load)
  useEffect(() => {
    if (loading) return; // Don't run while loading initial data
    
    const generateRecurringTransactions = async () => {
      const currentState = state; // Capture current state
      const newTransactions: Transaction[] = [];
      const updatedRecurring: RecurringTransaction[] = [];
      const today = new Date().toISOString().split('T')[0];

      for (const recurring of currentState.recurringTransactions) {
        if (
          shouldGenerateTransaction(
            recurring.frequency,
            recurring.startDate,
            recurring.endDate,
            recurring.lastApplied
          )
        ) {
          // Calculate the next occurrence date
          const nextDate = getNextOccurrence(
            recurring.frequency,
            recurring.startDate,
            recurring.lastApplied
          );

          // Check if transaction already exists for this date and recurring ID
          const exists = currentState.transactions.some(
            (t) => t.recurringId === recurring.id && t.date === nextDate
          );

          if (!exists && nextDate <= today) {
            newTransactions.push({
              id: generateId(),
              ...recurring.transaction,
              date: nextDate,
              isRecurring: true,
              recurringId: recurring.id,
            });
          }

          updatedRecurring.push({
            ...recurring,
            lastApplied: nextDate,
          });
        } else {
          updatedRecurring.push(recurring);
        }
      }

      // Save new transactions to database
      if (newTransactions.length > 0) {
        try {
          const savedTransactions = await Promise.all(
            newTransactions.map(t => transactionsApi.create(t))
          );
          setState((prev) => ({
            ...prev,
            transactions: [...prev.transactions, ...savedTransactions],
          }));
        } catch (err) {
          console.error('Failed to save generated transactions:', err);
        }
      }

      // Update recurring transactions in database
      if (JSON.stringify(updatedRecurring) !== JSON.stringify(currentState.recurringTransactions)) {
        try {
          await Promise.all(
            updatedRecurring.map(async (r) => {
              const original = currentState.recurringTransactions.find(or => or.id === r.id);
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
  }, [loading]); // Only run when loading changes from true to false

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
        <h1>Expense Tracker</h1>
        <nav className="tabs">
          <button
            className={`tab ${activeTab === 'summary' ? 'active' : ''}`}
            onClick={() => setActiveTab('summary')}
          >
            Summary
          </button>
          <button
            className={`tab ${activeTab === 'transactions' ? 'active' : ''}`}
            onClick={() => setActiveTab('transactions')}
          >
            Transactions
          </button>
          <button
            className={`tab ${activeTab === 'buckets' ? 'active' : ''}`}
            onClick={() => setActiveTab('buckets')}
          >
            Buckets
          </button>
          <button
            className={`tab ${activeTab === 'recurring' ? 'active' : ''}`}
            onClick={() => setActiveTab('recurring')}
          >
            Recurring
          </button>
        </nav>
      </header>

      <main className="app-main">
        {activeTab === 'summary' && (
          <Summary transactions={state.transactions} buckets={state.buckets} />
        )}

        {activeTab === 'transactions' && (
          <div className="transactions-view">
            <div className="transactions-form-section">
              <h2>{editingTransaction ? 'Edit' : 'Add'} Transaction</h2>
              <TransactionForm
                buckets={state.buckets}
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
            />
          </div>
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
            <RecurringTransactionManager
              recurringTransactions={state.recurringTransactions || []}
              buckets={state.buckets || []}
              onAdd={handleAddRecurring}
              onUpdate={handleUpdateRecurring}
              onDelete={handleDeleteRecurring}
            />
          </ErrorBoundary>
        )}
      </main>
    </div>
  );
}

export default App;