import { useState } from 'react';
import { Transaction, Bucket } from '../types';

interface TransactionFormProps {
  buckets: Bucket[];
  onSubmit: (transaction: Omit<Transaction, 'id' | 'isRecurring' | 'recurringId'>) => void;
  onCancel?: () => void;
  initialTransaction?: Partial<Transaction>;
}

export default function TransactionForm({
  buckets,
  onSubmit,
  onCancel,
  initialTransaction,
}: TransactionFormProps) {
  const [type, setType] = useState<'expense' | 'income'>(
    initialTransaction?.type || 'expense'
  );
  const [amount, setAmount] = useState(initialTransaction?.amount?.toString() || '');
  const [description, setDescription] = useState(initialTransaction?.description || '');
  const [bucketId, setBucketId] = useState(initialTransaction?.bucketId || '');
  const [date, setDate] = useState(
    initialTransaction?.date ? initialTransaction.date.split('T')[0] : new Date().toISOString().split('T')[0]
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) return;
    if (type === 'expense' && !bucketId) return;

    onSubmit({
      type,
      amount: numAmount,
      description,
      bucketId: type === 'expense' ? bucketId : undefined,
      date,
    });

    // Reset form if not editing
    if (!initialTransaction) {
      setAmount('');
      setDescription('');
      setBucketId('');
      setDate(new Date().toISOString().split('T')[0]);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="transaction-form">
      <div className="form-group">
        <label>Type</label>
        <div className="radio-group">
          <label className="radio-label">
            <input
              type="radio"
              value="expense"
              checked={type === 'expense'}
              onChange={(e) => {
                setType(e.target.value as 'expense' | 'income');
                setBucketId('');
              }}
            />
            Expense
          </label>
          <label className="radio-label">
            <input
              type="radio"
              value="income"
              checked={type === 'income'}
              onChange={(e) => setType(e.target.value as 'expense' | 'income')}
            />
            Income
          </label>
        </div>
      </div>

      <div className="form-group">
        <label>Amount</label>
        <input
          type="number"
          step="0.01"
          min="0.01"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="input"
          required
        />
      </div>

      <div className="form-group">
        <label>Description</label>
        <input
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="input"
          required
        />
      </div>

      {type === 'expense' && (
        <div className="form-group">
          <label>Bucket</label>
          <select
            value={bucketId}
            onChange={(e) => setBucketId(e.target.value)}
            className="input"
            required
          >
            <option value="">Select a bucket</option>
            {buckets.map((bucket) => (
              <option key={bucket.id} value={bucket.id}>
                {bucket.name}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="form-group">
        <label>Date</label>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="input"
          required
        />
      </div>

      <div className="form-actions">
        <button type="submit" className="btn btn-primary">
          {initialTransaction ? 'Update' : 'Add'} Transaction
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel} className="btn btn-secondary">
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}