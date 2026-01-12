import { useState, useMemo } from 'react';
import { Transaction, Bucket } from '../types';
import { formatCurrency } from '../utils/dateHelpers';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, TooltipProps } from 'recharts';

interface SummaryProps {
  transactions: Transaction[];
  buckets: Bucket[];
}

type Period = 'all' | 'month' | 'year' | 'custom';

interface ChartDataPoint {
  period: string;
  income: number;
  expenses: number;
  bucketBreakdown?: Record<string, number>; // For tooltip breakdown
}

// Custom Tooltip Component
const CustomTooltip = ({ active, payload, label, buckets }: TooltipProps<number, string> & { buckets: Bucket[] }) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload as ChartDataPoint;
    const incomeValue = payload.find(p => p.dataKey === 'income')?.value as number || 0;
    const expenseValue = payload.find(p => p.dataKey === 'expenses')?.value as number || 0;
    
    return (
      <div style={{
        backgroundColor: 'white',
        border: '1px solid #e2e8f0',
        borderRadius: '8px',
        padding: '12px',
        boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
      }}>
        <p style={{ margin: '0 0 8px 0', fontWeight: 600 }}>{`Period: ${label}`}</p>
        {incomeValue > 0 && (
          <p style={{ margin: '4px 0', color: '#10b981' }}>
            Income: {formatCurrency(incomeValue)}
          </p>
        )}
        {expenseValue > 0 && (
          <>
            <p style={{ margin: '4px 0 8px 0', color: '#ef4444' }}>
              Expenses: {formatCurrency(expenseValue)}
            </p>
            {data.bucketBreakdown && Object.keys(data.bucketBreakdown).length > 0 && (
              <div style={{ marginTop: '8px', paddingTop: '8px', borderTop: '1px solid #e2e8f0' }}>
                <p style={{ margin: '0 0 4px 0', fontSize: '12px', fontWeight: 600, color: '#64748b' }}>
                  By Bucket:
                </p>
                {Object.entries(data.bucketBreakdown)
                  .sort(([, a], [, b]) => (b as number) - (a as number))
                  .map(([bucketId, amount]) => {
                    const bucket = bucketId === 'no-bucket' 
                      ? null 
                      : buckets.find(b => b.id === bucketId);
                    const bucketName = bucket?.name || 'No Bucket';
                    const bucketColor = bucket?.color || '#94a3b8';
                    
                    return (
                      <div key={bucketId} style={{ 
                        display: 'flex', 
                        alignItems: 'center', 
                        gap: '8px', 
                        margin: '4px 0',
                        fontSize: '12px'
                      }}>
                        <span style={{
                          width: '12px',
                          height: '12px',
                          backgroundColor: bucketColor,
                          borderRadius: '2px',
                          display: 'inline-block',
                        }} />
                        <span>{bucketName}: {formatCurrency(amount as number)}</span>
                      </div>
                    );
                  })}
              </div>
            )}
          </>
        )}
      </div>
    );
  }
  return null;
};

