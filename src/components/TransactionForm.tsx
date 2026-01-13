import { useState, useEffect } from 'react';
import { Transaction, Bucket } from '../types';
import { checkForDuplicates } from '../utils/duplicateDetection';

interface TransactionFormProps {
  buckets: Bucket[];
  transactions: Transaction[];
  onSubmit: (transaction: Omit<Transaction, 'id' | 'isRecurring' | 'recurringId'>) => void;
  onCancel?: () => void;
  initialTransaction?: Partial<Transaction>;
}

export default function TransactionForm({
  buckets,
  transactions,
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
  const [tags, setTags] = useState<string[]>(initialTransaction?.tags || []);
  const [tagInput, setTagInput] = useState('');
  const [notes, setNotes] = useState(initialTransaction?.notes || '');
  const [duplicateWarning, setDuplicateWarning] = useState<{ message: string; similar: Transaction[] } | null>(null);

  const handleAddTag = () => {
    if (tagInput.trim() && !tags.includes(tagInput.trim())) {
      setTags([...tags, tagInput.trim()]);
      setTagInput('');
    }
  };

  // Update form fields when initialTransaction changes (for editing)
  useEffect(() => {
    if (initialTransaction) {
      setType(initialTransaction.type || 'expense');
      setAmount(initialTransaction.amount?.toString() || '');
      setDescription(initialTransaction.description || '');
      setBucketId(initialTransaction.bucketId || '');
      setDate(
        initialTransaction.date 
          ? initialTransaction.date.split('T')[0] 
          : new Date().toISOString().split('T')[0]
      );
      setTags(initialTransaction.tags || []);
      setNotes(initialTransaction.notes || '');
    } else {
      // Reset form when not editing
      setType('expense');
      setAmount('');
      setDescription('');
      setBucketId('');
      setDate(new Date().toISOString().split('T')[0]);
      setTags([]);
      setTagInput('');
      setNotes('');
    }
  }, [initialTransaction]);

  // Check for duplicates when form data changes (only for new transactions)
  useEffect(() => {
    if (initialTransaction || !amount || !description) {
      setDuplicateWarning(null);
      return;
    }

    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      setDuplicateWarning(null);
      return;
    }

    const duplicateCheck = checkForDuplicates(
      {
        type,
        amount: numAmount,
        description,
        bucketId: type === 'expense' ? bucketId : undefined,
        date,
        tags: tags.length > 0 ? tags : undefined,
        notes: notes || undefined,
      },
      transactions, // All transactions (we only check duplicates for new transactions, not when editing)
      24 // 24 hour window
    );

    if (duplicateCheck.isDuplicate) {
      setDuplicateWarning({
        message: `Possible duplicate detected (${duplicateCheck.confidence} confidence)`,
        similar: duplicateCheck.similarTransactions,
      });
    } else {
      setDuplicateWarning(null);
    }
  }, [type, amount, description, bucketId, date, tags, notes, transactions, initialTransaction]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) return;
    if (type === 'expense' && !bucketId) return;

    // Warn if duplicate but allow submission
    if (duplicateWarning && duplicateWarning.similar.length > 0) {
      const proceed = window.confirm(
        `Warning: This transaction looks similar to ${duplicateWarning.similar.length} other transaction(s).\n\n` +
        `Similar transactions:\n${duplicateWarning.similar.slice(0, 3).map(t => 
          `- ${t.description} (${t.date})`
        ).join('\n')}\n\n` +
        `Do you want to proceed anyway?`
      );
      if (!proceed) return;
    }

    onSubmit({
      type,
      amount: numAmount,
      description,
      bucketId: type === 'expense' ? bucketId : undefined,
      date,
      tags: tags.length > 0 ? tags : undefined,
      notes: notes || undefined,
    });

    // Reset form if not editing
    if (!initialTransaction) {
      setAmount('');
      setDescription('');
      setBucketId('');
      setDate(new Date().toISOString().split('T')[0]);
      setTags([]);
      setTagInput('');
      setNotes('');
      setDuplicateWarning(null);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="transaction-form">
      {duplicateWarning && duplicateWarning.similar.length > 0 && (
        <div className="duplicate-warning" style={{
          padding: '12px',
          border: '1px solid var(--warning-color)',
          borderRadius: '4px',
          marginBottom: '16px',
          fontSize: '14px',
          color: 'var(--text-color)',
        }}>
          <strong>⚠️ {duplicateWarning.message}</strong>
          <div style={{ marginTop: '8px', fontSize: '12px', color: 'var(--text-muted)' }}>
            Similar transactions:
            <ul style={{ marginTop: '4px', paddingLeft: '20px' }}>
              {duplicateWarning.similar.slice(0, 3).map(t => (
                <li key={t.id}>
                  {t.description} - {new Date(t.date).toLocaleDateString()} - ${t.amount.toFixed(2)}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
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

      <div className="form-group">
        <label>Tags</label>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '8px' }}>
          {tags.map((tag, index) => (
            <span
              key={index}
              className="tag"
              style={{
                backgroundColor: 'var(--light-bg)',
                color: 'var(--text-color)',
                padding: '4px 8px',
                borderRadius: '4px',
                fontSize: '14px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                border: '1px solid var(--border-color)',
              }}
            >
              {tag}
              <button
                type="button"
                onClick={() => setTags(tags.filter((_, i) => i !== index))}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: '16px',
                  color: 'var(--text-muted)',
                  padding: 0,
                  marginLeft: '4px',
                }}
              >
                ×
              </button>
            </span>
          ))}
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <input
            type="text"
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && tagInput.trim()) {
                e.preventDefault();
                handleAddTag();
              }
            }}
            className="input"
            placeholder="Type a tag"
            style={{ flex: 1 }}
          />
          <button
            type="button"
            onClick={handleAddTag}
            className="btn btn-secondary"
            disabled={!tagInput.trim()}
            style={{ whiteSpace: 'nowrap' }}
          >
            Add Tag
          </button>
        </div>
      </div>

      <div className="form-group">
        <label>Notes (optional)</label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="input"
          rows={3}
          placeholder="Add any additional notes..."
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