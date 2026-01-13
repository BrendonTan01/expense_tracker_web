import { Transaction, Bucket } from '../types';

export interface SpendingTrend {
  period: string; // e.g., "2024-01"
  income: number;
  expenses: number;
  balance: number;
  changeFromPrevious?: number; // Percentage change
}

export interface CategoryComparison {
  bucketId: string;
  bucketName: string;
  currentPeriod: number;
  previousPeriod: number;
  change: number; // Percentage change
  changeAmount: number;
}

export interface CategoryAverage {
  bucketId: string;
  bucketName: string;
  average: number;
  count: number;
  total: number;
}

/**
 * Calculate spending trends by month
 */
export function calculateSpendingTrends(
  transactions: Transaction[],
  months: number = 12
): SpendingTrend[] {
  const trends: Map<string, SpendingTrend> = new Map();
  const now = new Date();
  
  // Initialize last N months
  for (let i = months - 1; i >= 0; i--) {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const periodKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    trends.set(periodKey, {
      period: periodKey,
      income: 0,
      expenses: 0,
      balance: 0,
    });
  }
  
  // Aggregate transactions
  transactions.forEach(t => {
    const date = new Date(t.date);
    const periodKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    
    if (trends.has(periodKey)) {
      const trend = trends.get(periodKey)!;
      if (t.type === 'income') {
        trend.income += t.amount;
      } else {
        trend.expenses += t.amount;
      }
      trend.balance = trend.income - trend.expenses;
    }
  });
  
  const sortedTrends = Array.from(trends.values()).sort((a, b) => 
    a.period.localeCompare(b.period)
  );
  
  // Calculate percentage changes
  for (let i = 1; i < sortedTrends.length; i++) {
    const current = sortedTrends[i];
    const previous = sortedTrends[i - 1];
    
    if (previous.expenses > 0) {
      current.changeFromPrevious = ((current.expenses - previous.expenses) / previous.expenses) * 100;
    } else if (current.expenses > 0) {
      current.changeFromPrevious = 100;
    } else {
      current.changeFromPrevious = 0;
    }
  }
  
  return sortedTrends;
}

/**
 * Compare spending between two periods
 */
export function comparePeriods(
  transactions: Transaction[],
  currentStart: Date,
  currentEnd: Date,
  previousStart: Date,
  previousEnd: Date
): {
  current: { income: number; expenses: number; balance: number };
  previous: { income: number; expenses: number; balance: number };
  change: { income: number; expenses: number; balance: number };
} {
  const current = { income: 0, expenses: 0, balance: 0 };
  const previous = { income: 0, expenses: 0, balance: 0 };
  
  transactions.forEach(t => {
    const date = new Date(t.date);
    
    if (date >= currentStart && date <= currentEnd) {
      if (t.type === 'income') {
        current.income += t.amount;
      } else {
        current.expenses += t.amount;
      }
    } else if (date >= previousStart && date <= previousEnd) {
      if (t.type === 'income') {
        previous.income += t.amount;
      } else {
        previous.expenses += t.amount;
      }
    }
  });
  
  current.balance = current.income - current.expenses;
  previous.balance = previous.income - previous.expenses;
  
  const change = {
    income: current.income - previous.income,
    expenses: current.expenses - previous.expenses,
    balance: current.balance - previous.balance,
  };
  
  return { current, previous, change };
}

/**
 * Calculate average spending per category
 */
export function calculateCategoryAverages(
  transactions: Transaction[],
  buckets: Bucket[]
): CategoryAverage[] {
  const categoryTotals = new Map<string, { total: number; count: number }>();
  
  transactions
    .filter(t => t.type === 'expense' && t.bucketId)
    .forEach(t => {
      const bucketId = t.bucketId!;
      const existing = categoryTotals.get(bucketId) || { total: 0, count: 0 };
      existing.total += t.amount;
      existing.count += 1;
      categoryTotals.set(bucketId, existing);
    });
  
  return Array.from(categoryTotals.entries())
    .map(([bucketId, data]) => {
      const bucket = buckets.find(b => b.id === bucketId);
      return {
        bucketId,
        bucketName: bucket?.name || 'Unknown',
        average: data.count > 0 ? data.total / data.count : 0,
        count: data.count,
        total: data.total,
      };
    })
    .sort((a, b) => b.total - a.total);
}

/**
 * Compare category spending between periods
 */
export function compareCategorySpending(
  transactions: Transaction[],
  buckets: Bucket[],
  currentStart: Date,
  currentEnd: Date,
  previousStart: Date,
  previousEnd: Date
): CategoryComparison[] {
  const currentTotals = new Map<string, number>();
  const previousTotals = new Map<string, number>();
  
  transactions
    .filter(t => t.type === 'expense' && t.bucketId)
    .forEach(t => {
      const date = new Date(t.date);
      const bucketId = t.bucketId!;
      
      if (date >= currentStart && date <= currentEnd) {
        currentTotals.set(bucketId, (currentTotals.get(bucketId) || 0) + t.amount);
      } else if (date >= previousStart && date <= previousEnd) {
        previousTotals.set(bucketId, (previousTotals.get(bucketId) || 0) + t.amount);
      }
    });
  
  const allBuckets = new Set([...currentTotals.keys(), ...previousTotals.keys()]);
  
  return Array.from(allBuckets)
    .map(bucketId => {
      const bucket = buckets.find(b => b.id === bucketId);
      const current = currentTotals.get(bucketId) || 0;
      const previous = previousTotals.get(bucketId) || 0;
      const changeAmount = current - previous;
      const change = previous > 0 ? (changeAmount / previous) * 100 : (current > 0 ? 100 : 0);
      
      return {
        bucketId,
        bucketName: bucket?.name || 'Unknown',
        currentPeriod: current,
        previousPeriod: previous,
        change,
        changeAmount,
      };
    })
    .sort((a, b) => Math.abs(b.changeAmount) - Math.abs(a.changeAmount));
}
