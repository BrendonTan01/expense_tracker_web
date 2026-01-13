import { RecurringFrequency } from '../types';

export function getNextOccurrence(
  frequency: RecurringFrequency,
  startDate: string,
  lastApplied?: string
): string {
  if (!startDate) {
    return new Date().toISOString().split('T')[0];
  }
  
  try {
    const start = new Date(startDate);
    if (isNaN(start.getTime())) {
      return new Date().toISOString().split('T')[0];
    }
    
    const base = lastApplied ? new Date(lastApplied) : start;
    if (isNaN(base.getTime())) {
      return start.toISOString().split('T')[0];
    }
    
    const next = new Date(base);

    switch (frequency) {
      case 'daily':
        next.setDate(next.getDate() + 1);
        break;
      case 'weekly':
        next.setDate(next.getDate() + 7);
        break;
      case 'fortnightly':
        next.setDate(next.getDate() + 14);
        break;
      case 'monthly': {
        // Get the desired day of month from the start date
        // This ensures we always try to use the same day each month
        const desiredDay = start.getDate();
        
        // Move to the next month
        const currentMonth = next.getMonth();
        next.setMonth(currentMonth + 1);
        
        // Get the last day of the target month
        const lastDayOfMonth = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
        
        // Use the desired day, or the last day of the month if the desired day doesn't exist
        // (e.g., if start date is Jan 31, Feb will use Feb 28/29, Mar will use Mar 31)
        const dayToUse = Math.min(desiredDay, lastDayOfMonth);
        next.setDate(dayToUse);
        break;
      }
      case 'yearly':
        next.setFullYear(next.getFullYear() + 1);
        break;
    }

    return next.toISOString().split('T')[0];
  } catch (error) {
    console.error('Error calculating next occurrence:', error);
    return new Date().toISOString().split('T')[0];
  }
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
  if (!dateString) {
    return 'Invalid date';
  }
  
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) {
      return 'Invalid date';
    }
    return date.toLocaleDateString();
  } catch (error) {
    console.error('Error formatting date:', error);
    return 'Invalid date';
  }
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(amount);
}