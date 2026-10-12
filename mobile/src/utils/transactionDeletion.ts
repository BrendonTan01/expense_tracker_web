import type { Transaction } from '../types';

export interface DeleteResult { deletedIds: string[]; failedIds: string[] }

// Reconcile each successful write even when another selected deletion fails.
export async function deleteIndividually(
  ids: string[], remove: (id: string) => Promise<void>, onDeleted: (id: string) => void,
  assertActive: () => void,
): Promise<DeleteResult> {
  const result: DeleteResult = { deletedIds: [], failedIds: [] };
  for (const id of new Set(ids)) {
    try {
      assertActive();
      await remove(id);
      assertActive();
      onDeleted(id);
      result.deletedIds.push(id);
    } catch {
      assertActive(); // An account change cancels the entire old operation.
      result.failedIds.push(id);
    }
  }
  return result;
}

function sameTransaction(a: Transaction, b: Transaction) {
  return a.id === b.id && a.type === b.type && Number(a.amount) === Number(b.amount) &&
    a.description === b.description && a.date === b.date &&
    (a.bucketId || '') === (b.bucketId || '') && Boolean(a.isRecurring) === Boolean(b.isRecurring) &&
    (a.recurringId || '') === (b.recurringId || '') && (a.notes || '') === (b.notes || '') &&
    JSON.stringify(a.tags || []) === JSON.stringify(b.tags || []);
}

// Keep original IDs and recurrence references. Never overwrite a conflicting row or
// generate a new ID after a timeout: the first POST may already have committed.
export function createTransactionUndo(
  transactions: Transaction[],
  api: { getById: (id: string) => Promise<Transaction>; create: (t: Transaction) => Promise<Transaction> },
  onRestored: (transaction: Transaction) => void,
  assertActive: () => void,
) {
  const pending = new Map(transactions.map(t => [t.id, t]));
  let running = false;
  async function find(id: string) {
    assertActive();
    try { const found = await api.getById(id); assertActive(); return found; }
    catch (error) {
      assertActive();
      if ((error as { status?: number }).status === 404) return null;
      throw error;
    }
  }
  return async () => {
    assertActive();
    if (running) throw new Error('Undo is already in progress.');
    running = true;
    try {
      for (const [id, original] of pending) {
        let restored = await find(id);
        if (!restored) {
          assertActive();
          try { restored = await api.create(original); assertActive(); }
          catch (error) {
            assertActive();
            // Resolve a lost response through an exact record read, never a list
            // which may have been capped or filtered.
            restored = await find(id);
            if (!restored) throw error;
          }
        }
        if (!sameTransaction(restored, original)) {
          throw new Error('A transaction changed since deletion. Refresh the list before trying again.');
        }
        assertActive();
        onRestored(restored);
        pending.delete(id);
      }
    } finally { running = false; }
  };
}
