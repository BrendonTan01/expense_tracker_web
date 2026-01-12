import { useState } from 'react';
import { Transaction, Bucket } from '../types';
import { formatDate, formatCurrency } from '../utils/dateHelpers';

interface TransactionListProps {
  transactions: Transaction[];
  buckets: Bucket[];
  onDelete: (id: string) => void;
  onEdit?: (transaction: Transaction) => void;
}

export default function TransactionList({
  transactions,
  buckets,
  onDelete,
  onEdit,
}: TransactionListProps) {
  const [filterType, setFilterType] = useState<'all' | 'expense' | 'income'>('all');
  const [sortBy, setSortBy] = useState<'date' | 'amount'>('date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  const getBucketName = (bucketId?: string) => {
    if (!bucketId) return null;
    return buckets.find((b) => b.id === bucketId)?.name;
  };

  const filteredTransactions = transactions.filter((t) => {
    if (filterType === 'all') return true;
    return t.type === filterType;
  });

  const sortedTransactions = [...filteredTransactions].sort((a, b) => {
    let comparison = 0;
    if (sortBy === 'date') {
      comparison = new Date(a.date).getTime() - new Date(b.date).getTime();
    } else {
      comparison = a.amount - b.amount;
    }
    return sortOrder === 'asc' ? comparison : -comparison;
  });

  return (
    <div className="transaction-list">
      <div className="transaction-list-header">
        <h2>Transactions</h2>
        <div className="filters">
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value as typeof filterType)}
            className="input input-sm"
          >
            <option value="all">All</option>
            <option value="expense">Expenses</option>
            <option value="income">Income</option>
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
      </div>

      {sortedTransactions.length === 0 ? (
        <p className="empty-state">No transactions yet. Add one to get started!</p>
      ) : (
        <div className="transaction-table">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Type</th>
                <th>Description</th>
                <th>Bucket</th>
                <th>Amount</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {sortedTransactions.map((transaction) => (
                <tr key={transaction.id} className={`transaction-row transaction-${transaction.type}`}>
                  <td>{formatDate(transaction.date)}</td>
                  <td>
                    <span className={`badge badge-${transaction.type}`}>
                      {transaction.type}
                    </span>
                  </td>
                  <td>{transaction.description}</td>
                  <td>
                    {transaction.bucketId ? (
                      <span className="bucket-badge">
                        {getBucketName(transaction.bucketId)}
                      </span>
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </td>
                  <td className={transaction.type === 'income' ? 'amount-income' : 'amount-expense'}>
                    {transaction.type === 'income' ? '+' : '-'}
                    {formatCurrency(transaction.amount)}
                  </td>
                  <td>
                    <div className="action-buttons">
                      {onEdit && (
                        <button
                          onClick={() => onEdit(transaction)}
                          className="btn btn-sm btn-secondary"
                        >
                          Edit
                        </button>
                      )}
                      <button
                        onClick={() => onDelete(transaction.id)}
                        className="btn btn-sm btn-danger"
                      >
                        Delete
                      </button>
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