export default function Summary({ transactions, buckets }: SummaryProps) {
  const [period, setPeriod] = useState<Period>('year');
  const [customStartDate, setCustomStartDate] = useState<string>('');
  const [customEndDate, setCustomEndDate] = useState<string>('');
  const [useCustomRange, setUseCustomRange] = useState(false);

  const filteredTransactions = useMemo(() => {
    if (useCustomRange && customStartDate && customEndDate) {
      const start = new Date(customStartDate);
      const end = new Date(customEndDate);
      end.setHours(23, 59, 59, 999); // Include the entire end date
      return transactions.filter((t) => {
        const date = new Date(t.date);
        return date >= start && date <= end;
      });
    }

    if (period === 'all') return transactions;

    const now = new Date();
    now.setHours(0, 0, 0, 0);
    let startDate: Date;
    let endDate: Date;

    if (period === 'month') {
      // Last month: first day to last day of previous month
      const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      startDate = new Date(lastMonth.getFullYear(), lastMonth.getMonth(), 1);
      startDate.setHours(0, 0, 0, 0);
      // Last day of last month
      endDate = new Date(now.getFullYear(), now.getMonth(), 0);
      endDate.setHours(23, 59, 59, 999);
    } else if (period === 'year') {
      // Last year: January 1 to December 31 of previous year
      const lastYear = now.getFullYear() - 1;
      startDate = new Date(lastYear, 0, 1);
      startDate.setHours(0, 0, 0, 0);
      endDate = new Date(lastYear, 11, 31);
      endDate.setHours(23, 59, 59, 999);
    } else {
      return transactions;
    }

    return transactions.filter((t) => {
      const transactionDate = new Date(t.date);
      return transactionDate >= startDate && transactionDate <= endDate;
    });
  }, [transactions, period, useCustomRange, customStartDate, customEndDate]);

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
          bucketColor: bucket?.color || '#94a3b8',
          amount,
        };
      })
      .sort((a, b) => b.amount - a.amount);
  }, [filteredTransactions, buckets]);

  // Prepare chart data - group by year
  const chartData = useMemo(() => {
    if (filteredTransactions.length === 0) return [];

    // Determine grouping based on date range
    const dates = filteredTransactions.map(t => new Date(t.date));
    const minDate = new Date(Math.min(...dates.map(d => d.getTime())));
    const maxDate = new Date(Math.max(...dates.map(d => d.getTime())));
    const diffMonths = (maxDate.getFullYear() - minDate.getFullYear()) * 12 + (maxDate.getMonth() - minDate.getMonth());
    
    // Group by month if range is less than 2 years, otherwise by year
    const groupByMonth = diffMonths <= 24;

    const grouped: Record<string, { income: number; expenses: number; bucketBreakdown: Record<string, number> }> = {};

    filteredTransactions.forEach((t) => {
      const date = new Date(t.date);
      let key: string;
      
      if (groupByMonth) {
        key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      } else {
        key = String(date.getFullYear());
      }

      if (!grouped[key]) {
        grouped[key] = { income: 0, expenses: 0, bucketBreakdown: {} };
      }

      if (t.type === 'income') {
        grouped[key].income += t.amount;
      } else if (t.type === 'expense') {
        grouped[key].expenses += t.amount;
        const bucketKey = t.bucketId || 'no-bucket';
        grouped[key].bucketBreakdown[bucketKey] = (grouped[key].bucketBreakdown[bucketKey] || 0) + t.amount;
      }
    });

    // Convert to chart data format
    const data: ChartDataPoint[] = Object.entries(grouped)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([period, data]) => {
        return {
          period: groupByMonth 
            ? new Date(period + '-01').toLocaleDateString('en-US', { year: 'numeric', month: 'short' })
            : period,
          income: data.income,
          expenses: data.expenses,
          bucketBreakdown: data.bucketBreakdown,
        };
      });

    return data;
  }, [filteredTransactions, buckets]);

  const handleApplyCustomRange = () => {
    if (customStartDate && customEndDate) {
      setUseCustomRange(true);
      setPeriod('custom');
    }
  };

  const handleClearCustomRange = () => {
    setCustomStartDate('');
    setCustomEndDate('');
    setUseCustomRange(false);
    setPeriod('year');
  };

  const handlePeriodChange = (newPeriod: Period) => {
    setPeriod(newPeriod);
    if (newPeriod !== 'custom') {
      setUseCustomRange(false);
    }
  };

  return (
    <div className="summary">
      <div className="summary-header">
        <h2>Summary</h2>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
          <select
            value={period}
            onChange={(e) => handlePeriodChange(e.target.value as Period)}
            className="input input-sm"
            style={{ minWidth: '150px' }}
          >
            <option value="all">All Time</option>
            <option value="month">Last Month</option>
            <option value="year">Last Year</option>
            <option value="custom">Custom Range</option>
          </select>
        </div>
      </div>

      {(period === 'custom' || useCustomRange) && (
        <div className="date-range-selector">
          <div className="date-range-inputs">
            <div>
              <label style={{ display: 'block', marginBottom: '4px', fontSize: '14px', fontWeight: 500 }}>
                Start Date
              </label>
              <input
                type="date"
                value={customStartDate}
                onChange={(e) => setCustomStartDate(e.target.value)}
                style={{ minWidth: '150px' }}
              />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '4px', fontSize: '14px', fontWeight: 500 }}>
                End Date
              </label>
              <input
                type="date"
                value={customEndDate}
                onChange={(e) => setCustomEndDate(e.target.value)}
                style={{ minWidth: '150px' }}
              />
            </div>
          </div>
          <div className="date-range-actions">
            <button className="btn-apply" onClick={handleApplyCustomRange}>
              Apply
            </button>
            <button className="btn-clear" onClick={handleClearCustomRange}>
              Clear
            </button>
          </div>
        </div>
      )}

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

      {chartData.length > 0 && (
        <div className="chart-container">
          <div className="chart-title">Income and Expenses Over Time</div>
          <div className="chart-wrapper">
            <ResponsiveContainer width="100%" height={400}>
              <BarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis 
                  dataKey="period" 
                  stroke="#64748b"
                  style={{ fontSize: '12px' }}
                />
                <YAxis 
                  stroke="#64748b"
                  style={{ fontSize: '12px' }}
                  tickFormatter={(value) => {
                    if (value >= 1000) return `$${(value / 1000).toFixed(1)}k`;
                    return `$${value}`;
                  }}
                />
                <Tooltip content={<CustomTooltip buckets={buckets} />} />
                <Legend />
                <Bar 
                  dataKey="income" 
                  fill="#10b981" 
                  name="Income"
                  radius={[4, 4, 0, 0]}
                />
                <Bar
                  dataKey="expenses"
                  fill="#ef4444"
                  name="Expenses"
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

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
