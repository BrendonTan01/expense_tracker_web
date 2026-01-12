import { useState, useMemo } from 'react';
import { Transaction, Bucket } from '../types';
import { formatCurrency } from '../utils/dateHelpers';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

interface SummaryProps {
  transactions: Transaction[];
  buckets: Bucket[];
}

type Period = 'all' | 'month' | 'year' | 'custom';

interface ChartDataPoint {
  period: string;
  income: number;
  [key: string]: string | number; // For bucket expenses
}

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
    const filterDate = new Date();

    if (period === 'month') {
      // Set to the first day of last month
      filterDate.setFullYear(now.getFullYear(), now.getMonth() - 1, 1);
      filterDate.setHours(0, 0, 0, 0);
    } else if (period === 'year') {
      // Set to January 1st of last year
      filterDate.setFullYear(now.getFullYear() - 1, 0, 1);
      filterDate.setHours(0, 0, 0, 0);
    }

    return transactions.filter((t) => {
      const transactionDate = new Date(t.date);
      transactionDate.setHours(0, 0, 0, 0);
      return transactionDate >= filterDate;
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

    const grouped: Record<string, { income: number; expenses: Record<string, number> }> = {};

    filteredTransactions.forEach((t) => {
      const date = new Date(t.date);
      let key: string;
      
      if (groupByMonth) {
        key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      } else {
        key = String(date.getFullYear());
      }

      if (!grouped[key]) {
        grouped[key] = { income: 0, expenses: {} };
      }

      if (t.type === 'income') {
        grouped[key].income += t.amount;
      } else if (t.type === 'expense') {
        if (t.bucketId) {
          grouped[key].expenses[t.bucketId] = (grouped[key].expenses[t.bucketId] || 0) + t.amount;
        } else {
          // Handle expenses without buckets
          grouped[key].expenses['no-bucket'] = (grouped[key].expenses['no-bucket'] || 0) + t.amount;
        }
      }
    });

    // Convert to chart data format
    const data: ChartDataPoint[] = Object.entries(grouped)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([period, data]) => {
        const point: ChartDataPoint = {
          period: groupByMonth 
            ? new Date(period + '-01').toLocaleDateString('en-US', { year: 'numeric', month: 'short' })
            : period,
          income: data.income,
        };

        // Add each bucket as a separate field
        buckets.forEach((bucket) => {
          point[`expense_${bucket.id}`] = data.expenses[bucket.id] || 0;
        });
        // Add expenses without buckets
        point['expense_no-bucket'] = data.expenses['no-bucket'] || 0;

        return point;
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
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'white',
                    border: '1px solid #e2e8f0',
                    borderRadius: '8px',
                    padding: '12px',
                  }}
                  formatter={(value: any, name: any) => {
                    if (typeof value === 'number' && value > 0) {
                      // In recharts, the name parameter can be either the name prop or dataKey
                      // We need to handle both cases
                      let displayName = name;
                      
                      // If name is a dataKey (starts with "expense_"), convert it to bucket name
                      if (name && typeof name === 'string' && name.startsWith('expense_')) {
                        const bucketId = name.replace('expense_', '');
                        if (bucketId === 'no-bucket') {
                          displayName = 'No Bucket';
                        } else {
                          const bucket = buckets.find(b => b.id === bucketId);
                          displayName = bucket?.name || 'Unknown';
                        }
                      } else if (name === 'income' || name === 'Income') {
                        displayName = 'Income';
                      }
                      
                      return [formatCurrency(value), displayName];
                    }
                    return null;
                  }}
                  labelFormatter={(label) => `Period: ${label}`}
                />
                <Legend
                  wrapperStyle={{ paddingTop: '20px' }}
                  formatter={(value: string) => {
                    if (value === 'income') return 'Income';
                    const bucketId = value.replace('expense_', '');
                    if (bucketId === 'no-bucket') return 'No Bucket';
                    const bucket = buckets.find(b => b.id === bucketId);
                    return bucket?.name || 'Unknown';
                  }}
                />
                <Bar 
                  dataKey="income" 
                  fill="#10b981" 
                  name="Income" 
                  radius={[4, 4, 0, 0]}
                />
                {buckets.map((bucket) => (
                  <Bar
                    key={bucket.id}
                    dataKey={`expense_${bucket.id}`}
                    stackId="expenses"
                    fill={bucket.color || '#94a3b8'}
                    name={bucket.name}
                  />
                ))}
                <Bar
                  dataKey="expense_no-bucket"
                  stackId="expenses"
                  fill="#94a3b8"
                  name="No Bucket"
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