import { useState, useMemo, useEffect } from 'react';
import { Transaction, Bucket, Budget } from '../types';
import { formatCurrency } from '../utils/dateHelpers';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell, PieChart, Pie, LineChart, Line } from 'recharts';
import SummaryNotes from './SummaryNotes';
import { calculateSpendingTrends, calculateCategoryAverages, compareCategorySpending } from '../utils/analytics';

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
  investments: number;
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
    const investmentValue = payload.find((p: TooltipPayload) => p.dataKey === 'investments')?.value as number || 0;
    const isDarkMode = document.documentElement.classList.contains('dark-mode');
    
    return (
      <div style={{
        backgroundColor: isDarkMode ? 'var(--card-bg)' : 'white',
        border: `1px solid var(--border-color)`,
        borderRadius: '8px',
        padding: '12px',
        boxShadow: 'var(--shadow-lg)',
        color: 'var(--text-color)',
      }}>
        <p style={{ margin: '0 0 8px 0', fontWeight: 600, color: 'var(--text-color)' }}>{`Period: ${label}`}</p>
        {incomeValue > 0 && (
          <p style={{ margin: '4px 0', color: 'var(--success-color)' }}>
            Income: {formatCurrency(incomeValue)}
          </p>
        )}
        {expenseValue > 0 && (
          <>
            <p style={{ margin: '4px 0 8px 0', color: 'var(--danger-color)' }}>
              Expenses: {formatCurrency(expenseValue)}
            </p>
            {data.bucketBreakdown && Object.keys(data.bucketBreakdown).length > 0 && (
              <div style={{ marginTop: '8px', paddingTop: '8px', borderTop: `1px solid var(--border-color)` }}>
                <p style={{ margin: '0 0 4px 0', fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)' }}>
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
        {investmentValue > 0 && (
          <p style={{ margin: '4px 0', color: '#7c3aed' }}>
            Investments: {formatCurrency(investmentValue)}
          </p>
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
  const [isMobile, setIsMobile] = useState(false);

  // Default visibility settings - only essential sections visible
  const defaultVisibility = {
    // Overview Section
    summaryCards: true,
    mainChart: true,
    savingsScore: true,
    
    // Category Analysis Section
    categoryComparison: false,
    averageSpendingByCategory: false,
    spendingTrendsChart: false,
    
    // Investment Section
    investmentInsights: false,
    
    // Budget Section
    budgetAlerts: true, // Always show alerts if they exist
    budgetStatus: false,
    
    // Expense Breakdown Section
    spendingTrends: false,
    pieChart: false,
    bucketBreakdown: false,
    
    // Notes Section
    summaryNotes: false,
  };

  // Load visibility preferences from localStorage
  const [visibility, setVisibility] = useState(() => {
    const saved = localStorage.getItem('summaryVisibility');
    if (saved) {
      try {
        return { ...defaultVisibility, ...JSON.parse(saved) };
      } catch {
        return defaultVisibility;
      }
    }
    return defaultVisibility;
  });

  const [showSettings, setShowSettings] = useState(false);

  // Save visibility preferences to localStorage
  useEffect(() => {
    localStorage.setItem('summaryVisibility', JSON.stringify(visibility));
  }, [visibility]);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const toggleVisibility = (key: keyof typeof visibility) => {
    setVisibility((prev: typeof visibility) => ({ ...prev, [key]: !prev[key] }));
  };

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

    const investments = filteredTransactions
      .filter((t) => t.type === 'investment')
      .reduce((sum, t) => sum + t.amount, 0);

    const balance = income - expenses - investments;
    const savingPercentage = income > 0 ? (balance / income) * 100 : 0;

    return {
      income,
      expenses,
      investments,
      balance,
      savingPercentage,
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

    const currentInvestments = transactions
      .filter((t) => {
        const date = new Date(t.date);
        return t.type === 'investment' && date >= currentStart && date <= currentEnd;
      })
      .reduce((sum, t) => sum + t.amount, 0);

    const previousInvestments = transactions
      .filter((t) => {
        const date = new Date(t.date);
        return t.type === 'investment' && date >= previousStart && date <= previousEnd;
      })
      .reduce((sum, t) => sum + t.amount, 0);

    const expenseChange = previousExpenses > 0 
      ? ((currentExpenses - previousExpenses) / previousExpenses) * 100 
      : 0;
    const incomeChange = previousIncome > 0 
      ? ((currentIncome - previousIncome) / previousIncome) * 100 
      : 0;
    const investmentChange = previousInvestments > 0
      ? ((currentInvestments - previousInvestments) / previousInvestments) * 100
      : (currentInvestments > 0 ? 100 : 0);

    return {
      currentExpenses,
      previousExpenses,
      expenseChange,
      currentIncome,
      previousIncome,
      incomeChange,
      currentInvestments,
      previousInvestments,
      investmentChange,
    };
  }, [transactions, period]);

  // Savings Score calculation
  const savingsScore = useMemo(() => {
    let score = 0;
    const factors: Array<{ name: string; score: number; maxScore: number; concern?: string }> = [];

    // Factor 1: Saving Percentage (0-40 points)
    // 20%+ saving rate = 40 points, 10% = 30 points, 0% = 20 points, negative = 0 points
    let savingPercentageScore = 0;
    if (totals.savingPercentage >= 20) {
      savingPercentageScore = 40;
    } else if (totals.savingPercentage >= 10) {
      savingPercentageScore = 30 + ((totals.savingPercentage - 10) / 10) * 10;
    } else if (totals.savingPercentage >= 0) {
      savingPercentageScore = 20 + (totals.savingPercentage / 10) * 10;
    } else {
      savingPercentageScore = Math.max(0, 20 + totals.savingPercentage * 2);
    }
    score += savingPercentageScore;
    factors.push({
      name: 'Saving Rate',
      score: savingPercentageScore,
      maxScore: 40,
      concern: totals.savingPercentage < 0 ? 'Spending exceeds income' : totals.savingPercentage < 10 ? 'Low saving rate' : undefined,
    });

    // Factor 2: Expense Trend (0-30 points)
    // If expenses decreased or increased < 5% = 30 points
    // If increased 5-15% = 20 points
    // If increased 15-30% = 10 points
    // If increased > 30% = 0 points
    let expenseTrendScore = 30; // Default to full points if no comparison available
    if (spendingTrends) {
      const expenseChange = spendingTrends.expenseChange;
      if (expenseChange <= -5) {
        expenseTrendScore = 30;
      } else if (expenseChange <= 5) {
        expenseTrendScore = 30;
      } else if (expenseChange <= 15) {
        expenseTrendScore = 30 - ((expenseChange - 5) / 10) * 10;
      } else if (expenseChange <= 30) {
        expenseTrendScore = 20 - ((expenseChange - 15) / 15) * 10;
      } else {
        expenseTrendScore = Math.max(0, 10 - (expenseChange - 30) / 10);
      }
      score += expenseTrendScore;
      factors.push({
        name: 'Expense Trend',
        score: expenseTrendScore,
        maxScore: 30,
        concern: expenseChange > 15 ? `Expenses increased ${expenseChange.toFixed(1)}%` : undefined,
      });
    } else {
      factors.push({
        name: 'Expense Trend',
        score: expenseTrendScore,
        maxScore: 30,
      });
      score += expenseTrendScore;
    }

    // Factor 3: Balance Position (0-20 points)
    // Positive balance = 20 points, Negative balance = 0 points (scaled)
    let balanceScore = 0;
    if (totals.balance > 0) {
      balanceScore = 20;
    } else if (totals.balance === 0) {
      balanceScore = 10;
    } else {
      // Negative balance: score decreases with severity
      // If balance is -50% of income or worse = 0 points
      const balanceRatio = totals.income > 0 ? Math.abs(totals.balance) / totals.income : 1;
      balanceScore = Math.max(0, 20 * (1 - Math.min(1, balanceRatio * 2)));
    }
    score += balanceScore;
    factors.push({
      name: 'Balance',
      score: balanceScore,
      maxScore: 20,
      concern: totals.balance < 0 ? 'Negative balance' : undefined,
    });

    // Factor 4: Budget Adherence (0-10 points)
    // No budgets over = 10 points
    // Some budgets over = reduced points
    let budgetScore = 10;
    if (budgetStatus.length > 0) {
      const overBudgetCount = budgetStatus.filter(s => s.isOverBudget).length;
      const totalBudgets = budgetStatus.length;
      if (overBudgetCount > 0) {
        budgetScore = 10 * (1 - (overBudgetCount / totalBudgets));
      }
    }
    score += budgetScore;
    factors.push({
      name: 'Budget Adherence',
      score: budgetScore,
      maxScore: 10,
      concern: budgetScore < 10 ? `${budgetStatus.filter(s => s.isOverBudget).length} budget(s) exceeded` : undefined,
    });

    // Clamp score between 0-100
    score = Math.max(0, Math.min(100, score));

    // Determine rating
    let rating: 'Excellent' | 'Good' | 'Fair' | 'Poor';
    let ratingColor: string;
    if (score >= 80) {
      rating = 'Excellent';
      ratingColor = '#10b981'; // green
    } else if (score >= 60) {
      rating = 'Good';
      ratingColor = '#3b82f6'; // blue
    } else if (score >= 40) {
      rating = 'Fair';
      ratingColor = '#f59e0b'; // amber
    } else {
      rating = 'Poor';
      ratingColor = '#ef4444'; // red
    }

    return {
      score: Math.round(score),
      rating,
      ratingColor,
      factors,
    };
  }, [totals, spendingTrends, budgetStatus]);

  // Pie chart data
  const pieChartData = useMemo(() => {
    return bucketBreakdown.map((item) => ({
      name: item.bucketName,
      value: item.amount,
      color: item.bucketColor,
    }));
  }, [bucketBreakdown]);

  const investmentInsights = useMemo(() => {
    const investments = filteredTransactions.filter((t) => t.type === 'investment');
    if (investments.length === 0) return null;

    const total = investments.reduce((sum, t) => sum + t.amount, 0);
    const average = total / investments.length;
    const largest = investments.reduce((prev, current) => current.amount > prev.amount ? current : prev, investments[0]);
    const mostRecent = [...investments].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];

    return { total, average, largest, mostRecent, count: investments.length };
  }, [filteredTransactions]);

  // Category analysis data
  const categoryAverages = useMemo(() => 
    calculateCategoryAverages(filteredTransactions, buckets), 
    [filteredTransactions, buckets]
  );

  const spendingTrendsChart = useMemo(() => 
    calculateSpendingTrends(filteredTransactions, 12), 
    [filteredTransactions]
  );

  const categoryComparison = useMemo(() => {
    const now = new Date();
    const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const currentMonthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    const previousMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const previousMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);
    
    return compareCategorySpending(
      transactions, 
      buckets, 
      currentMonthStart, 
      currentMonthEnd, 
      previousMonthStart, 
      previousMonthEnd
    );
  }, [transactions, buckets]);

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

    const grouped: Record<string, { income: number; expenses: number; investments: number; bucketBreakdown: Record<string, number> }> = {};

    filteredTransactions.forEach((t) => {
      const date = new Date(t.date);
      let key: string;
      
      if (groupByMonth) {
        key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      } else {
        key = String(date.getFullYear());
      }

      if (!grouped[key]) {
        grouped[key] = { income: 0, expenses: 0, investments: 0, bucketBreakdown: {} };
      }

      if (t.type === 'income') {
        grouped[key].income += t.amount;
      } else if (t.type === 'expense') {
        grouped[key].expenses += t.amount;
        const bucketKey = t.bucketId || 'no-bucket';
        grouped[key].bucketBreakdown[bucketKey] = (grouped[key].bucketBreakdown[bucketKey] || 0) + t.amount;
      } else if (t.type === 'investment') {
        grouped[key].investments += t.amount;
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
          investments: data.investments,
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
          <button
            onClick={() => setShowSettings(!showSettings)}
            style={{
              padding: '8px 16px',
              backgroundColor: 'var(--light-bg)',
              border: '1px solid var(--border-color)',
              borderRadius: '6px',
              cursor: 'pointer',
              color: 'var(--text-color)',
              fontSize: '14px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <span>⚙️</span>
            <span>Customize View</span>
          </button>
        </div>
      </div>

      {/* Visibility Settings Panel */}
      {showSettings && (
        <div style={{
          marginTop: '16px',
          marginBottom: '16px',
          padding: '16px',
          backgroundColor: 'var(--light-bg)',
          borderRadius: '8px',
          border: '1px solid var(--border-color)',
        }}>
          <h3 style={{ margin: '0 0 16px 0', fontSize: '16px', color: 'var(--text-color)' }}>
            Show/Hide Sections
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {/* Overview Section */}
            <div>
              <h4 style={{ margin: '0 0 8px 0', fontSize: '14px', fontWeight: 600, color: 'var(--text-color)' }}>
                Overview
              </h4>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '8px' }}>
                {(['summaryCards', 'mainChart', 'savingsScore'] as const).map(key => (
                  <label key={key} style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '14px', color: 'var(--text-color)' }}>
                    <input type="checkbox" checked={visibility[key]} onChange={() => toggleVisibility(key)} style={{ cursor: 'pointer' }} />
                    <span>{key === 'summaryCards' ? 'Summary Cards' : key === 'mainChart' ? 'Income/Expenses Chart' : 'Savings Score'}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Category Analysis Section */}
            <div>
              <h4 style={{ margin: '0 0 8px 0', fontSize: '14px', fontWeight: 600, color: 'var(--text-color)' }}>
                Category Analysis
              </h4>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '8px' }}>
                {(['categoryComparison', 'averageSpendingByCategory', 'spendingTrendsChart'] as const).map(key => (
                  <label key={key} style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '14px', color: 'var(--text-color)' }}>
                    <input type="checkbox" checked={visibility[key]} onChange={() => toggleVisibility(key)} style={{ cursor: 'pointer' }} />
                    <span>
                      {key === 'categoryComparison' ? 'Month-over-Month Comparison' : 
                       key === 'averageSpendingByCategory' ? 'Average Spending by Category' : 
                       '12-Month Spending Trends'}
                    </span>
                  </label>
                ))}
              </div>
            </div>

            {/* Investment Section */}
            <div>
              <h4 style={{ margin: '0 0 8px 0', fontSize: '14px', fontWeight: 600, color: 'var(--text-color)' }}>
                Investment
              </h4>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '8px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '14px', color: 'var(--text-color)' }}>
                  <input type="checkbox" checked={visibility.investmentInsights} onChange={() => toggleVisibility('investmentInsights')} style={{ cursor: 'pointer' }} />
                  <span>Investment Insights</span>
                </label>
              </div>
            </div>

            {/* Budget Section */}
            <div>
              <h4 style={{ margin: '0 0 8px 0', fontSize: '14px', fontWeight: 600, color: 'var(--text-color)' }}>
                Budget
              </h4>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '8px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '14px', color: 'var(--text-color)' }}>
                  <input type="checkbox" checked={visibility.budgetStatus} onChange={() => toggleVisibility('budgetStatus')} style={{ cursor: 'pointer' }} />
                  <span>Budget Status</span>
                </label>
              </div>
            </div>

            {/* Expense Breakdown Section */}
            <div>
              <h4 style={{ margin: '0 0 8px 0', fontSize: '14px', fontWeight: 600, color: 'var(--text-color)' }}>
                Expense Breakdown
              </h4>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '8px' }}>
                {(['spendingTrends', 'pieChart', 'bucketBreakdown'] as const).map(key => (
                  <label key={key} style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '14px', color: 'var(--text-color)' }}>
                    <input type="checkbox" checked={visibility[key]} onChange={() => toggleVisibility(key)} style={{ cursor: 'pointer' }} />
                    <span>
                      {key === 'spendingTrends' ? 'Period Comparison' : 
                       key === 'pieChart' ? 'Expenses Pie Chart' : 
                       'Expenses by Bucket List'}
                    </span>
                  </label>
                ))}
              </div>
            </div>

            {/* Notes Section */}
            <div>
              <h4 style={{ margin: '0 0 8px 0', fontSize: '14px', fontWeight: 600, color: 'var(--text-color)' }}>
                Notes
              </h4>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '8px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '14px', color: 'var(--text-color)' }}>
                  <input type="checkbox" checked={visibility.summaryNotes} onChange={() => toggleVisibility('summaryNotes')} style={{ cursor: 'pointer' }} />
                  <span>Summary Notes</span>
                </label>
              </div>
            </div>
          </div>
        </div>
      )}

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

      {visibility.summaryCards && (
        <div className="summary-cards" style={{
          display: 'grid',
          gridTemplateColumns: isMobile ? '1fr' : 'repeat(2, 1fr)',
          gap: '16px',
        }}>
          <div className="summary-card card-income">
            <h3>Total Income</h3>
            <p className="summary-amount">{formatCurrency(totals.income)}</p>
          </div>
          <div className="summary-card card-expense">
            <h3>Total Expenses</h3>
            <p className="summary-amount">{formatCurrency(totals.expenses)}</p>
          </div>
          <div className="summary-card" style={{ background: 'linear-gradient(135deg, #c7d2fe 0%, #a5b4fc 100%)', color: '#1e1b4b' }}>
            <h3>Total Invested</h3>
            <p className="summary-amount">{formatCurrency(totals.investments)}</p>
          </div>
          <div className={`summary-card card-balance ${totals.balance >= 0 ? 'positive' : 'negative'}`}>
            <h3>Cash After Investing</h3>
            <p className="summary-amount">{formatCurrency(totals.balance)}</p>
          </div>
          <div className={`summary-card card-saving ${totals.savingPercentage >= 0 ? 'positive' : 'negative'}`} style={{ gridColumn: isMobile ? '1' : '1 / -1' }}>
            <h3>Saving Percentage</h3>
            <p className="summary-amount">{totals.savingPercentage.toFixed(1)}%</p>
          </div>
        </div>
      )}

      {visibility.investmentInsights && investmentInsights && (
        <div className="chart-container">
          <div className="chart-title">Investing Contributions (selected period)</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px' }}>
            <div style={{ background: 'var(--card-bg)', padding: '12px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
              <div style={{ fontSize: '14px', color: 'var(--text-muted)' }}>Total invested</div>
              <div style={{ fontSize: '22px', fontWeight: 700, color: '#7c3aed' }}>{formatCurrency(investmentInsights.total)}</div>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{investmentInsights.count} contribution{investmentInsights.count === 1 ? '' : 's'}</div>
            </div>
            <div style={{ background: 'var(--card-bg)', padding: '12px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
              <div style={{ fontSize: '14px', color: 'var(--text-muted)' }}>Average per contribution</div>
              <div style={{ fontSize: '22px', fontWeight: 700 }}>{formatCurrency(investmentInsights.average)}</div>
            </div>
            <div style={{ background: 'var(--card-bg)', padding: '12px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
              <div style={{ fontSize: '14px', color: 'var(--text-muted)' }}>Largest contribution</div>
              <div style={{ fontSize: '22px', fontWeight: 700 }}>{formatCurrency(investmentInsights.largest.amount)}</div>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                {new Date(investmentInsights.largest.date).toLocaleDateString()}
              </div>
            </div>
            <div style={{ background: 'var(--card-bg)', padding: '12px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
              <div style={{ fontSize: '14px', color: 'var(--text-muted)' }}>Most recent</div>
              <div style={{ fontSize: '22px', fontWeight: 700 }}>{formatCurrency(investmentInsights.mostRecent.amount)}</div>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                {investmentInsights.mostRecent.description} • {new Date(investmentInsights.mostRecent.date).toLocaleDateString()}
              </div>
            </div>
          </div>
        </div>
      )}

      {visibility.mainChart && chartData.length > 0 && (
        <div className="chart-container">
          <div className="chart-title">
            Income, Expenses & Investments Over Time
            {period === 'thisYear' && (
              <span style={{ fontSize: '14px', fontWeight: 'normal', color: 'var(--text-muted)', marginLeft: '8px' }}>
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
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" />
                <XAxis 
                  dataKey="period" 
                  stroke="var(--text-muted)"
                  style={{ fontSize: '12px' }}
                  tick={{ fill: 'var(--text-color)' }}
                />
                <YAxis 
                  stroke="var(--text-muted)"
                  style={{ fontSize: '12px' }}
                  tick={{ fill: 'var(--text-color)' }}
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
                <Bar
                  dataKey="investments"
                  fill="#8b5cf6"
                  name="Investments"
                  radius={[4, 4, 0, 0]}
                  onClick={handleBarClick}
                >
                  {chartData.map((_, index) => (
                    <Cell 
                      key={`cell-investments-${index}`} 
                      style={{ cursor: period === 'thisYear' ? 'pointer' : 'default' }}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Category Analysis Section */}
      {visibility.categoryComparison && categoryComparison.length > 0 && (
        <div style={{
          marginTop: '32px',
          padding: '20px',
          background: 'var(--light-bg)',
          borderRadius: '8px',
          border: '1px solid var(--border-color)'
        }}>
          <h3 style={{ marginBottom: '16px', color: 'var(--text-color)' }}>Month-over-Month Category Comparison</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {categoryComparison.map(cat => (
              <div key={cat.bucketId} style={{
                padding: '12px',
                background: 'var(--card-bg)',
                borderRadius: '6px',
                border: '1px solid var(--border-color)'
              }}>
                <div style={{ fontWeight: 500, marginBottom: '8px', color: 'var(--text-color)' }}>{cat.bucketName}</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', marginBottom: '4px', color: 'var(--text-color)' }}>
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

      {visibility.averageSpendingByCategory && categoryAverages.length > 0 && (
        <div style={{
          marginTop: '32px',
          padding: '20px',
          background: 'var(--light-bg)',
          borderRadius: '8px',
          border: '1px solid var(--border-color)'
        }}>
          <h3 style={{ marginBottom: '16px', color: 'var(--text-color)' }}>Average Spending by Category</h3>
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
                    <div style={{ fontWeight: 500, color: 'var(--text-color)' }}>{cat.bucketName}</div>
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                      {cat.count} transactions
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontWeight: 600, color: 'var(--text-color)' }}>{formatCurrency(cat.average)}</div>
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

      {visibility.spendingTrendsChart && spendingTrendsChart.length > 0 && (
        <div style={{
          marginTop: '32px',
          padding: '20px',
          background: 'var(--light-bg)',
          borderRadius: '8px',
          border: '1px solid var(--border-color)'
        }}>
          <h3 style={{ marginBottom: '16px', color: 'var(--text-color)' }}>12-Month Spending Trends</h3>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={spendingTrendsChart}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" />
              <XAxis dataKey="period" stroke="var(--text-muted)" tick={{ fill: 'var(--text-color)' }} />
              <YAxis stroke="var(--text-muted)" tick={{ fill: 'var(--text-color)' }} />
              <Tooltip formatter={(value: number | undefined) => value !== undefined ? formatCurrency(value) : ''} />
              <Legend />
              <Line type="monotone" dataKey="income" stroke="#10b981" strokeWidth={2} name="Income" />
              <Line type="monotone" dataKey="expenses" stroke="#ef4444" strokeWidth={2} name="Expenses" />
              <Line type="monotone" dataKey="investments" stroke="#8b5cf6" strokeWidth={2} name="Investments" />
              <Line type="monotone" dataKey="balance" stroke="#6366f1" strokeWidth={2} name="Balance (net)" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {visibility.savingsScore && (
        <div style={{ 
        marginTop: '32px', 
        padding: '24px', 
        backgroundColor: 'var(--light-bg)', 
        borderRadius: '12px', 
        border: `2px solid ${savingsScore.ratingColor}20`,
        boxShadow: 'var(--shadow)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px', flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <h3 style={{ margin: '0 0 8px 0', color: 'var(--text-color)' }}>Savings Score</h3>
            <p style={{ margin: 0, fontSize: '14px', color: 'var(--text-muted)' }}>
              Overall financial health assessment
            </p>
          </div>
          <div style={{ 
            display: 'flex', 
            flexDirection: 'column', 
            alignItems: 'flex-end',
            gap: '8px',
          }}>
            <div style={{
              fontSize: '48px',
              fontWeight: 700,
              color: savingsScore.ratingColor,
              lineHeight: 1,
            }}>
              {savingsScore.score}
            </div>
            <div style={{
              padding: '6px 16px',
              borderRadius: '20px',
              backgroundColor: `${savingsScore.ratingColor}20`,
              color: savingsScore.ratingColor,
              fontSize: '14px',
              fontWeight: 600,
            }}>
              {savingsScore.rating}
            </div>
          </div>
        </div>

        {/* Score Breakdown */}
        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', 
          gap: '12px', 
          marginTop: '20px' 
        }}>
          {savingsScore.factors.map((factor, index) => {
            const percentage = (factor.score / factor.maxScore) * 100;
            const color = percentage >= 80 ? '#10b981' : percentage >= 60 ? '#3b82f6' : percentage >= 40 ? '#f59e0b' : '#ef4444';
            
            return (
              <div 
                key={index}
                style={{ 
                  padding: '12px', 
                  backgroundColor: 'var(--card-bg)', 
                  borderRadius: '8px', 
                  border: '1px solid var(--border-color)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-color)' }}>
                    {factor.name}
                  </span>
                  <span style={{ fontSize: '13px', fontWeight: 600, color: color }}>
                    {factor.score.toFixed(1)}/{factor.maxScore}
                  </span>
                </div>
                <div style={{
                  width: '100%',
                  height: '6px',
                  backgroundColor: 'var(--border-color)',
                  borderRadius: '3px',
                  overflow: 'hidden',
                }}>
                  <div style={{
                    width: `${percentage}%`,
                    height: '100%',
                    backgroundColor: color,
                    transition: 'width 0.3s ease',
                  }} />
                </div>
                {factor.concern && (
                  <div style={{ 
                    marginTop: '6px', 
                    fontSize: '11px', 
                    color: '#ef4444',
                    fontStyle: 'italic',
                  }}>
                    ⚠ {factor.concern}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
      )}

      {visibility.spendingTrends && spendingTrends && (
        <div className="trends-section" style={{ marginTop: '32px', padding: '20px', backgroundColor: 'var(--light-bg)', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
          <h3 style={{ color: 'var(--text-color)' }}>Spending Trends</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginTop: '16px' }}>
            <div style={{ padding: '16px', backgroundColor: 'var(--card-bg)', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
              <div style={{ fontSize: '14px', color: 'var(--text-muted)', marginBottom: '8px' }}>Expenses</div>
              <div style={{ fontSize: '24px', fontWeight: 600, marginBottom: '4px', color: 'var(--text-color)' }}>
                {formatCurrency(spendingTrends.currentExpenses)}
              </div>
              <div style={{ fontSize: '14px', color: spendingTrends.expenseChange >= 0 ? 'var(--danger-color)' : 'var(--success-color)' }}>
                {spendingTrends.expenseChange >= 0 ? '↑' : '↓'} {Math.abs(spendingTrends.expenseChange).toFixed(1)}% vs previous period
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
                Previous: {formatCurrency(spendingTrends.previousExpenses)}
              </div>
            </div>
            <div style={{ padding: '16px', backgroundColor: 'var(--card-bg)', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
              <div style={{ fontSize: '14px', color: 'var(--text-muted)', marginBottom: '8px' }}>Income</div>
              <div style={{ fontSize: '24px', fontWeight: 600, marginBottom: '4px', color: 'var(--text-color)' }}>
                {formatCurrency(spendingTrends.currentIncome)}
              </div>
              <div style={{ fontSize: '14px', color: spendingTrends.incomeChange >= 0 ? 'var(--success-color)' : 'var(--danger-color)' }}>
                {spendingTrends.incomeChange >= 0 ? '↑' : '↓'} {Math.abs(spendingTrends.incomeChange).toFixed(1)}% vs previous period
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
                Previous: {formatCurrency(spendingTrends.previousIncome)}
              </div>
            </div>
            <div style={{ padding: '16px', backgroundColor: 'var(--card-bg)', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
              <div style={{ fontSize: '14px', color: 'var(--text-muted)', marginBottom: '8px' }}>Investments</div>
              <div style={{ fontSize: '24px', fontWeight: 600, marginBottom: '4px', color: '#7c3aed' }}>
                {formatCurrency(spendingTrends.currentInvestments)}
              </div>
              <div style={{ fontSize: '14px', color: spendingTrends.investmentChange >= 0 ? '#7c3aed' : 'var(--success-color)' }}>
                {spendingTrends.investmentChange >= 0 ? '↑' : '↓'} {Math.abs(spendingTrends.investmentChange).toFixed(1)}% vs previous period
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
                Previous: {formatCurrency(spendingTrends.previousInvestments)}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Budget Alerts - always show if there are alerts */}
      {budgetStatus.length > 0 && (visibility.budgetAlerts || budgetStatus.some(s => s.isOverBudget || s.percentage >= 80)) && (
        <>
          {budgetStatus.some(s => s.isOverBudget || s.percentage >= 80) && (
            <div style={{
              marginTop: '32px',
              padding: '16px',
              borderRadius: '8px',
              border: '2px solid var(--warning-color)',
              backgroundColor: 'var(--light-bg)',
            }}>
              <h3 style={{ margin: '0 0 12px 0', color: 'var(--warning-color)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                ⚠️ Budget Alerts
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {budgetStatus
                  .filter(s => s.isOverBudget || s.percentage >= 80)
                  .map(status => (
                    <div
                      key={status.budget.id}
                      style={{
                        padding: '12px',
                        backgroundColor: status.isOverBudget ? 'var(--card-bg)' : 'var(--light-bg)',
                        borderRadius: '6px',
                        border: `1px solid ${status.isOverBudget ? 'var(--danger-color)' : 'var(--warning-color)'}`,
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span
                            style={{
                              width: '12px',
                              height: '12px',
                              backgroundColor: status.bucket?.color || 'var(--text-muted)',
                              borderRadius: '3px',
                              display: 'inline-block',
                            }}
                          />
                          <strong style={{ color: 'var(--text-color)' }}>{status.bucket?.name || 'Unknown'}</strong>
                        </div>
                        <span style={{
                          color: status.isOverBudget ? 'var(--danger-color)' : 'var(--warning-color)',
                          fontWeight: 600,
                          fontSize: '14px',
                        }}>
                          {status.isOverBudget
                            ? `Exceeded by ${formatCurrency(Math.abs(status.remaining))}`
                            : `${status.percentage.toFixed(0)}% used - ${formatCurrency(status.remaining)} remaining`
                          }
                        </span>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </>
      )}

      {visibility.budgetStatus && budgetStatus.length > 0 && (
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
                  backgroundColor: status.isOverBudget ? 'var(--card-bg)' : 'var(--light-bg)',
                  borderRadius: '8px',
                  border: `2px solid ${status.isOverBudget ? 'var(--danger-color)' : 'var(--success-color)'}`,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span
                      style={{
                        width: '16px',
                        height: '16px',
                        backgroundColor: status.bucket?.color || 'var(--text-muted)',
                        borderRadius: '4px',
                        display: 'inline-block',
                      }}
                    />
                    <strong style={{ color: 'var(--text-color)' }}>{status.bucket?.name || 'Unknown'}</strong>
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
                  <span style={{ color: status.isOverBudget ? 'var(--danger-color)' : 'var(--success-color)', fontWeight: 600 }}>
                    {status.isOverBudget ? 'Over Budget' : 'On Track'}
                  </span>
                </div>
                <div style={{ marginTop: '8px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', marginBottom: '4px', color: 'var(--text-color)' }}>
                    <span>Spent: {formatCurrency(status.spent)}</span>
                    <span>Budget: {formatCurrency(status.budgeted)}</span>
                  </div>
                  <div style={{ 
                    height: '8px', 
                    backgroundColor: 'var(--border-color)', 
                    borderRadius: '4px', 
                    overflow: 'hidden',
                    marginTop: '8px'
                  }}>
                    <div
                      style={{
                        height: '100%',
                        width: `${Math.min(status.percentage, 100)}%`,
                        backgroundColor: status.isOverBudget ? 'var(--danger-color)' : 'var(--success-color)',
                        transition: 'width 0.3s',
                      }}
                    />
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
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

      {visibility.pieChart && pieChartData.length > 0 && (
        <div className="pie-chart-section" style={{ marginTop: '32px' }}>
          <h3>Expenses by Bucket (Pie Chart)</h3>
          <div style={{ marginTop: '16px', display: 'flex', justifyContent: 'center' }}>
            <ResponsiveContainer width="100%" height={isMobile ? 300 : 400}>
              <PieChart>
                <Pie
                  data={pieChartData}
                  cx="50%"
                  cy="50%"
                  labelLine={!isMobile}
                  label={isMobile 
                    ? false 
                    : ({ name, percent }) => `${name}: ${((percent || 0) * 100).toFixed(0)}%`
                  }
                  outerRadius={isMobile ? 80 : 120}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {pieChartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip formatter={(value: number | undefined) => formatCurrency(value || 0)} />
                {isMobile && <Legend 
                  wrapperStyle={{ paddingTop: '20px' }}
                  formatter={(value) => {
                    const dataEntry = pieChartData.find(d => d.name === value);
                    const percent = dataEntry ? ((dataEntry.value / pieChartData.reduce((sum, d) => sum + d.value, 0)) * 100).toFixed(0) : '0';
                    return `${value} (${percent}%)`;
                  }}
                />}
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {visibility.bucketBreakdown && bucketBreakdown.length > 0 && (
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

      {visibility.summaryNotes && (
        /* Summary Notes Section */
        (() => {
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
      })()
      )}
    </div>
  );
}
