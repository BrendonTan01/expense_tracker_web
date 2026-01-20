import { useState, useMemo, useEffect } from 'react';
import { Transaction, Bucket, FilterPreset } from '../types';
import { formatDate, formatCurrency } from '../utils/dateHelpers';
import { saveToLocalStorage, loadFromLocalStorage, generateId } from '../utils/storage';

interface TransactionListProps {
  transactions: Transaction[];
  buckets: Bucket[];
  onDelete: (id: string) => void;
  onEdit?: (transaction: Transaction) => void;
  onDuplicate?: (transaction: Transaction) => void;
  onCreateRecurring?: (transaction: Transaction) => void;
  onBulkDelete?: (ids: string[]) => void;
}

const PRESETS_STORAGE_KEY = 'filter_presets';

export default function TransactionList({
  transactions,
  buckets,
  onDelete,
  onEdit,
  onDuplicate,
  onCreateRecurring,
  onBulkDelete,
}: TransactionListProps) {
  const [filterType, setFilterType] = useState<'all' | 'expense' | 'income' | 'investment'>('all');
  const [sortBy, setSortBy] = useState<'date' | 'amount'>('date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterBucket, setFilterBucket] = useState<string>('all');
  const [filterTag, setFilterTag] = useState<string>('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [minAmount, setMinAmount] = useState('');
  const [maxAmount, setMaxAmount] = useState('');
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkMode, setBulkMode] = useState(false);
  const [presets, setPresets] = useState<FilterPreset[]>([]);
  const [showPresetForm, setShowPresetForm] = useState(false);
  const [presetName, setPresetName] = useState('');

  const getBucketName = (bucketId?: string) => {
    if (!bucketId) return null;
    return buckets.find((b) => b.id === bucketId)?.name;
  };

  // Get all unique tags from transactions
  const allTags = useMemo(() => {
    const tagSet = new Set<string>();
    transactions.forEach(t => {
      if (t.tags && t.tags.length > 0) {
        t.tags.forEach(tag => tagSet.add(tag));
      }
    });
    return Array.from(tagSet).sort();
  }, [transactions]);

  const filteredTransactions = useMemo(() => {
    return transactions.filter((t) => {
      // Type filter
      if (filterType !== 'all' && t.type !== filterType) return false;

      // Search query (description, notes)
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const matchesDescription = t.description.toLowerCase().includes(query);
        const matchesNotes = t.notes?.toLowerCase().includes(query) || false;
        const matchesAmount = t.amount.toString().includes(query);
        if (!matchesDescription && !matchesNotes && !matchesAmount) return false;
      }

      // Bucket filter
      if (filterBucket !== 'all') {
        if (filterBucket === 'none' && t.bucketId) return false;
        if (filterBucket !== 'none' && t.bucketId !== filterBucket) return false;
      }

      // Tag filter
      if (filterTag !== 'all') {
        if (!t.tags || !t.tags.includes(filterTag)) return false;
      }

      // Date range filter
      if (startDate) {
        const transactionDate = new Date(t.date);
        const start = new Date(startDate);
        if (transactionDate < start) return false;
      }
      if (endDate) {
        const transactionDate = new Date(t.date);
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        if (transactionDate > end) return false;
      }

      // Amount range filter
      if (minAmount) {
        const min = parseFloat(minAmount);
        if (!isNaN(min) && t.amount < min) return false;
      }
      if (maxAmount) {
        const max = parseFloat(maxAmount);
        if (!isNaN(max) && t.amount > max) return false;
      }

      return true;
    });
  }, [transactions, filterType, searchQuery, filterBucket, filterTag, startDate, endDate, minAmount, maxAmount]);

  const sortedTransactions = useMemo(() => {
    return [...filteredTransactions].sort((a, b) => {
      let comparison = 0;
      if (sortBy === 'date') {
        comparison = new Date(a.date).getTime() - new Date(b.date).getTime();
      } else {
        comparison = a.amount - b.amount;
      }
      return sortOrder === 'asc' ? comparison : -comparison;
    });
  }, [filteredTransactions, sortBy, sortOrder]);

  const handleExportCSV = () => {
    const headers = ['Date', 'Type', 'Description', 'Bucket', 'Amount', 'Tags', 'Notes'];
    const rows = sortedTransactions.map(t => [
      formatDate(t.date),
      t.type,
      t.description,
      getBucketName(t.bucketId) || '',
      t.amount.toString(),
      (t.tags || []).join('; '),
      t.notes || '',
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `transactions_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  useEffect(() => {
    const saved = loadFromLocalStorage<FilterPreset[]>(PRESETS_STORAGE_KEY, []);
    setPresets(saved);
  }, []);

  const savePresets = (newPresets: FilterPreset[]) => {
    setPresets(newPresets);
    saveToLocalStorage(PRESETS_STORAGE_KEY, newPresets);
  };

  const applyPreset = (preset: FilterPreset) => {
    setFilterType(preset.filters.type || 'all');
    setFilterBucket(preset.filters.bucketId || 'all');
    setFilterTag(preset.filters.tag || 'all');
    setStartDate(preset.filters.startDate || '');
    setEndDate(preset.filters.endDate || '');
    setMinAmount(preset.filters.minAmount?.toString() || '');
    setMaxAmount(preset.filters.maxAmount?.toString() || '');
    setShowAdvancedFilters(true);
  };

  const saveCurrentAsPreset = () => {
    if (!presetName.trim()) return;
    
    const preset: FilterPreset = {
      id: generateId(),
      name: presetName,
      filters: {
        type: filterType !== 'all' ? filterType : undefined,
        bucketId: filterBucket !== 'all' ? filterBucket : undefined,
        tag: filterTag !== 'all' ? filterTag : undefined,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        minAmount: minAmount ? parseFloat(minAmount) : undefined,
        maxAmount: maxAmount ? parseFloat(maxAmount) : undefined,
      },
    };
    
    savePresets([...presets, preset]);
    setPresetName('');
    setShowPresetForm(false);
  };

  const deletePreset = (id: string) => {
    savePresets(presets.filter(p => p.id !== id));
  };

  const toggleSelection = (id: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
  };

  const selectAll = () => {
    setSelectedIds(new Set(sortedTransactions.map(t => t.id)));
  };

  const clearSelection = () => {
    setSelectedIds(new Set());
  };

  const handleBulkDelete = () => {
    if (selectedIds.size === 0) return;
    if (window.confirm(`Delete ${selectedIds.size} selected transaction(s)?`)) {
      if (onBulkDelete) {
        onBulkDelete(Array.from(selectedIds));
      } else {
        selectedIds.forEach(id => onDelete(id));
      }
      setSelectedIds(new Set());
      setBulkMode(false);
    }
  };

  const clearFilters = () => {
    setSearchQuery('');
    setFilterBucket('all');
    setFilterTag('all');
    setStartDate('');
    setEndDate('');
    setMinAmount('');
    setMaxAmount('');
  };

  return (
    <div className="transaction-list">
      <div className="transaction-list-header">
        <h2>Transactions</h2>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
          {bulkMode && (
            <>
              <span style={{ fontSize: '14px', color: 'var(--text-muted)' }}>
                {selectedIds.size} selected
              </span>
              <button onClick={selectAll} className="btn btn-sm btn-secondary">
                Select All
              </button>
              <button onClick={clearSelection} className="btn btn-sm btn-secondary">
                Clear
              </button>
              {onBulkDelete && (
                <button onClick={handleBulkDelete} className="btn btn-sm btn-danger">
                  Delete Selected
                </button>
              )}
              <button onClick={() => { setBulkMode(false); clearSelection(); }} className="btn btn-sm btn-secondary">
                Cancel
              </button>
            </>
          )}
          {!bulkMode && (
            <>
              <button onClick={() => setBulkMode(true)} className="btn btn-sm btn-secondary">
                Bulk Select
              </button>
              <button onClick={handleExportCSV} className="btn btn-sm btn-secondary">
                Export CSV
              </button>
              <button
                onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
                className="btn btn-sm btn-secondary"
              >
                {showAdvancedFilters ? 'Hide' : 'Show'} Filters
              </button>
            </>
          )}
        </div>
      </div>

      {/* Filter Presets */}
      {presets.length > 0 && (
        <div style={{ marginBottom: '16px', display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontSize: '14px', fontWeight: 500 }}>Presets:</span>
          {presets.map(preset => (
            <button
              key={preset.id}
              onClick={() => applyPreset(preset)}
              className="btn btn-sm btn-secondary"
              style={{ position: 'relative' }}
            >
              {preset.name}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  deletePreset(preset.id);
                }}
                style={{
                  marginLeft: '8px',
                  background: 'none',
                  border: 'none',
                  color: 'inherit',
                  cursor: 'pointer',
                  fontSize: '16px',
                  padding: 0,
                }}
                title="Delete preset"
              >
                ×
              </button>
            </button>
          ))}
        </div>
      )}

      {showPresetForm && (
        <div style={{
          padding: '12px',
          background: 'var(--light-bg)',
          borderRadius: '8px',
          marginBottom: '16px',
          border: '1px solid var(--border-color)',
          display: 'flex',
          gap: '8px',
          alignItems: 'center'
        }}>
          <input
            type="text"
            value={presetName}
            onChange={(e) => setPresetName(e.target.value)}
            placeholder="Preset name"
            className="input input-sm"
            style={{ flex: 1 }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                saveCurrentAsPreset();
              } else if (e.key === 'Escape') {
                setShowPresetForm(false);
                setPresetName('');
              }
            }}
          />
          <button onClick={saveCurrentAsPreset} className="btn btn-sm btn-primary" disabled={!presetName.trim()}>
            Save
          </button>
          <button onClick={() => { setShowPresetForm(false); setPresetName(''); }} className="btn btn-sm btn-secondary">
            Cancel
          </button>
        </div>
      )}

      <div className="filters" style={{ marginBottom: '16px', display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          type="text"
          placeholder="Search transactions..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="input input-sm"
          style={{ flex: '1', minWidth: '200px' }}
        />
        <select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value as typeof filterType)}
          className="input input-sm"
        >
          <option value="all">All Types</option>
          <option value="expense">Expenses</option>
          <option value="income">Income</option>
          <option value="investment">Investments</option>
        </select>
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
          className="input input-sm"
        >
          <option value="date">Sort by Date</option>
          <option value="amount">Sort by Amount</option>
        </select>
        <button
          onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
          className="btn btn-sm btn-secondary"
        >
          {sortOrder === 'asc' ? '↑' : '↓'}
        </button>
      </div>

      {showAdvancedFilters && (
        <div className="advanced-filters" style={{ 
          padding: '16px', 
          backgroundColor: '#f8fafc', 
          borderRadius: '8px', 
          marginBottom: '16px',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '12px'
        }}>
          <div>
            <label style={{ display: 'block', marginBottom: '4px', fontSize: '14px', fontWeight: 500 }}>
              Bucket
            </label>
            <select
              value={filterBucket}
              onChange={(e) => setFilterBucket(e.target.value)}
              className="input input-sm"
            >
              <option value="all">All Buckets</option>
              <option value="none">No Bucket</option>
              {buckets.map((bucket) => (
                <option key={bucket.id} value={bucket.id}>
                  {bucket.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: '4px', fontSize: '14px', fontWeight: 500 }}>
              Tag
            </label>
            <select
              value={filterTag}
              onChange={(e) => setFilterTag(e.target.value)}
              className="input input-sm"
            >
              <option value="all">All Tags</option>
              {allTags.map((tag) => (
                <option key={tag} value={tag}>
                  {tag}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: '4px', fontSize: '14px', fontWeight: 500 }}>
              Start Date
            </label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="input input-sm"
            />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: '4px', fontSize: '14px', fontWeight: 500 }}>
              End Date
            </label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="input input-sm"
            />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: '4px', fontSize: '14px', fontWeight: 500 }}>
              Min Amount
            </label>
            <input
              type="number"
              step="0.01"
              value={minAmount}
              onChange={(e) => setMinAmount(e.target.value)}
              className="input input-sm"
              placeholder="0.00"
            />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: '4px', fontSize: '14px', fontWeight: 500 }}>
              Max Amount
            </label>
            <input
              type="number"
              step="0.01"
              value={maxAmount}
              onChange={(e) => setMaxAmount(e.target.value)}
              className="input input-sm"
              placeholder="0.00"
            />
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: '8px' }}>
            <button onClick={clearFilters} className="btn btn-sm btn-secondary">
              Clear Filters
            </button>
            <button
              onClick={() => setShowPresetForm(true)}
              className="btn btn-sm btn-primary"
            >
              Save as Preset
            </button>
          </div>
        </div>
      )}

      {sortedTransactions.length === 0 ? (
        <p className="empty-state">
          {transactions.length === 0 
            ? 'No transactions yet. Add one to get started!'
            : 'No transactions match your filters. Try adjusting your search criteria.'}
        </p>
      ) : (
        <div className="transaction-table">
          <table>
            <thead>
              <tr>
                {bulkMode && <th style={{ width: '40px' }}>
                  <input
                    type="checkbox"
                    checked={selectedIds.size === sortedTransactions.length && sortedTransactions.length > 0}
                    onChange={(e) => {
                      if (e.target.checked) {
                        selectAll();
                      } else {
                        clearSelection();
                      }
                    }}
                  />
                </th>}
                <th>Date</th>
                <th>Type</th>
                <th>Description</th>
                <th>Bucket</th>
                <th>Tags</th>
                <th>Amount</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {sortedTransactions.map((transaction) => (
                <tr key={transaction.id} className={`transaction-row transaction-${transaction.type}`}>
                  {bulkMode && (
                    <td>
                      <input
                        type="checkbox"
                        checked={selectedIds.has(transaction.id)}
                        onChange={() => toggleSelection(transaction.id)}
                      />
                    </td>
                  )}
                  <td>{formatDate(transaction.date)}</td>
                  <td>
                    <span className={`badge badge-${transaction.type}`}>
                      {transaction.type}
                    </span>
                  </td>
                  <td>
                    <div>
                      {transaction.description}
                      {transaction.notes && (
                        <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>
                          {transaction.notes}
                        </div>
                      )}
                    </div>
                  </td>
                  <td>
                    {transaction.bucketId ? (
                      <span className="bucket-badge">
                        {getBucketName(transaction.bucketId)}
                      </span>
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </td>
                  <td>
                    {transaction.tags && transaction.tags.length > 0 ? (
                      <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                        {transaction.tags.map((tag, idx) => (
                          <span
                            key={idx}
                            style={{
                              backgroundColor: 'var(--light-bg)',
                              color: 'var(--text-color)',
                              padding: '2px 6px',
                              borderRadius: '4px',
                              fontSize: '12px',
                              border: '1px solid var(--border-color)',
                            }}
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </td>
                  <td className={
                    transaction.type === 'income'
                      ? 'amount-income'
                      : transaction.type === 'investment'
                        ? 'amount-investment'
                        : 'amount-expense'
                  }>
                    {transaction.type === 'income' ? '+' : '-'}
                    {formatCurrency(transaction.amount)}
                  </td>
                  <td>
                    <div className="action-buttons" style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                      {onEdit && !bulkMode && (
                        <button
                          onClick={() => onEdit(transaction)}
                          className="btn btn-sm btn-secondary"
                          title="Edit transaction"
                        >
                          Edit
                        </button>
                      )}
                      {onDuplicate && !bulkMode && (
                        <button
                          onClick={() => onDuplicate(transaction)}
                          className="btn btn-sm btn-secondary"
                          title="Duplicate transaction"
                        >
                          📋
                        </button>
                      )}
                      {onCreateRecurring && !bulkMode && (
                        <button
                          onClick={() => onCreateRecurring(transaction)}
                          className="btn btn-sm btn-secondary"
                          title="Create recurring transaction"
                        >
                          🔄
                        </button>
                      )}
                      {!bulkMode && (
                        <button
                          onClick={() => onDelete(transaction.id)}
                          className="btn btn-sm btn-danger"
                          title="Delete transaction"
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}