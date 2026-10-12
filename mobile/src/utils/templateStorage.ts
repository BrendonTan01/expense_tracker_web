// Ownerless legacy transaction_templates is deliberately left untouched. Its
// ownership cannot be inferred safely on devices shared by multiple accounts.
export function templateStorageKey(userId: string): string {
  if (!userId) throw new Error('Sign in before using templates.');
  return `transaction_templates:user:${encodeURIComponent(userId)}`;
}
