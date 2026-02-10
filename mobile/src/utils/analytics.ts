import { Transaction, Bucket } from '../types';

export interface SpendingTrend {
  period: string;
  income: number;
  expenses: number;
  investments: number;
  balance: number;
  changeFromPrevious?: number;
}

export interface CategoryComparison {
  bucketId: string;
  bucketName: string;
  currentPeriod: number;
  previousPeriod: number;
  change: number;
  changeAmount: number;
}

export interface CategoryAverage {
  bucketId: string;
  bucketName: string;
  average: number;
  count: number;
  total: number;
}

export function calculateSpendingTrends(
  transactions: Transaction[],
  months: number = 12
): SpendingTrend[] {
  const trends: Map<string, SpendingTrend> = new Map();
  const now = new Date();
  for (let i = months - 1; i >= 0; i--) {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const periodKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    trends.set(periodKey, { period: periodKey, income: 0, expenses: 0, investments: 0, balance: 0 });
  }
  transactions.forEach(t => {
    const date = new Date(t.date);
    const periodKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    if (trends.has(periodKey)) {
      const trend = trends.get(periodKey)!;
      if (t.type === 'income') trend.income += t.amount;
      else if (t.type === 'expense') trend.expenses += t.amount;
      else if (t.type === 'investment') trend.investments += t.amount;
      trend.balance = trend.income - trend.expenses - trend.investments;
    }
  });
  const sortedTrends = Array.from(trends.values()).sort((a, b) => a.period.localeCompare(b.period));
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

export function comparePeriods(
  transactions: Transaction[],
  currentStart: Date,
  currentEnd: Date,
  previousStart: Date,
  previousEnd: Date
) {
  const current = { income: 0, expenses: 0, investments: 0, balance: 0 };
  const previous = { income: 0, expenses: 0, investments: 0, balance: 0 };
  transactions.forEach(t => {
    const date = new Date(t.date);
    if (date >= currentStart && date <= currentEnd) {
      if (t.type === 'income') current.income += t.amount;
      else if (t.type === 'expense') current.expenses += t.amount;
      else if (t.type === 'investment') current.investments += t.amount;
    } else if (date >= previousStart && date <= previousEnd) {
      if (t.type === 'income') previous.income += t.amount;
      else if (t.type === 'expense') previous.expenses += t.amount;
      else if (t.type === 'investment') previous.investments += t.amount;
    }
  });
  current.balance = current.income - current.expenses - current.investments;
  previous.balance = previous.income - previous.expenses - previous.investments;
  const change = {
    income: current.income - previous.income,
    expenses: current.expenses - previous.expenses,
    investments: current.investments - previous.investments,
    balance: current.balance - previous.balance,
  };
  return { current, previous, change };
}

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
      const prev = previousTotals.get(bucketId) || 0;
      const changeAmount = current - prev;
      const change = prev > 0 ? (changeAmount / prev) * 100 : (current > 0 ? 100 : 0);
      return { bucketId, bucketName: bucket?.name || 'Unknown', currentPeriod: current, previousPeriod: prev, change, changeAmount };
    })
    .sort((a, b) => Math.abs(b.changeAmount) - Math.abs(a.changeAmount));
}
