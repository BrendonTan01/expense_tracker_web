import { useState } from 'react';
import { Budget, Bucket } from '../types';

interface BudgetManagerProps {
  budgets: Budget[];
  buckets: Bucket[];
  onAdd: (budget: Budget) => void;
  onUpdate: (id: string, budget: Partial<Budget>) => void;
  onDelete: (id: string) => void;
}

export default function BudgetManager({
  budgets,
  buckets,
  onAdd,
  onUpdate,
  onDelete,
}: BudgetManagerProps) {
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [bucketId, setBucketId] = useState('');
  const [amount, setAmount] = useState('');
  const [period, setPeriod] = useState<'monthly' | 'yearly'>('monthly');
  const [year, setYear] = useState(new Date().getFullYear().toString());
  const [month, setMonth] = useState((new Date().getMonth() + 1).toString());
  const [applyToAllMonths, setApplyToAllMonths] = useState(true);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) return;
    if (!bucketId) return;

    if (editingId) {
      // Editing: create single budget entry
      const budgetData: Budget = {
        id: editingId,
        bucketId,
        amount: numAmount,
        period,
        year: parseInt(year),
        month: period === 'monthly' ? parseInt(month) : undefined,
      };
      onUpdate(editingId, budgetData);
    } else {
      // Creating new budget
      if (period === 'yearly') {
        // Yearly: create single budget entry for the entire year
        const budgetData: Budget = {
          id: Date.now().toString(),
          bucketId,
          amount: numAmount,
          period: 'yearly',
          year: parseInt(year),
          month: undefined,
        };
        onAdd(budgetData);
      } else if (period === 'monthly') {
        // Monthly: create budget entries based on selection
        if (applyToAllMonths) {
          // Create 12 budget entries, one for each month
          const baseTime = Date.now();
          for (let m = 1; m <= 12; m++) {
            const budgetData: Budget = {
              id: `${baseTime}-${m}`,
              bucketId,
              amount: numAmount,
              period: 'monthly',
              year: parseInt(year),
              month: m,
            };
            onAdd(budgetData);
          }
        } else {
          // Create single budget entry for selected month
          const budgetData: Budget = {
            id: Date.now().toString(),
            bucketId,
            amount: numAmount,
            period: 'monthly',
            year: parseInt(year),
            month: parseInt(month),
          };
          onAdd(budgetData);
        }
      }
    }

    resetForm();
  };

  const resetForm = () => {
    setShowForm(false);
    setEditingId(null);
    setBucketId('');
    setAmount('');
    setPeriod('monthly');
    setYear(new Date().getFullYear().toString());
    setMonth((new Date().getMonth() + 1).toString());
    setApplyToAllMonths(true);
  };

  const handleEdit = (budget: Budget) => {
    setEditingId(budget.id);
    setBucketId(budget.bucketId);
    setAmount(budget.amount.toString());
    setPeriod(budget.period);
    setYear(budget.year.toString());
    setMonth(budget.month?.toString() || (new Date().getMonth() + 1).toString());
    setApplyToAllMonths(false); // When editing, show single month selector
    setShowForm(true);
  };

  const handleCancel = () => {
    resetForm();
  };

  const getBudgetLabel = (budget: Budget) => {
    if (budget.period === 'monthly' && budget.month) {
      const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      return `${monthNames[budget.month - 1]} ${budget.year}`;
    }
    return `${budget.year}`;
  };

  return (
    <div className="budget-manager">
      <div className="budget-manager-header">
        <h2>Budgets</h2>
        {!showForm && (
          <button onClick={() => setShowForm(true)} className="btn btn-primary">
            Add Budget
          </button>
        )}
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="budget-form">
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
            <label>Period</label>
            <div className="radio-group">
              <label className="radio-label">
                <input
                  type="radio"
                  value="monthly"
                  checked={period === 'monthly'}
                  onChange={(e) => setPeriod(e.target.value as 'monthly' | 'yearly')}
                />
                Monthly
              </label>
              <label className="radio-label">
                <input
                  type="radio"
                  value="yearly"
                  checked={period === 'yearly'}
                  onChange={(e) => setPeriod(e.target.value as 'monthly' | 'yearly')}
                />
                Yearly
              </label>
            </div>
          </div>

          <div className="form-group">
            <label>Year</label>
            <input
              type="number"
              value={year}
              onChange={(e) => setYear(e.target.value)}
              className="input"
              min="2000"
              max="2100"
              required
            />
          </div>

          {period === 'monthly' && (
            <>
              <div className="form-group">
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={applyToAllMonths}
                    onChange={(e) => setApplyToAllMonths(e.target.checked)}
                    disabled={!!editingId}
                  />
                  <span>Apply to all months</span>
                </label>
                {editingId && (
                  <p style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>
                    (Cannot change when editing)
                  </p>
                )}
              </div>

              {!applyToAllMonths && (
                <div className="form-group">
                  <label>Month</label>
                  <select
                    value={month}
                    onChange={(e) => setMonth(e.target.value)}
                    className="input"
                    required
                  >
                    {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => {
                      const date = new Date(2000, m - 1, 1);
                      return (
                        <option key={m} value={m.toString()}>
                          {date.toLocaleDateString('en-US', { month: 'long' })}
                        </option>
                      );
                    })}
                  </select>
                </div>
              )}
            </>
          )}

          <div className="form-actions">
            <button type="submit" className="btn btn-primary">
              {editingId ? 'Update' : 'Add'} Budget
            </button>
            <button type="button" onClick={handleCancel} className="btn btn-secondary">
              Cancel
            </button>
          </div>
        </form>
      )}

      <div className="budget-list">
        {budgets.length === 0 ? (
          <p className="empty-state">No budgets set. Create one to track spending limits!</p>
        ) : (
          <div className="budget-table">
            <table>
              <thead>
                <tr>
                  <th>Bucket</th>
                  <th>Period</th>
                  <th>Amount</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {budgets.map((budget) => {
                  const bucket = buckets.find((b) => b.id === budget.bucketId);
                  return (
                    <tr key={budget.id}>
                      <td>
                        <span
                          className="bucket-badge"
                          style={{ backgroundColor: bucket?.color || '#ccc' }}
                        >
                          {bucket?.name || 'Unknown'}
                        </span>
                      </td>
                      <td>{getBudgetLabel(budget)}</td>
                      <td>${budget.amount.toFixed(2)}</td>
                      <td>
                        <div className="action-buttons">
                          <button
                            onClick={() => handleEdit(budget)}
                            className="btn btn-sm btn-secondary"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => onDelete(budget.id)}
                            className="btn btn-sm btn-danger"
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
