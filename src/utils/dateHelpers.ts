import { RecurringFrequency } from '../types';

export function getNextOccurrence(
  frequency: RecurringFrequency,
  startDate: string,
  lastApplied?: string
): string {
  const start = new Date(startDate);
  const base = lastApplied ? new Date(lastApplied) : start;
  const next = new Date(base);

  switch (frequency) {
    case 'daily':
      next.setDate(next.getDate() + 1);
      break;
    case 'weekly':
      next.setDate(next.getDate() + 7);
      break;
    case 'monthly':
      next.setMonth(next.getMonth() + 1);
      break;
    case 'yearly':
      next.setFullYear(next.getFullYear() + 1);
      break;
  }

  return next.toISOString().split('T')[0];
}

export function shouldGenerateTransaction(
  frequency: RecurringFrequency,
  startDate: string,
  endDate: string | undefined,
  lastApplied: string | undefined
): boolean {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const start = new Date(startDate);
  start.setHours(0, 0, 0, 0);

  if (start > today) {
    return false; // Not started yet
  }

  if (endDate) {
    const end = new Date(endDate);
    end.setHours(0, 0, 0, 0);
    if (end < today) {
      return false; // Already ended
    }
  }

  if (!lastApplied) {
    // Never generated, check if we should generate for start date
    return start <= today;
  }

  const last = new Date(lastApplied);
  last.setHours(0, 0, 0, 0);

  const next = new Date(getNextOccurrence(frequency, startDate, lastApplied));
  next.setHours(0, 0, 0, 0);

  return next <= today;
}

export function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString();
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(amount);
}