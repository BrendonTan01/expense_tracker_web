import { useMemo } from 'react';
import { Transaction, Bucket } from '../types';
import { calculateSpendingTrends, calculateCategoryAverages, compareCategorySpending } from '../utils/analytics';
import { formatCurrency } from '../utils/dateHelpers';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

interface EnhancedAnalyticsProps {
  transactions: Transaction[];
  buckets: Bucket[];
}

export default function EnhancedAnalytics({ transactions, buckets }: EnhancedAnalyticsProps) {
  const trends = useMemo(() => calculateSpendingTrends(transactions, 12), [transactions]);
  const categoryAverages = useMemo(() => calculateCategoryAverages(transactions, buckets), [transactions, buckets]);
  
  const now = new Date();
  const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const currentMonthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const previousMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const previousMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);
  
  const categoryComparison = useMemo(() => 
    compareCategorySpending(transactions, buckets, currentMonthStart, currentMonthEnd, previousMonthStart, previousMonthEnd),
    [transactions, buckets]
  );

  const totalIncome = useMemo(() => 
    transactions.filter(t => t.type === 'income').reduce((sum, t) => sum + t.amount, 0),
    [transactions]
  );
  
  const totalExpenses = useMemo(() => 
    transactions.filter(t => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0),
    [transactions]
  );

  const averageTransactionAmount = useMemo(() => {
    if (transactions.length === 0) return 0;
    return transactions.reduce((sum, t) => sum + t.amount, 0) / transactions.length;
  }, [transactions]);

  return (
    <div style={{ marginTop: '32px' }}>
      <h3 style={{ marginBottom: '24px' }}>Enhanced Analytics</h3>

      {/* Key Metrics */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: '16px',
        marginBottom: '32px'
      }}>
        <div style={{
          padding: '16px',
          background: 'var(--light-bg)',
          borderRadius: '8px',
          border: '1px solid var(--border-color)'
        }}>
          <div style={{ fontSize: '14px', color: 'var(--text-muted)', marginBottom: '4px' }}>
            Total Income
          </div>
          <div style={{ fontSize: '24px', fontWeight: 600, color: 'var(--success-color)' }}>
            {formatCurrency(totalIncome)}
          </div>
        </div>
        <div style={{
          padding: '16px',
          background: 'var(--light-bg)',
          borderRadius: '8px',
          border: '1px solid var(--border-color)'
        }}>
          <div style={{ fontSize: '14px', color: 'var(--text-muted)', marginBottom: '4px' }}>
            Total Expenses
          </div>
          <div style={{ fontSize: '24px', fontWeight: 600, color: 'var(--danger-color)' }}>
            {formatCurrency(totalExpenses)}
          </div>
        </div>
        <div style={{
          padding: '16px',
          background: 'var(--light-bg)',
          borderRadius: '8px',
          border: '1px solid var(--border-color)'
        }}>
          <div style={{ fontSize: '14px', color: 'var(--text-muted)', marginBottom: '4px' }}>
            Net Balance
          </div>
          <div style={{
            fontSize: '24px',
            fontWeight: 600,
            color: totalIncome - totalExpenses >= 0 ? 'var(--success-color)' : 'var(--danger-color)'
          }}>
            {formatCurrency(totalIncome - totalExpenses)}
          </div>
        </div>
        <div style={{
          padding: '16px',
          background: 'var(--light-bg)',
          borderRadius: '8px',
          border: '1px solid var(--border-color)'
        }}>
          <div style={{ fontSize: '14px', color: 'var(--text-muted)', marginBottom: '4px' }}>
            Avg Transaction
          </div>
          <div style={{ fontSize: '24px', fontWeight: 600 }}>
            {formatCurrency(averageTransactionAmount)}
          </div>
        </div>
      </div>

      {/* Spending Trends Chart */}
      {trends.length > 0 && (
        <div style={{
          padding: '20px',
          background: 'var(--light-bg)',
          borderRadius: '8px',
          border: '1px solid var(--border-color)',
          marginBottom: '32px'
        }}>
          <h4 style={{ marginBottom: '16px' }}>12-Month Spending Trends</h4>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={trends}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="period" />
              <YAxis />
              <Tooltip formatter={(value: number | undefined) => value !== undefined ? formatCurrency(value) : ''} />
              <Legend />
              <Line type="monotone" dataKey="income" stroke="#10b981" strokeWidth={2} name="Income" />
              <Line type="monotone" dataKey="expenses" stroke="#ef4444" strokeWidth={2} name="Expenses" />
              <Line type="monotone" dataKey="balance" stroke="#6366f1" strokeWidth={2} name="Balance" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Category Averages */}
      {categoryAverages.length > 0 && (
        <div style={{
          padding: '20px',
          background: 'var(--light-bg)',
          borderRadius: '8px',
          border: '1px solid var(--border-color)',
          marginBottom: '32px'
        }}>
          <h4 style={{ marginBottom: '16px' }}>Average Spending by Category</h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {categoryAverages.map(cat => (
              <div key={cat.bucketId} style={{
                padding: '12px',
                background: 'var(--card-bg)',
                borderRadius: '6px',
                border: '1px solid var(--border-color)'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontWeight: 500 }}>{cat.bucketName}</div>
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                      {cat.count} transactions
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontWeight: 600 }}>{formatCurrency(cat.average)}</div>
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                      Total: {formatCurrency(cat.total)}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Category Comparison */}
      {categoryComparison.length > 0 && (
        <div style={{
          padding: '20px',
          background: 'var(--light-bg)',
          borderRadius: '8px',
          border: '1px solid var(--border-color)'
        }}>
          <h4 style={{ marginBottom: '16px' }}>Month-over-Month Category Comparison</h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {categoryComparison.map(cat => (
              <div key={cat.bucketId} style={{
                padding: '12px',
                background: 'var(--card-bg)',
                borderRadius: '6px',
                border: '1px solid var(--border-color)'
              }}>
                <div style={{ fontWeight: 500, marginBottom: '8px' }}>{cat.bucketName}</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', marginBottom: '4px' }}>
                  <span>This Month: {formatCurrency(cat.currentPeriod)}</span>
                  <span>Last Month: {formatCurrency(cat.previousPeriod)}</span>
                </div>
                <div style={{
                  fontSize: '14px',
                  fontWeight: 600,
                  color: cat.changeAmount >= 0 ? 'var(--danger-color)' : 'var(--success-color)'
                }}>
                  {cat.changeAmount >= 0 ? '+' : ''}{cat.change.toFixed(1)}% ({cat.changeAmount >= 0 ? '+' : ''}{formatCurrency(cat.changeAmount)})
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
