import { calendarDayNumber } from './dateHelpers';
import { moneyToCents } from './money';
import { Transaction } from '../types';

export interface DuplicateCheckResult {
  isDuplicate: boolean;
  similarTransactions: Transaction[];
  confidence: 'high' | 'medium' | 'low';
}

export function checkForDuplicates(
  newTransaction: Omit<Transaction, 'id' | 'isRecurring' | 'recurringId'>,
  existingTransactions: Transaction[],
  timeWindowHours: number = 24
): DuplicateCheckResult {
  const newDay = calendarDayNumber(newTransaction.date);
  const timeWindowMs = timeWindowHours * 60 * 60 * 1000;
  const similarTransactions = existingTransactions.filter(t => {
    let amountMatch = false;
    try { amountMatch = moneyToCents(t.amount) === moneyToCents(newTransaction.amount); }
    catch { return false; } // Invalid historical money cannot establish a duplicate.
    const descMatch = t.description.toLowerCase().includes(newTransaction.description.toLowerCase()) ||
                     newTransaction.description.toLowerCase().includes(t.description.toLowerCase());
    const transactionDay = calendarDayNumber(t.date);
    const timeDiff = Math.abs(newDay - transactionDay) * 86400000;
    const dateMatch = timeDiff <= timeWindowMs;
    const typeMatch = t.type === newTransaction.type;
    const bucketMatch = !newTransaction.bucketId || !t.bucketId || newTransaction.bucketId === t.bucketId;
    return amountMatch && descMatch && dateMatch && typeMatch && bucketMatch;
  });
  if (similarTransactions.length === 0) {
    return { isDuplicate: false, similarTransactions: [], confidence: 'low' };
  }
  const exactMatches = similarTransactions.filter(t => {
    return t.amount === newTransaction.amount &&
      t.description.toLowerCase() === newTransaction.description.toLowerCase() &&
      t.date === newTransaction.date;
  });
  let confidence: 'high' | 'medium' | 'low' = 'low';
  if (exactMatches.length > 0) confidence = 'high';
  else if (similarTransactions.length > 0) confidence = 'medium';
  return { isDuplicate: true, similarTransactions, confidence };
}
