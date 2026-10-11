// A local lookup key only, not a security hash. The database separately verifies
// a SHA-256 payload fingerprint and rejects a reused ID with different data.
export function restoreReceiptKey(userId: string, backup: unknown): string {
  const text = JSON.stringify(backup);
  let a = 2166136261, b = 2166136261;
  for (let i = 0; i < text.length; i++) {
    a = Math.imul(a ^ text.charCodeAt(i), 16777619);
    b = Math.imul(b ^ text.charCodeAt(text.length - 1 - i), 16777619);
  }
  return `expense_restore_pending:${userId}:${text.length}:${a >>> 0}:${b >>> 0}`;
}
