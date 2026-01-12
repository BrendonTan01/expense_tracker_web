import { useState, useMemo } from 'react';
import { Transaction, Bucket, Budget } from '../types';
import { formatCurrency } from '../utils/dateHelpers';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell, PieChart, Pie } from 'recharts';
import SummaryNotes from './SummaryNotes';

interface SummaryProps {
  transactions: Transaction[];
  buckets: Bucket[];
  budgets: Budget[];
}

type Period = 'all' | 'month' | 'year' | 'thisYear' | 'thisMonth' | 'custom';

interface ChartDataPoint {
  period: string;
  periodKey: string; // Original key like "2026-01" for month clicks
  income: number;
  expenses: number;
  bucketBreakdown?: Record<string, number>; // For tooltip breakdown
}

interface TooltipPayload {
  dataKey: string;
  value?: number;
  payload: ChartDataPoint;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: TooltipPayload[];
  label?: string;
  buckets: Bucket[];
}

// Custom Tooltip Component
const CustomTooltip = ({ active, payload, label, buckets }: CustomTooltipProps) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload as ChartDataPoint;
    const incomeValue = payload.find((p: TooltipPayload) => p.dataKey === 'income')?.value as number || 0;
    const expenseValue = payload.find((p: TooltipPayload) => p.dataKey === 'expenses')?.value as number || 0;
    
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

