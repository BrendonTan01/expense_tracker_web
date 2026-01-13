import { useState, useEffect, useMemo } from 'react';
import { SpendingGoal, Transaction, Bucket } from '../types';
import { saveToLocalStorage, loadFromLocalStorage, generateId } from '../utils/storage';
import { formatCurrency } from '../utils/dateHelpers';

interface SpendingGoalsProps {
  transactions: Transaction[];
  buckets: Bucket[];
}

const STORAGE_KEY = 'spending_goals';

export default function SpendingGoals({ transactions, buckets }: SpendingGoalsProps) {
  const [goals, setGoals] = useState<SpendingGoal[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingGoal, setEditingGoal] = useState<SpendingGoal | null>(null);
  
  const [formData, setFormData] = useState<Omit<SpendingGoal, 'id' | 'currentAmount'>>({
    name: '',
    targetAmount: 0,
    deadline: '',
    bucketId: '',
    type: 'savings',
  });

  useEffect(() => {
    const saved = loadFromLocalStorage<SpendingGoal[]>(STORAGE_KEY, []);
    setGoals(saved);
  }, []);

  const goalsWithProgress = useMemo(() => {
    return goals.map(goal => {
      let currentAmount = 0;
      
      if (goal.type === 'savings') {
        // Calculate total income minus expenses
        const relevantTransactions = goal.bucketId
          ? transactions.filter(t => t.bucketId === goal.bucketId)
          : transactions;
        
        currentAmount = relevantTransactions.reduce((sum, t) => {
          if (t.type === 'income') return sum + t.amount;
          return sum - t.amount;
        }, 0);
      } else if (goal.type === 'spending_limit') {
        // Calculate total spending for bucket
        const relevantTransactions = transactions.filter(
          t => t.type === 'expense' && t.bucketId === goal.bucketId
        );
        currentAmount = relevantTransactions.reduce((sum, t) => sum + t.amount, 0);
      }
      
      return {
        ...goal,
        currentAmount: Math.max(0, currentAmount),
      };
    });
  }, [goals, transactions]);

  const saveGoals = (newGoals: SpendingGoal[]) => {
    setGoals(newGoals);
    saveToLocalStorage(STORAGE_KEY, newGoals);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || formData.targetAmount <= 0) return;

    const goal: SpendingGoal = {
      id: editingGoal?.id || generateId(),
      ...formData,
      currentAmount: 0,
      bucketId: formData.bucketId || undefined,
      deadline: formData.deadline || undefined,
    };

    if (editingGoal) {
      saveGoals(goals.map(g => g.id === editingGoal.id ? goal : g));
    } else {
      saveGoals([...goals, goal]);
    }

    setFormData({
      name: '',
      targetAmount: 0,
      deadline: '',
      bucketId: '',
      type: 'savings',
    });
    setShowForm(false);
    setEditingGoal(null);
  };

  const handleDelete = (id: string) => {
    if (window.confirm('Delete this goal?')) {
      saveGoals(goals.filter(g => g.id !== id));
    }
  };

  const handleEdit = (goal: SpendingGoal) => {
    setEditingGoal(goal);
    setFormData({
      name: goal.name,
      targetAmount: goal.targetAmount,
      deadline: goal.deadline || '',
      bucketId: goal.bucketId || '',
      type: goal.type,
    });
    setShowForm(true);
  };

  const getProgress = (goal: SpendingGoal & { currentAmount: number }) => {
    if (goal.type === 'spending_limit') {
      return Math.min(100, (goal.currentAmount / goal.targetAmount) * 100);
    }
    return Math.min(100, (goal.currentAmount / goal.targetAmount) * 100);
  };

  const getProgressColor = (goal: SpendingGoal & { currentAmount: number }) => {
    const progress = getProgress(goal);
    if (goal.type === 'spending_limit') {
      if (progress >= 100) return 'var(--danger-color)';
      if (progress >= 80) return 'var(--warning-color)';
      return 'var(--success-color)';
    }
    if (progress >= 100) return 'var(--success-color)';
    if (progress >= 50) return 'var(--primary-color)';
    return 'var(--secondary-color)';
  };

  return (
    <div style={{ marginBottom: '24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <h3>Spending Goals</h3>
        <button
          onClick={() => {
            setShowForm(!showForm);
            if (showForm) {
              setEditingGoal(null);
              setFormData({
                name: '',
                targetAmount: 0,
                deadline: '',
                bucketId: '',
                type: 'savings',
              });
            }
          }}
          className="btn btn-secondary btn-sm"
        >
          {showForm ? 'Cancel' : '+ New Goal'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} style={{
          padding: '16px',
          background: 'var(--light-bg)',
          borderRadius: '8px',
          marginBottom: '16px',
          border: '1px solid var(--border-color)'
        }}>
          <div className="form-group">
            <label>Goal Name *</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="input"
              required
              placeholder="e.g., Emergency Fund"
            />
          </div>

          <div className="form-group">
            <label>Goal Type</label>
            <div className="radio-group">
              <label className="radio-label">
                <input
                  type="radio"
                  value="savings"
                  checked={formData.type === 'savings'}
                  onChange={(e) => setFormData({ ...formData, type: e.target.value as 'savings' | 'spending_limit' })}
                />
                Savings Goal
              </label>
              <label className="radio-label">
                <input
                  type="radio"
                  value="spending_limit"
                  checked={formData.type === 'spending_limit'}
                  onChange={(e) => setFormData({ ...formData, type: e.target.value as 'savings' | 'spending_limit' })}
                />
                Spending Limit
              </label>
            </div>
          </div>

          <div className="form-group">
            <label>Target Amount *</label>
            <input
              type="number"
              step="0.01"
              min="0.01"
              value={formData.targetAmount || ''}
              onChange={(e) => setFormData({ ...formData, targetAmount: parseFloat(e.target.value) || 0 })}
              className="input"
              required
            />
          </div>

          {formData.type === 'spending_limit' && (
            <div className="form-group">
              <label>Bucket *</label>
              <select
                value={formData.bucketId}
                onChange={(e) => setFormData({ ...formData, bucketId: e.target.value })}
                className="input"
                required={formData.type === 'spending_limit'}
              >
                <option value="">Select a bucket</option>
                {buckets.map(b => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </div>
          )}

          <div className="form-group">
            <label>Deadline (optional)</label>
            <input
              type="date"
              value={formData.deadline}
              onChange={(e) => setFormData({ ...formData, deadline: e.target.value })}
              className="input"
            />
          </div>

          <div className="form-actions">
            <button type="submit" className="btn btn-primary">
              {editingGoal ? 'Update' : 'Create'} Goal
            </button>
            <button
              type="button"
              onClick={() => {
                setShowForm(false);
                setEditingGoal(null);
              }}
              className="btn btn-secondary"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {goalsWithProgress.length === 0 && !showForm ? (
        <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '20px' }}>
          No goals yet. Create a savings goal or spending limit to track your progress.
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {goalsWithProgress.map(goal => {
            const progress = getProgress(goal);
            const progressColor = getProgressColor(goal);
            const remaining = goal.targetAmount - goal.currentAmount;
            
            return (
              <div
                key={goal.id}
                style={{
                  padding: '16px',
                  background: 'var(--light-bg)',
                  borderRadius: '8px',
                  border: '1px solid var(--border-color)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                  <div>
                    <div style={{ fontWeight: 600, marginBottom: '4px' }}>{goal.name}</div>
                    <div style={{ fontSize: '14px', color: 'var(--text-muted)' }}>
                      {goal.type === 'savings' ? 'Savings Goal' : 'Spending Limit'}
                      {goal.bucketId && ` • ${buckets.find(b => b.id === goal.bucketId)?.name || 'Unknown'}`}
                      {goal.deadline && ` • Due: ${new Date(goal.deadline).toLocaleDateString()}`}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      onClick={() => handleEdit(goal)}
                      className="btn btn-secondary btn-sm"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(goal.id)}
                      className="btn btn-danger btn-sm"
                    >
                      Delete
                    </button>
                  </div>
                </div>
                
                <div style={{ marginBottom: '8px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px', fontSize: '14px' }}>
                    <span>
                      {formatCurrency(goal.currentAmount)} / {formatCurrency(goal.targetAmount)}
                    </span>
                    <span style={{ fontWeight: 600 }}>{progress.toFixed(1)}%</span>
                  </div>
                  <div style={{
                    height: '8px',
                    background: 'var(--border-color)',
                    borderRadius: '4px',
                    overflow: 'hidden',
                  }}>
                    <div style={{
                      height: '100%',
                      width: `${progress}%`,
                      background: progressColor,
                      transition: 'width 0.3s',
                    }} />
                  </div>
                </div>
                
                {goal.type === 'savings' && (
                  <div style={{ fontSize: '14px', color: 'var(--text-muted)' }}>
                    {remaining > 0 ? (
                      <>Remaining: {formatCurrency(remaining)}</>
                    ) : (
                      <span style={{ color: 'var(--success-color)', fontWeight: 600 }}>
                        ✓ Goal achieved!
                      </span>
                    )}
                  </div>
                )}
                {goal.type === 'spending_limit' && (
                  <div style={{ fontSize: '14px', color: 'var(--text-muted)' }}>
                    {remaining > 0 ? (
                      <>Remaining budget: {formatCurrency(remaining)}</>
                    ) : (
                      <span style={{ color: 'var(--danger-color)', fontWeight: 600 }}>
                        ⚠ Limit exceeded by {formatCurrency(Math.abs(remaining))}
                      </span>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
