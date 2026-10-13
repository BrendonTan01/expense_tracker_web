import { calendarDayNumber } from './dateHelpers';
import { moneyToCents } from './money';
import { Transaction } from '../types';

export interface DuplicateCheckResult {
  isDuplicate: boolean;
  similarTransactions: Transaction[];
  confidence: 'high' | 'medium' | 'low';
}

/**
 * Check if a new transaction is likely a duplicate
 * @param newTransaction The transaction to check
 * @param existingTransactions All existing transactions
 * @param timeWindowHours Hours within which to consider duplicates (default: 24)
 */
export function checkForDuplicates(
  newTransaction: Omit<Transaction, 'id' | 'isRecurring' | 'recurringId'>,
  existingTransactions: Transaction[],
  timeWindowHours: number = 24
): DuplicateCheckResult {
  const newDay = calendarDayNumber(newTransaction.date);
  const timeWindowMs = timeWindowHours * 60 * 60 * 1000;
  
  const similarTransactions = existingTransactions.filter(t => {
    // Duplicate warnings require exact cents, not binary floating-point proximity.
    let amountMatch = false;
    try { amountMatch = moneyToCents(t.amount) === moneyToCents(newTransaction.amount); }
    catch { return false; } // Invalid historical money cannot establish a duplicate.
    
    // Check description similarity (case-insensitive, partial match)
    const descMatch = t.description.toLowerCase().includes(newTransaction.description.toLowerCase()) ||
                     newTransaction.description.toLowerCase().includes(t.description.toLowerCase());
    
    // Check date proximity
    const transactionDay = calendarDayNumber(t.date);
    const timeDiff = Math.abs(newDay - transactionDay) * 86400000;
    const dateMatch = timeDiff <= timeWindowMs;
    
    // Check type match
    const typeMatch = t.type === newTransaction.type;
    
    // Check bucket match (if both have buckets)
    const bucketMatch = !newTransaction.bucketId || !t.bucketId || 
                       newTransaction.bucketId === t.bucketId;
    
    return amountMatch && descMatch && dateMatch && typeMatch && bucketMatch;
  });
  
  if (similarTransactions.length === 0) {
    return {
      isDuplicate: false,
      similarTransactions: [],
      confidence: 'low',
    };
  }
  
  // Calculate confidence based on how many fields match
  const exactMatches = similarTransactions.filter(t => {
    const exactAmount = t.amount === newTransaction.amount;
    const exactDesc = t.description.toLowerCase() === newTransaction.description.toLowerCase();
    const exactDate = t.date === newTransaction.date;
    
    return exactAmount && exactDesc && exactDate;
  });
  
  let confidence: 'high' | 'medium' | 'low' = 'low';
  if (exactMatches.length > 0) {
    confidence = 'high';
  } else if (similarTransactions.length > 0) {
    confidence = 'medium';
  }
  
  return {
    isDuplicate: true,
    similarTransactions,
    confidence,
  };
}