export default function Summary({ transactions, buckets, budgets }: SummaryProps) {
  const [period, setPeriod] = useState<Period>('thisYear');
  const [customStartDate, setCustomStartDate] = useState<string>('');
  const [customEndDate, setCustomEndDate] = useState<string>('');
  const [useCustomRange, setUseCustomRange] = useState(false);
  const [budgetFilter, setBudgetFilter] = useState<'all' | 'monthly' | 'yearly'>('all');

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
    } else if (period === 'thisMonth') {
      // This month: first day to last day of current month
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      startDate.setHours(0, 0, 0, 0);
      endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      endDate.setHours(23, 59, 59, 999);
    } else if (period === 'year') {
      // Last year: January 1 to December 31 of previous year
      const lastYear = now.getFullYear() - 1;
      startDate = new Date(lastYear, 0, 1);
      startDate.setHours(0, 0, 0, 0);
      endDate = new Date(lastYear, 11, 31);
      endDate.setHours(23, 59, 59, 999);
    } else if (period === 'thisYear') {
      // This year: January 1 to December 31 of current year
      const currentYear = now.getFullYear();
      startDate = new Date(currentYear, 0, 1);
      startDate.setHours(0, 0, 0, 0);
      endDate = new Date(currentYear, 11, 31);
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

  // Budget tracking
  const budgetStatus = useMemo(() => {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;

    return budgets
      .filter((budget) => {
        // Filter by period type (all/monthly/yearly)
        if (budgetFilter === 'monthly' && budget.period !== 'monthly') {
          return false;
        }
        if (budgetFilter === 'yearly' && budget.period !== 'yearly') {
          return false;
        }
        
        // Filter by current period (only show active budgets)
        if (budget.period === 'monthly') {
          return budget.year === currentYear && budget.month === currentMonth;
        } else {
          return budget.year === currentYear;
        }
      })
      .map((budget) => {
        const bucketExpenses = filteredTransactions
          .filter((t) => t.type === 'expense' && t.bucketId === budget.bucketId)
          .reduce((sum, t) => sum + t.amount, 0);

        const percentage = (bucketExpenses / budget.amount) * 100;
        const remaining = budget.amount - bucketExpenses;

        return {
          budget,
          bucket: buckets.find((b) => b.id === budget.bucketId),
          spent: bucketExpenses,
          budgeted: budget.amount,
          remaining,
          percentage,
          isOverBudget: bucketExpenses > budget.amount,
        };
      });
  }, [budgets, filteredTransactions, buckets, period, useCustomRange, customStartDate, customEndDate, budgetFilter]);

  // Spending trends - compare current period with previous period
  const spendingTrends = useMemo(() => {
    if (period === 'all' || period === 'custom') return null;

    const now = new Date();
    let currentStart: Date, currentEnd: Date, previousStart: Date, previousEnd: Date;

    if (period === 'month') {
      // Last month vs month before
      const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      currentStart = new Date(lastMonth.getFullYear(), lastMonth.getMonth(), 1);
      currentEnd = new Date(now.getFullYear(), now.getMonth(), 0);
      previousStart = new Date(lastMonth.getFullYear(), lastMonth.getMonth() - 1, 1);
      previousEnd = new Date(lastMonth.getFullYear(), lastMonth.getMonth(), 0);
    } else if (period === 'thisMonth') {
      // This month vs last month
      currentStart = new Date(now.getFullYear(), now.getMonth(), 1);
      currentEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      previousStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      previousEnd = new Date(now.getFullYear(), now.getMonth(), 0);
    } else if (period === 'year') {
      // Last year vs year before
      const lastYear = now.getFullYear() - 1;
      currentStart = new Date(lastYear, 0, 1);
      currentEnd = new Date(lastYear, 11, 31);
      previousStart = new Date(lastYear - 1, 0, 1);
      previousEnd = new Date(lastYear - 1, 11, 31);
    } else if (period === 'thisYear') {
      // This year vs last year
      currentStart = new Date(now.getFullYear(), 0, 1);
      currentEnd = new Date(now.getFullYear(), 11, 31);
      previousStart = new Date(now.getFullYear() - 1, 0, 1);
      previousEnd = new Date(now.getFullYear() - 1, 11, 31);
    } else {
      return null;
    }

    const currentExpenses = transactions
      .filter((t) => {
        const date = new Date(t.date);
        return t.type === 'expense' && date >= currentStart && date <= currentEnd;
      })
      .reduce((sum, t) => sum + t.amount, 0);

    const previousExpenses = transactions
      .filter((t) => {
        const date = new Date(t.date);
        return t.type === 'expense' && date >= previousStart && date <= previousEnd;
      })
      .reduce((sum, t) => sum + t.amount, 0);

    const currentIncome = transactions
      .filter((t) => {
        const date = new Date(t.date);
        return t.type === 'income' && date >= currentStart && date <= currentEnd;
      })
      .reduce((sum, t) => sum + t.amount, 0);

    const previousIncome = transactions
      .filter((t) => {
        const date = new Date(t.date);
        return t.type === 'income' && date >= previousStart && date <= previousEnd;
      })
      .reduce((sum, t) => sum + t.amount, 0);

    const expenseChange = previousExpenses > 0 
      ? ((currentExpenses - previousExpenses) / previousExpenses) * 100 
      : 0;
    const incomeChange = previousIncome > 0 
      ? ((currentIncome - previousIncome) / previousIncome) * 100 
      : 0;

    return {
      currentExpenses,
      previousExpenses,
      expenseChange,
      currentIncome,
      previousIncome,
      incomeChange,
    };
  }, [transactions, period]);

  // Pie chart data
  const pieChartData = useMemo(() => {
    return bucketBreakdown.map((item) => ({
      name: item.bucketName,
      value: item.amount,
      color: item.bucketColor,
    }));
  }, [bucketBreakdown]);

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
      .map(([periodKey, data]) => {
        return {
          period: groupByMonth 
            ? new Date(periodKey + '-01').toLocaleDateString('en-US', { year: 'numeric', month: 'short' })
            : periodKey,
          periodKey: periodKey, // Store original key for month clicks
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
    setPeriod('thisYear');
  };

  const handlePeriodChange = (newPeriod: Period) => {
    setPeriod(newPeriod);
    if (newPeriod !== 'custom') {
      setUseCustomRange(false);
    }
  };

  const handleBarClick = (data: any) => {
    // Only allow month clicks when viewing "this year" and data is grouped by month
    if (period !== 'thisYear') return;
    
    // Access the payload from the BarRectangleItem
    const dataPoint = data?.payload as ChartDataPoint | undefined;
    if (!dataPoint || !dataPoint.periodKey) return;
    
    // Check if the periodKey is in month format (YYYY-MM)
    const monthPattern = /^\d{4}-\d{2}$/;
    if (!monthPattern.test(dataPoint.periodKey)) return;
    
    // Parse the month and year
    const [year, month] = dataPoint.periodKey.split('-').map(Number);
    const monthIndex = month - 1; // JavaScript months are 0-indexed
    
    // Calculate first and last day of the month
    const startDate = new Date(year, monthIndex, 1);
    const endDate = new Date(year, monthIndex + 1, 0); // Last day of the month
    
    // Format dates as YYYY-MM-DD for the date inputs
    const formatDate = (date: Date) => {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    };
    
    // Set the custom date range to the clicked month
    setCustomStartDate(formatDate(startDate));
    setCustomEndDate(formatDate(endDate));
    setUseCustomRange(true);
    setPeriod('custom');
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
            <option value="thisMonth">This Month</option>
            <option value="month">Last Month</option>
            <option value="year">Last Year</option>
            <option value="thisYear">This Year</option>
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
          <div className="chart-title">
            Income and Expenses Over Time
            {period === 'thisYear' && (
              <span style={{ fontSize: '14px', fontWeight: 'normal', color: '#64748b', marginLeft: '8px' }}>
                (Click on a month to zoom in)
              </span>
            )}
          </div>
          <div className="chart-wrapper">
            <ResponsiveContainer width="100%" height={400}>
              <BarChart 
                data={chartData} 
                margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
              >
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
                  onClick={handleBarClick}
                >
                  {chartData.map((_, index) => (
                    <Cell 
                      key={`cell-income-${index}`} 
                      style={{ cursor: period === 'thisYear' ? 'pointer' : 'default' }}
                    />
                  ))}
                </Bar>
                <Bar
                  dataKey="expenses"
                  fill="#ef4444"
                  name="Expenses"
                  radius={[4, 4, 0, 0]}
                  onClick={handleBarClick}
                >
                  {chartData.map((_, index) => (
                    <Cell 
                      key={`cell-expenses-${index}`} 
                      style={{ cursor: period === 'thisYear' ? 'pointer' : 'default' }}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {spendingTrends && (
        <div className="trends-section" style={{ marginTop: '32px', padding: '20px', backgroundColor: '#f8fafc', borderRadius: '8px' }}>
          <h3>Spending Trends</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginTop: '16px' }}>
            <div style={{ padding: '16px', backgroundColor: 'white', borderRadius: '8px' }}>
              <div style={{ fontSize: '14px', color: '#64748b', marginBottom: '8px' }}>Expenses</div>
              <div style={{ fontSize: '24px', fontWeight: 600, marginBottom: '4px' }}>
                {formatCurrency(spendingTrends.currentExpenses)}
              </div>
              <div style={{ fontSize: '14px', color: spendingTrends.expenseChange >= 0 ? '#ef4444' : '#10b981' }}>
                {spendingTrends.expenseChange >= 0 ? '↑' : '↓'} {Math.abs(spendingTrends.expenseChange).toFixed(1)}% vs previous period
              </div>
              <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '4px' }}>
                Previous: {formatCurrency(spendingTrends.previousExpenses)}
              </div>
            </div>
            <div style={{ padding: '16px', backgroundColor: 'white', borderRadius: '8px' }}>
              <div style={{ fontSize: '14px', color: '#64748b', marginBottom: '8px' }}>Income</div>
              <div style={{ fontSize: '24px', fontWeight: 600, marginBottom: '4px' }}>
                {formatCurrency(spendingTrends.currentIncome)}
              </div>
              <div style={{ fontSize: '14px', color: spendingTrends.incomeChange >= 0 ? '#10b981' : '#ef4444' }}>
                {spendingTrends.incomeChange >= 0 ? '↑' : '↓'} {Math.abs(spendingTrends.incomeChange).toFixed(1)}% vs previous period
              </div>
              <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '4px' }}>
                Previous: {formatCurrency(spendingTrends.previousIncome)}
              </div>
            </div>
          </div>
        </div>
      )}

      {budgetStatus.length > 0 && (
        <div className="budget-status" style={{ marginTop: '32px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h3 style={{ margin: 0 }}>Budget Status</h3>
            <select
              value={budgetFilter}
              onChange={(e) => setBudgetFilter(e.target.value as 'all' | 'monthly' | 'yearly')}
              className="input input-sm"
              style={{ minWidth: '150px' }}
            >
              <option value="all">All Budgets</option>
              <option value="monthly">Monthly Budgets</option>
              <option value="yearly">Yearly Budgets</option>
            </select>
          </div>
          <div style={{ display: 'grid', gap: '16px', marginTop: '16px' }}>
            {budgetStatus.map((status) => (
              <div
                key={status.budget.id}
                style={{
                  padding: '16px',
                  backgroundColor: status.isOverBudget ? '#ffebee' : '#f0fdf4',
                  borderRadius: '8px',
                  border: `2px solid ${status.isOverBudget ? '#ef4444' : '#10b981'}`,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span
                      style={{
                        width: '16px',
                        height: '16px',
                        backgroundColor: status.bucket?.color || '#ccc',
                        borderRadius: '4px',
                        display: 'inline-block',
                      }}
                    />
                    <strong>{status.bucket?.name || 'Unknown'}</strong>
                    <span
                      style={{
                        backgroundColor: status.budget.period === 'monthly' ? '#3b82f6' : '#8b5cf6',
                        color: 'white',
                        padding: '2px 8px',
                        borderRadius: '4px',
                        fontSize: '11px',
                        fontWeight: 600,
                        textTransform: 'uppercase',
                      }}
                    >
                      {status.budget.period === 'monthly' ? 'Monthly' : 'Yearly'}
                    </span>
                  </div>
                  <span style={{ color: status.isOverBudget ? '#ef4444' : '#10b981', fontWeight: 600 }}>
                    {status.isOverBudget ? 'Over Budget' : 'On Track'}
                  </span>
                </div>
                <div style={{ marginTop: '8px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', marginBottom: '4px' }}>
                    <span>Spent: {formatCurrency(status.spent)}</span>
                    <span>Budget: {formatCurrency(status.budgeted)}</span>
                  </div>
                  <div style={{ 
                    height: '8px', 
                    backgroundColor: '#e2e8f0', 
                    borderRadius: '4px', 
                    overflow: 'hidden',
                    marginTop: '8px'
                  }}>
                    <div
                      style={{
                        height: '100%',
                        width: `${Math.min(status.percentage, 100)}%`,
                        backgroundColor: status.isOverBudget ? '#ef4444' : '#10b981',
                        transition: 'width 0.3s',
                      }}
                    />
                  </div>
                  <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>
                    {status.percentage.toFixed(1)}% used
                    {!status.isOverBudget && status.remaining > 0 && (
                      <span style={{ marginLeft: '8px' }}>
                        • {formatCurrency(status.remaining)} remaining
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {pieChartData.length > 0 && (
        <div className="pie-chart-section" style={{ marginTop: '32px' }}>
          <h3>Expenses by Bucket (Pie Chart)</h3>
          <div style={{ marginTop: '16px', display: 'flex', justifyContent: 'center' }}>
            <ResponsiveContainer width="100%" height={400}>
              <PieChart>
                <Pie
                  data={pieChartData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent }) => `${name}: ${((percent || 0) * 100).toFixed(0)}%`}
                  outerRadius={120}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {pieChartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip formatter={(value: number | undefined) => formatCurrency(value || 0)} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {bucketBreakdown.length > 0 && (
        <div className="bucket-breakdown" style={{ marginTop: '32px' }}>
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

      {/* Summary Notes Section */}
      {(() => {
        const now = new Date();
        let displayYear: number | null = null;
        let displayMonth: number | null = null;
        let summaryType: 'monthly' | 'yearly' | null = null;

        if (period === 'thisMonth' || period === 'month') {
          const monthDate = period === 'thisMonth' 
            ? new Date(now.getFullYear(), now.getMonth(), 1)
            : new Date(now.getFullYear(), now.getMonth() - 1, 1);
          displayYear = monthDate.getFullYear();
          displayMonth = monthDate.getMonth() + 1;
          summaryType = 'monthly';
        } else if (period === 'thisYear' || period === 'year') {
          const yearDate = period === 'thisYear'
            ? new Date(now.getFullYear(), 0, 1)
            : new Date(now.getFullYear() - 1, 0, 1);
          displayYear = yearDate.getFullYear();
          summaryType = 'yearly';
        } else if (useCustomRange && customStartDate && customEndDate) {
          const start = new Date(customStartDate);
          const end = new Date(customEndDate);
          const diffTime = Math.abs(end.getTime() - start.getTime());
          const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
          
          // If custom range is within a single month, show monthly summary
          if (start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear() && diffDays <= 31) {
            displayYear = start.getFullYear();
            displayMonth = start.getMonth() + 1;
            summaryType = 'monthly';
          } else if (start.getFullYear() === end.getFullYear() && start.getMonth() === 0 && end.getMonth() === 11) {
            // If custom range is the entire year
            displayYear = start.getFullYear();
            summaryType = 'yearly';
          }
        }

        if (summaryType && displayYear) {
          return (
            <SummaryNotes
              type={summaryType}
              year={displayYear}
              month={displayMonth || undefined}
            />
          );
        }

        return null;
      })()}
    </div>
  );
}
