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
  const newDate = new Date(newTransaction.date);
  const timeWindowMs = timeWindowHours * 60 * 60 * 1000;
  const similarTransactions = existingTransactions.filter(t => {
    const amountMatch = Math.abs(t.amount - newTransaction.amount) < 0.01;
    const descMatch = t.description.toLowerCase().includes(newTransaction.description.toLowerCase()) ||
                     newTransaction.description.toLowerCase().includes(t.description.toLowerCase());
    const transactionDate = new Date(t.date);
    const timeDiff = Math.abs(newDate.getTime() - transactionDate.getTime());
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
