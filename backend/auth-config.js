// The optional SQLite server must never start with a public signing key.
export function readJwtSecret(env = process.env) {
  const secret = env.JWT_SECRET;
  if (typeof secret !== 'string' || secret.trim().length < 32 ||
      secret === 'your-secret-key-change-in-production') {
    throw new Error('Set JWT_SECRET to a private random value of at least 32 characters before starting the SQLite backend.');
  }
  return secret;
}

export const JWT_SECRET = readJwtSecret();
