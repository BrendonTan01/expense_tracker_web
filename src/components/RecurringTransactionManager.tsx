import { useState } from 'react';
import { RecurringTransaction, Bucket, RecurringFrequency } from '../types';
import { getNextOccurrence, formatDate } from '../utils/dateHelpers';
import TransactionForm from './TransactionForm';
import { Transaction } from '../types';

interface RecurringTransactionManagerProps {
  recurringTransactions: RecurringTransaction[];
  buckets: Bucket[];
  onAdd: (recurring: RecurringTransaction) => void;
  onUpdate: (id: string, recurring: Partial<RecurringTransaction>) => void;
  onDelete: (id: string) => void;
}

export default function RecurringTransactionManager({
  recurringTransactions,
  buckets,
  onAdd,
  onUpdate,
  onDelete,
}: RecurringTransactionManagerProps) {
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<Partial<Transaction>>({});
  const [frequency, setFrequency] = useState<RecurringFrequency>('monthly');
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState('');

  const handleSubmit = (transactionData: Omit<Transaction, 'id' | 'isRecurring' | 'recurringId' | 'date'>) => {
    if (editingId) {
      onUpdate(editingId, {
        transaction: transactionData,
        frequency,
        startDate,
        endDate: endDate || undefined,
      });
      setEditingId(null);
    } else {
      onAdd({
        id: Date.now().toString(),
        transaction: transactionData,
        frequency,
        startDate,
        endDate: endDate || undefined,
      });
    }

    setShowForm(false);
    setFormData({});
    setFrequency('monthly');
    setStartDate(new Date().toISOString().split('T')[0]);
    setEndDate('');
  };

  const handleEdit = (recurring: RecurringTransaction) => {
    setEditingId(recurring.id);
    setFormData(recurring.transaction);
    setFrequency(recurring.frequency);
    setStartDate(recurring.startDate.split('T')[0]);
    setEndDate(recurring.endDate?.split('T')[0] || '');
    setShowForm(true);
  };

  const handleCancel = () => {
    setShowForm(false);
    setEditingId(null);
    setFormData({});
    setFrequency('monthly');
    setStartDate(new Date().toISOString().split('T')[0]);
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
          <TransactionForm
            buckets={buckets}
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
        </div>
      )}

      <div className="recurring-list">
        {recurringTransactions.length === 0 ? (
          <p className="empty-state">No recurring transactions yet. Create one to get started!</p>
        ) : (
          recurringTransactions.map((recurring) => {
            const nextDate = getNextOccurrence(
              recurring.frequency,
              recurring.startDate,
              recurring.lastApplied
            );
            return (
              <div key={recurring.id} className="recurring-item">
                <div className="recurring-info">
                  <div className="recurring-main">
                    <span className={`badge badge-${recurring.transaction.type}`}>
                      {recurring.transaction.type}
                    </span>
                    <strong>{recurring.transaction.description}</strong>
                    <span className="recurring-amount">
                      {recurring.transaction.type === 'income' ? '+' : '-'}
                      ${recurring.transaction.amount.toFixed(2)}
                    </span>
                  </div>
                  <div className="recurring-details">
                    <span>Frequency: {recurring.frequency}</span>
                    <span>Started: {formatDate(recurring.startDate)}</span>
                    {recurring.endDate && <span>Ends: {formatDate(recurring.endDate)}</span>}
                    <span>Next: {formatDate(nextDate)}</span>
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
          })
        )}
      </div>
    </div>
  );
}