import { addMoney, parseMoneyInput, getMoneyInputError } from '../utils/money';
import { useState, useMemo } from 'react';
import { Budget, Bucket } from '../types';
import { generateId } from '../utils/storage';
import { useMutationAttempt } from '../utils/mutationAttempt';
import { useAuth } from '../contexts/AuthContext';

interface BudgetManagerProps {
  budgets: Budget[];
  buckets: Bucket[];
  onAdd: (budgets: Budget[], requestId: string) => Promise<void>;
  onUpdate: (id: string, budget: Partial<Budget>) => Promise<void>;
  onDelete: (id: string) => void | Promise<void>;
}

interface MonthlyBudgetGroup {
  bucketId: string;
  year: number;
  budgets: Budget[];
}

export default function BudgetManager({
  budgets,
  buckets,
  onAdd,
  onUpdate,
  onDelete,
}: BudgetManagerProps) {
  const { user } = useAuth();
  const save = useMutationAttempt<Budget[]>(user?.id || '');
  const bulkSave = useMutationAttempt<Budget[]>(user?.id || '');
  const [formError, setFormError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [bucketId, setBucketId] = useState('');
  const [amount, setAmount] = useState('');
  const [amountTouched, setAmountTouched] = useState(false);
  const amountError = getMoneyInputError(amount, amountTouched);
  const [period, setPeriod] = useState<'monthly' | 'yearly'>('monthly');
  const [year, setYear] = useState(new Date().getFullYear().toString());
  const [month, setMonth] = useState((new Date().getMonth() + 1).toString());
  const [applyToAllMonths, setApplyToAllMonths] = useState(true);
  
  // Bulk edit state
  const [bulkEditGroup, setBulkEditGroup] = useState<MonthlyBudgetGroup | null>(null);
  const [selectedMonths, setSelectedMonths] = useState<Set<number>>(new Set());
  const [bulkAmount, setBulkAmount] = useState('');
  const [bulkAmountTouched, setBulkAmountTouched] = useState(false);
  const bulkAmountError = getMoneyInputError(bulkAmount, bulkAmountTouched);

  // Group monthly budgets by bucket and year
  const monthlyGroups = useMemo(() => {
    const groups = new Map<string, MonthlyBudgetGroup>();
    
    budgets
      .filter(b => b.period === 'monthly')
      .forEach(budget => {
        const key = `${budget.bucketId}-${budget.year}`;
        if (!groups.has(key)) {
          groups.set(key, {
            bucketId: budget.bucketId,
            year: budget.year,
            budgets: [],
          });
        }
        groups.get(key)!.budgets.push(budget);
      });
    
    // Sort budgets within each group by month
    groups.forEach(group => {
      group.budgets.sort((a, b) => (a.month || 0) - (b.month || 0));
    });
    
    return Array.from(groups.values());
  }, [budgets]);

  // Yearly budgets (not grouped)
  const yearlyBudgets = useMemo(() => {
    return budgets.filter(b => b.period === 'yearly');
  }, [budgets]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (save.pending) return;
    setAmountTouched(true);
    setFormError(null);
    const numAmount = parseMoneyInput(amount);
    if (numAmount === null || !bucketId) return;
    const validYear = /^\d{1,4}$/.test(year) && Number(year) >= 1 && Number(year) <= 9999;
    const validMonth = /^\d{1,2}$/.test(month) && Number(month) >= 1 && Number(month) <= 12;
    if (!validYear || (period === 'monthly' && !applyToAllMonths && !validMonth)) {
      setFormError('Enter a whole year from 1 to 9999 and a valid month.');
      return;
    }
    const months = period === 'monthly' ? (!editingId && applyToAllMonths ? Array.from({ length: 12 }, (_, i) => i + 1) : [Number(month)]) : [undefined];
    const fingerprint = JSON.stringify({ editingId, bucketId, numAmount, period, year: Number(year), months });
    await save.run(fingerprint, () => months.map(m => ({
      id: editingId || generateId(), bucketId, amount: numAmount, period, year: Number(year), month: m,
    })), async attempt => {
      if (editingId) await onUpdate(editingId, attempt.payload[0]);
      else await onAdd(attempt.payload, attempt.requestId);
    }, resetForm);
  };

  const resetForm = () => {
    save.clear();
    setFormError(null);
    setShowForm(false);
    setEditingId(null);
    setBucketId('');
    setAmount('');
    setAmountTouched(false);
    setPeriod('monthly');
    setYear(new Date().getFullYear().toString());
    setMonth((new Date().getMonth() + 1).toString());
    setApplyToAllMonths(true);
    setBulkEditGroup(null);
    setSelectedMonths(new Set());
    setBulkAmount('');
    setBulkAmountTouched(false);
  };

  const handleEdit = (budget: Budget) => {
    if (save.pending) return;
    save.clear();
    setFormError(null);
    setEditingId(budget.id);
    setBucketId(budget.bucketId);
    setAmount(budget.amount.toString());
    setAmountTouched(false);
    setPeriod(budget.period);
    setYear(budget.year.toString());
    setMonth(budget.month?.toString() || (new Date().getMonth() + 1).toString());
    setApplyToAllMonths(false); // When editing, show single month selector
    setShowForm(true);
  };

  const handleCancel = () => {
    resetForm();
  };

  // Bulk edit functions
  const startBulkEdit = (group: MonthlyBudgetGroup) => {
    if (bulkSave.pending) return;
    try {
      const avgAmount = group.budgets.reduce((total, budget) => addMoney(total, budget.amount), 0) / group.budgets.length;
      bulkSave.clear();
      setBulkEditGroup(group);
      setSelectedMonths(new Set(group.budgets.map(b => b.month!).filter(m => m !== undefined)));
      setBulkAmount(avgAmount.toFixed(2));
      setBulkAmountTouched(false);
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'Unable to calculate the budget amounts.');
    }
  };

  const cancelBulkEdit = () => {
    if (bulkSave.pending) return;
    bulkSave.clear();
    setBulkEditGroup(null);
    setSelectedMonths(new Set());
    setBulkAmount('');
    setBulkAmountTouched(false);
  };

  const toggleMonthSelection = (month: number) => {
    const newSelected = new Set(selectedMonths);
    if (newSelected.has(month)) {
      newSelected.delete(month);
    } else {
      newSelected.add(month);
    }
    setSelectedMonths(newSelected);
  };

  const selectAllMonths = () => {
    if (!bulkEditGroup) return;
    const allMonths = new Set(bulkEditGroup.budgets.map(b => b.month!).filter(m => m !== undefined));
    setSelectedMonths(allMonths);
  };

  const deselectAllMonths = () => {
    setSelectedMonths(new Set());
  };

  const handleBulkUpdate = async () => {
    if (bulkSave.pending) return;
    setBulkAmountTouched(true);
    if (!bulkEditGroup || selectedMonths.size === 0) return;
    const numAmount = parseMoneyInput(bulkAmount);
    if (numAmount === null) return;
    const budgetsToUpdate = bulkEditGroup.budgets.filter(b => b.month && selectedMonths.has(b.month));
    await bulkSave.run(JSON.stringify({ ids: budgetsToUpdate.map(b => b.id), numAmount }),
      () => budgetsToUpdate.map(b => ({ ...b, amount: numAmount })), async attempt => {
        const results = await Promise.allSettled(attempt.payload.map(budget => onUpdate(budget.id, {
          bucketId: budget.bucketId, amount: budget.amount, period: budget.period, year: budget.year, month: budget.month,
        })));
        const failures = results.filter(r => r.status === 'rejected');
        if (failures.length) throw new Error(`${failures.length} budget updates failed. Some updates may have saved; retry the same amounts to finish.`);
      }, () => {
        setBulkEditGroup(null); setSelectedMonths(new Set()); setBulkAmount(''); setBulkAmountTouched(false);
      });
  };

  const handleBulkDelete = () => {
    if (!bulkEditGroup || selectedMonths.size === 0) return;
    
    if (confirm(`Are you sure you want to delete ${selectedMonths.size} budget${selectedMonths.size > 1 ? 's' : ''}?`)) {
      bulkEditGroup.budgets
        .filter(b => b.month && selectedMonths.has(b.month))
        .forEach(budget => {
          onDelete(budget.id);
        });
      
      cancelBulkEdit();
    }
  };

  const getMonthName = (month: number) => {
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return monthNames[month - 1];
  };

  return (
    <div className="budget-manager">
      <div className="budget-manager-header">
        <h2>Budgets</h2>
        {!showForm && !bulkEditGroup && (
          <button onClick={() => setShowForm(true)} className="btn btn-primary">
            Add Budget
          </button>
        )}
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="budget-form">
          <fieldset disabled={save.pending} style={{ border: 0, padding: 0, margin: 0 }}>
          {(formError || save.error) && <p role="alert" style={{ color: 'var(--danger-color)' }}>{formError || save.error}</p>}
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
              type="text" inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              onBlur={() => setAmountTouched(true)}
              onInvalid={(e) => { e.preventDefault(); setAmountTouched(true); }}
              aria-invalid={Boolean(amountError)}
              aria-describedby={amountError ? 'budget-amount-error' : undefined}
              style={amountError ? { borderColor: 'var(--danger-color)' } : undefined}
              className="input"
              required
            />
            {amountError && <p id="budget-amount-error" aria-live="polite" style={{ color: 'var(--danger-color)', fontSize: '12px', marginTop: '6px' }}>{amountError}</p>}
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
              min="1"
              max="9999"
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
                  <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
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
              {save.pending ? 'Saving…' : `${editingId ? 'Update' : 'Add'} Budget`}
            </button>
            <button type="button" onClick={handleCancel} className="btn btn-secondary">
              Cancel
            </button>
          </div>
          </fieldset>
        </form>
      )}

      {bulkEditGroup && (
        <div className="bulk-edit-form" style={{ 
          border: '1px solid var(--border-color)', 
          borderRadius: '8px', 
          padding: '20px', 
          marginBottom: '20px',
          backgroundColor: 'var(--card-bg)'
        }}>
          <fieldset disabled={bulkSave.pending} style={{ border: 0, padding: 0, margin: 0 }}>
          {bulkSave.error && <p role="alert" style={{ color: 'var(--danger-color)' }}>{bulkSave.error}</p>}
          <h3 style={{ marginTop: 0, marginBottom: '16px' }}>
            Bulk Edit: {buckets.find(b => b.id === bulkEditGroup.bucketId)?.name || 'Unknown'} - {bulkEditGroup.year}
          </h3>
          
          <div className="form-group">
            <label>Amount (applies to all selected months)</label>
            <input
              type="text" inputMode="decimal"
              value={bulkAmount}
              onChange={(e) => setBulkAmount(e.target.value)}
              onBlur={() => setBulkAmountTouched(true)}
              onInvalid={(e) => { e.preventDefault(); setBulkAmountTouched(true); }}
              aria-invalid={Boolean(bulkAmountError)}
              aria-describedby={bulkAmountError ? 'bulk-budget-amount-error' : undefined}
              style={bulkAmountError ? { borderColor: 'var(--danger-color)' } : undefined}
              className="input"
              required
            />
            {bulkAmountError && <p id="bulk-budget-amount-error" aria-live="polite" style={{ color: 'var(--danger-color)', fontSize: '12px', marginTop: '6px' }}>{bulkAmountError}</p>}
          </div>

          <div className="form-group">
            <label>Select Months ({selectedMonths.size} selected)</label>
            <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
              <button 
                type="button" 
                onClick={selectAllMonths} 
                className="btn btn-sm btn-secondary"
                style={{ fontSize: '12px' }}
              >
                Select All
              </button>
              <button 
                type="button" 
                onClick={deselectAllMonths} 
                className="btn btn-sm btn-secondary"
                style={{ fontSize: '12px' }}
              >
                Deselect All
              </button>
            </div>
            <div style={{ 
              display: 'grid', 
              gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', 
              gap: '8px' 
            }}>
              {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => {
                const budget = bulkEditGroup.budgets.find(b => b.month === m);
                const hasBudget = !!budget;
                const isSelected = selectedMonths.has(m);
                
                return (
                  <label 
                    key={m} 
                    style={{ 
                      display: 'flex', 
                      flexDirection: 'column',
                      gap: '4px', 
                      padding: '10px',
                      border: hasBudget ? '1px solid var(--border-color)' : '1px dashed var(--border-color)',
                      borderRadius: '4px',
                      backgroundColor: isSelected ? 'var(--hover-bg)' : 'var(--card-bg)',
                      cursor: hasBudget ? 'pointer' : 'not-allowed',
                      opacity: hasBudget ? 1 : 0.5
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => hasBudget && toggleMonthSelection(m)}
                        disabled={!hasBudget}
                      />
                      <span style={{ fontWeight: '600', fontSize: '14px' }}>
                        {getMonthName(m)}
                      </span>
                    </div>
                    {hasBudget && (
                      <span style={{ fontSize: '13px', color: 'var(--text-muted)', marginLeft: '24px' }}>
                        ${budget.amount.toFixed(2)}
                      </span>
                    )}
                    {!hasBudget && (
                      <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginLeft: '24px', fontStyle: 'italic' }}>
                        No budget
                      </span>
                    )}
                  </label>
                );
              })}
            </div>
          </div>

          <div className="form-actions">
            <button 
              type="button" 
              onClick={handleBulkUpdate} 
              className="btn btn-primary"
              disabled={selectedMonths.size === 0}
            >
              Update {selectedMonths.size} Budget{selectedMonths.size !== 1 ? 's' : ''}
            </button>
            <button 
              type="button" 
              onClick={handleBulkDelete} 
              className="btn btn-danger"
              disabled={selectedMonths.size === 0}
            >
              Delete {selectedMonths.size} Budget{selectedMonths.size !== 1 ? 's' : ''}
            </button>
            <button type="button" onClick={cancelBulkEdit} className="btn btn-secondary">
              Cancel
            </button>
          </div>
          </fieldset>
        </div>
      )}

      <div className="budget-list">
        {budgets.length === 0 ? (
          <p className="empty-state">No budgets set. Create one to track spending limits!</p>
        ) : (
          <>
            {/* Monthly Budgets - Grouped */}
            {monthlyGroups.length > 0 && (
              <div style={{ marginBottom: '32px' }}>
                <h3 style={{ marginBottom: '16px', fontSize: '18px', fontWeight: '600' }}>Monthly Budgets</h3>
                {monthlyGroups.map((group) => {
                  const bucket = buckets.find((b) => b.id === group.bucketId);
                  return (
                    <div 
                      key={`${group.bucketId}-${group.year}`}
                      style={{ 
                        marginBottom: '24px',
                        border: '1px solid var(--border-color)',
                        borderRadius: '8px',
                        padding: '16px',
                        backgroundColor: 'var(--card-bg)'
                      }}
                    >
                      <div style={{ 
                        display: 'flex', 
                        justifyContent: 'space-between', 
                        alignItems: 'center',
                        marginBottom: '12px'
                      }}>
                        <div>
                          <span
                            className="bucket-badge"
                            style={{ backgroundColor: bucket?.color || '#ccc', marginRight: '8px' }}
                          >
                            {bucket?.name || 'Unknown'}
                          </span>
                          <span style={{ fontWeight: '600' }}>{group.year}</span>
                        </div>
                        <button
                          onClick={() => startBulkEdit(group)}
                          className="btn btn-sm btn-secondary"
                        >
                          Bulk Edit
                        </button>
                      </div>
                      <div style={{ 
                        display: 'grid', 
                        gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', 
                        gap: '8px' 
                      }}>
                        {group.budgets.map((budget) => (
                          <div 
                            key={budget.id}
                            style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              padding: '8px 12px',
                              border: '1px solid var(--border-color)',
                              borderRadius: '4px',
                              backgroundColor: 'var(--light-bg)'
                            }}
                          >
                            <div>
                              <div style={{ fontWeight: '500', fontSize: '14px' }}>
                                {getMonthName(budget.month!)}
                              </div>
                              <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                                ${budget.amount.toFixed(2)}
                              </div>
                            </div>
                            <div className="action-buttons" style={{ display: 'flex', gap: '4px' }}>
                              <button
                                onClick={() => handleEdit(budget)}
                                className="btn btn-sm btn-secondary"
                                style={{ fontSize: '11px', padding: '4px 8px' }}
                              >
                                Edit
                              </button>
                              <button
                                onClick={() => onDelete(budget.id)}
                                className="btn btn-sm btn-danger"
                                style={{ fontSize: '11px', padding: '4px 8px' }}
                              >
                                Delete
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Yearly Budgets */}
            {yearlyBudgets.length > 0 && (
              <div>
                <h3 style={{ marginBottom: '16px', fontSize: '18px', fontWeight: '600' }}>Yearly Budgets</h3>
                <div className="budget-table">
                  <table>
                    <thead>
                      <tr>
                        <th>Bucket</th>
                        <th>Year</th>
                        <th>Amount</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {yearlyBudgets.map((budget) => {
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
                            <td>{budget.year}</td>
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
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
