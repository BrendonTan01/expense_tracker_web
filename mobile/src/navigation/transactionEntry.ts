import { generateId } from '../utils/storage';
import type { Transaction, TransactionTemplate } from '../types';

// Explicit entry actions start separate editors. A bucket setup detour keeps
// the existing route and draft instead of starting another entry.
export function transactionEntry(params: {
  transaction?: Transaction;
  template?: TransactionTemplate;
  initialDate?: string;
} = {}) {
  return { ...params, entryId: generateId() };
}
