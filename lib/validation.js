export const MONEY_ERROR = 'Amount must be between 0.01 and 9999999999.99, with at most two decimal places.';
export function isValidAmount(value) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 && value <= 9999999999.99 && /^\d+(?:\.\d{1,2})?$/.test(String(value));
}
export function isDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value < '0001-01-01') return false;
  const date = new Date(value + 'T00:00:00Z');
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
export async function checkOwnedReferences(supabase, userId, values) {
  for (const [table, id] of [['buckets', values.bucketId], ['recurring_transactions', values.recurringId]]) {
    if (id == null || id === '') continue;
    if (typeof id !== 'string') return 'Invalid linked record.';
    const { data, error } = await supabase.from(table).select('id').eq('id', id).eq('user_id', userId).maybeSingle();
    if (error) throw error;
    if (!data) return 'Linked record does not exist in your account.';
  }
  return null;
}
