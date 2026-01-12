import { useState, useMemo } from 'react';
import { Transaction, Bucket } from '../types';
import { formatCurrency } from '../utils/dateHelpers';

interface SummaryProps {
  transactions: Transaction[];
  buckets: Bucket[];
}

type Period = 'all' | 'month' | 'year';

export default function Summary({ transactions, buckets }: SummaryProps) {
  const [period, setPeriod] = useState<Period>('all');

  const filteredTransactions = useMemo(() => {
    if (period === 'all') return transactions;

    const now = new Date();
    const filterDate = new Date();

    if (period === 'month') {
      filterDate.setMonth(now.getMonth() - 1);
    } else if (period === 'year') {
      filterDate.setFullYear(now.getFullYear() - 1);
    }

    return transactions.filter((t) => new Date(t.date) >= filterDate);
  }, [transactions, period]);

  const totals = useMemo(() => {
    const income = filteredTransactions
      .filter((t) => t.type === 'income')
      .reduce((sum, t) => sum + t.amount, 0);

    const expenses = filteredTransactions
      .filter((t) => t.type === 'expense')
      .reduce((sum, t) => sum + t.amount, 0);

    return {
      income,
      expenses,
      balance: income - expenses,
    };
  }, [filteredTransactions]);

  const bucketBreakdown = useMemo(() => {
    const breakdown: Record<string, number> = {};

    filteredTransactions
      .filter((t) => t.type === 'expense' && t.bucketId)
      .forEach((t) => {
        const bucketId = t.bucketId!;
        breakdown[bucketId] = (breakdown[bucketId] || 0) + t.amount;
      });

    return Object.entries(breakdown)
      .map(([bucketId, amount]) => {
        const bucket = buckets.find((b) => b.id === bucketId);
        return {
          bucketId,
          bucketName: bucket?.name || 'Unknown',
          bucketColor: bucket?.color,
          amount,
        };
      })
      .sort((a, b) => b.amount - a.amount);
  }, [filteredTransactions, buckets]);

  return (
    <div className="summary">
      <div className="summary-header">
        <h2>Summary</h2>
        <select
          value={period}
          onChange={(e) => setPeriod(e.target.value as Period)}
          className="input input-sm"
        >
          <option value="all">All Time</option>
          <option value="month">Last Month</option>
          <option value="year">Last Year</option>
        </select>
      </div>

      <div className="summary-cards">
        <div className="summary-card card-income">
          <h3>Total Income</h3>
          <p className="summary-amount">{formatCurrency(totals.income)}</p>
        </div>
        <div className="summary-card card-expense">
          <h3>Total Expenses</h3>
          <p className="summary-amount">{formatCurrency(totals.expenses)}</p>
        </div>
        <div className={`summary-card card-balance ${totals.balance >= 0 ? 'positive' : 'negative'}`}>
          <h3>Balance</h3>
          <p className="summary-amount">{formatCurrency(totals.balance)}</p>
        </div>
      </div>

      {bucketBreakdown.length > 0 && (
        <div className="bucket-breakdown">
          <h3>Expenses by Bucket</h3>
          <div className="breakdown-list">
            {bucketBreakdown.map((item) => {
              const percentage = totals.expenses > 0 
                ? (item.amount / totals.expenses) * 100 
                : 0;
              
              return (
                <div key={item.bucketId} className="breakdown-item">
                  <div className="breakdown-header">
                    <div className="breakdown-info">
                      <span
                        className="breakdown-color"
                        style={{ backgroundColor: item.bucketColor || '#ccc' }}
                      />
                      <span className="breakdown-name">{item.bucketName}</span>
                    </div>
                    <span className="breakdown-amount">{formatCurrency(item.amount)}</span>
                  </div>
                  <div className="breakdown-bar">
                    <div
                      className="breakdown-bar-fill"
                      style={{
                        width: `${percentage}%`,
                        backgroundColor: item.bucketColor || '#ccc',
                      }}
                    />
                  </div>
                  <div className="breakdown-percentage">{percentage.toFixed(1)}%</div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}