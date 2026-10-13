import { useState, useMemo } from 'react';
import { RecurringTransaction, Bucket, RecurringFrequency, Transaction } from '../types';
import { parseIsoDateLocal, todayIsoLocal, formatIsoDateLocal, getNextOccurrence, formatDate } from '../utils/dateHelpers';
import TransactionForm from './TransactionForm';
import { useMutationAttempt } from '../utils/mutationAttempt';
import { generateId } from '../utils/storage';
import { RecurringEditPatch } from '../utils/api';
import { useAuth } from '../contexts/AuthContext';

interface RecurringTransactionManagerProps {
  recurringTransactions: RecurringTransaction[];
  buckets: Bucket[];
  transactions: Transaction[];
  onAdd: (recurring: RecurringTransaction) => Promise<void>;
  onUpdate: (
    id: string,
    recurring: RecurringEditPatch,
    options: { applyToGenerated: 'all' | 'fromNext'; requestId: string; today: string }
  ) => Promise<void>;
  onDelete: (id: string) => void;
}

export default function RecurringTransactionManager({
  recurringTransactions,
  buckets,
  transactions,
  onAdd,
  onUpdate,
  onDelete,
}: RecurringTransactionManagerProps) {
  // Calculate status for each recurring transaction
  const recurringStatus = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = formatIsoDateLocal(today);

    return recurringTransactions.map((recurring) => {
      const generatedTransactions = transactions.filter(
        (t) => t.recurringId === recurring.id
      );
      const lastGenerated = generatedTransactions.length > 0
        ? generatedTransactions.sort((a, b) => parseIsoDateLocal(b.date).getTime() - parseIsoDateLocal(a.date).getTime())[0].date
        : null;
      
      // Calculate status based on dates
      const startDate = parseIsoDateLocal(recurring.startDate);
      startDate.setHours(0, 0, 0, 0);
      const startDateStr = formatIsoDateLocal(startDate);
      
      let status: 'active' | 'inactive' | 'closed' = 'inactive';
      
      if (recurring.endDate) {
        const endDate = parseIsoDateLocal(recurring.endDate);
        endDate.setHours(0, 0, 0, 0);
        const endDateStr = formatIsoDateLocal(endDate);
        
        if (todayStr >= startDateStr && todayStr <= endDateStr) {
          status = 'active';
        } else if (todayStr < startDateStr) {
          status = 'inactive';
        } else if (todayStr > endDateStr) {
          status = 'closed';
        }
      } else {
        // No end date - check if today >= start date
        if (todayStr >= startDateStr) {
          status = 'active';
        } else {
          status = 'inactive';
        }
      }
      
      const isActive = status === 'active';
      const nextDate = getNextOccurrence(
        recurring.frequency,
        recurring.startDate,
        lastGenerated || recurring.lastApplied
      );

      return {
        recurring,
        generatedCount: generatedTransactions.length,
        status,
        isActive,
        nextDate,
        lastGenerated,
      };
    });
  }, [recurringTransactions, transactions]);
  const { user } = useAuth();
  const save = useMutationAttempt<RecurringTransaction>(user?.id || '');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<Partial<Transaction>>({});
  const [frequency, setFrequency] = useState<RecurringFrequency>('monthly');
  const [startDate, setStartDate] = useState(todayIsoLocal());
  const [endDate, setEndDate] = useState('');
  const [pendingEditUpdate, setPendingEditUpdate] = useState<{
    id: string;
    updates: RecurringEditPatch;
  } | null>(null);

  const handleSubmit = async (transactionData: Omit<Transaction, 'id' | 'isRecurring' | 'recurringId' | 'date'>) => {
    if (save.pending) return;
    const updates = { transaction: transactionData, frequency, startDate, endDate: endDate || null };
    if (editingId) {
      setPendingEditUpdate({ id: editingId, updates });
      return;
    }
    await save.run(JSON.stringify(updates), () => ({ ...updates, id: generateId(), endDate: endDate || undefined }),
      async attempt => { await onAdd(attempt.payload); }, handleCancel);
  };

  const applyPendingUpdate = async (mode: 'all' | 'fromNext') => {
    if (!pendingEditUpdate || save.pending) return;
    await save.run(JSON.stringify({ ...pendingEditUpdate, mode }),
      () => ({ ...pendingEditUpdate.updates, id: pendingEditUpdate.id, endDate: pendingEditUpdate.updates.endDate || undefined } as RecurringTransaction),
      async attempt => {
        const { transaction, frequency, startDate, endDate } = attempt.payload;
        await onUpdate(pendingEditUpdate.id, { transaction, frequency, startDate, endDate: endDate || null },
          { applyToGenerated: mode, requestId: attempt.requestId, today: attempt.today });
      }, handleCancel);
  };

  const handleEdit = (recurring: RecurringTransaction) => {
    if (save.pending) return;
    save.clear();
    setEditingId(recurring.id);
    setFormData(recurring.transaction);
    setFrequency(recurring.frequency);
    setStartDate(recurring.startDate ? recurring.startDate.split('T')[0] : todayIsoLocal());
    setEndDate(recurring.endDate ? recurring.endDate.split('T')[0] : '');
    setPendingEditUpdate(null);
    setShowForm(true);
  };

  const handleCancel = () => {
    save.clear();
    setShowForm(false);
    setEditingId(null);
    setPendingEditUpdate(null);
    setFormData({});
    setFrequency('monthly');
    setStartDate(todayIsoLocal());
    setEndDate('');
  };

  return (
    <div className="recurring-manager">
      <div className="recurring-manager-header">
        <h2>Recurring Transactions</h2>
        {!showForm && (
          <button onClick={() => setShowForm(true)} className="btn btn-primary">
            Add Recurring Transaction
          </button>
        )}
      </div>

      {showForm && (
        <div className="recurring-form-container">
          <fieldset disabled={save.pending} style={{ border: 0, margin: 0, padding: 0 }}>
          <TransactionForm
            buckets={buckets}
            transactions={transactions}
            onSubmit={handleSubmit}
            onCancel={handleCancel}
            initialTransaction={formData}
          />
          <div className="recurring-options">
            <div className="form-group">
              <label>Frequency</label>
              <select
                value={frequency}
                onChange={(e) => setFrequency(e.target.value as RecurringFrequency)}
                className="input"
              >
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="fortnightly">Fortnightly</option>
                <option value="monthly">Monthly</option>
                <option value="yearly">Yearly</option>
              </select>
            </div>
            <div className="form-group">
              <label>Start Date</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="input"
                required
              />
            </div>
            <div className="form-group">
              <label>End Date (optional)</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="input"
              />
            </div>
          </div>
          </fieldset>
        </div>
      )}

      {save.error && <p role="alert" style={{ color: 'var(--danger-color)' }}>{save.error}</p>}
      {save.pending && <p role="status">Saving…</p>}
      {pendingEditUpdate && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1rem',
            zIndex: 1000,
          }}
          role="dialog"
          aria-modal="true"
        >
          <div
            style={{
              background: 'var(--card-bg)',
              color: 'var(--text-color)',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 12,
              maxWidth: 520,
              width: '100%',
              padding: '1rem',
              boxShadow: '0 10px 30px rgba(0,0,0,0.35)',
            }}
          >
            {save.error && <p role="alert" style={{ color: 'var(--danger-color)' }}>{save.error}</p>}
            <h3 style={{ marginTop: 0 }}>Apply changes to generated transactions?</h3>
            <p style={{ marginTop: 0, color: 'var(--text-muted)' }}>
              You changed this recurring template. Choose whether to update transactions that were already generated.
            </p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              <button
                className="btn btn-secondary"
                disabled={save.pending}
                onClick={() => setPendingEditUpdate(null)}
              >
                Back
              </button>
              <button
                className="btn btn-secondary"
                disabled={save.pending}
                onClick={() => applyPendingUpdate('fromNext')}
                title="Keep past transactions unchanged"
              >
                Only from next onwards
              </button>
              <button
                className="btn btn-primary"
                disabled={save.pending}
                onClick={() => applyPendingUpdate('all')}
                title="Update all transactions already generated for this recurring item"
              >
                Update all generated
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="recurring-list">
        {recurringTransactions.length === 0 ? (
          <p className="empty-state">No recurring transactions yet. Create one to get started!</p>
        ) : (
          recurringStatus.map((status) => {
            try {
              const { recurring } = status;
              if (!recurring || !recurring.id || !recurring.transaction || !recurring.startDate) {
                console.error('Invalid recurring transaction:', recurring);
                return null;
              }
              
              return (
                <div 
                  key={recurring.id} 
                  className="recurring-item"
                  style={{
                    borderLeft: `4px solid ${
                      status.status === 'active' 
                        ? 'var(--success-color)'
                        : status.status === 'inactive'
                        ? 'var(--secondary-color)'
                        : '#6b7280'
                    }`,
                    backgroundColor: 'var(--card-bg)',
                  }}
                >
                  <div className="recurring-info">
                    <div className="recurring-main">
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span className={`badge badge-${recurring.transaction.type}`}>
                          {recurring.transaction.type}
                        </span>
                        {status.status === 'active' && (
                          <span style={{ 
                            backgroundColor: 'var(--success-color)', 
                            color: 'white', 
                            padding: '2px 8px', 
                            borderRadius: '4px', 
                            fontSize: '12px',
                            fontWeight: 600
                          }}>
                            ACTIVE
                          </span>
                        )}
                        {status.status === 'inactive' && (
                          <span style={{ 
                            backgroundColor: 'var(--secondary-color)', 
                            color: 'white', 
                            padding: '2px 8px', 
                            borderRadius: '4px', 
                            fontSize: '12px',
                            fontWeight: 600
                          }}>
                            INACTIVE
                          </span>
                        )}
                        {status.status === 'closed' && (
                          <span style={{ 
                            backgroundColor: '#6b7280', 
                            color: 'white', 
                            padding: '2px 8px', 
                            borderRadius: '4px', 
                            fontSize: '12px',
                            fontWeight: 600
                          }}>
                            CLOSED
                          </span>
                        )}
                      </div>
                      <strong>{recurring.transaction.description || 'No description'}</strong>
                      <span className="recurring-amount">
                        {recurring.transaction.type === 'income' ? '+' : '-'}
                        ${(recurring.transaction.amount || 0).toFixed(2)}
                      </span>
                    </div>
                    <div className="recurring-details">
                      <span>Frequency: {recurring.frequency}</span>
                      <span>Started: {formatDate(recurring.startDate)}</span>
                      {recurring.endDate && <span>Ends: {formatDate(recurring.endDate)}</span>}
                      <span>Next: {formatDate(status.nextDate)}</span>
                      <span style={{ color: status.generatedCount > 0 ? 'var(--success-color)' : 'var(--secondary-color)' }}>
                        Generated: {status.generatedCount} transaction{status.generatedCount !== 1 ? 's' : ''}
                      </span>
                      {status.lastGenerated && (
                        <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                          Last: {formatDate(status.lastGenerated)}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="recurring-actions">
                    <button
                      onClick={() => handleEdit(recurring)}
                      className="btn btn-sm btn-secondary"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => onDelete(recurring.id)}
                      className="btn btn-sm btn-danger"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              );
            } catch (error) {
              console.error('Error rendering recurring transaction:', error, status);
              return (
                <div key={status.recurring.id || 'error'} className="recurring-item" style={{ color: 'red' }}>
                  Error displaying recurring transaction: {error instanceof Error ? error.message : 'Unknown error'}
                </div>
              );
            }
          }).filter(Boolean)
        )}
      </div>
    </div>
  );
}