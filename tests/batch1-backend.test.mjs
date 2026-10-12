import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import jwt from 'jsonwebtoken';

const source = await readFile(new URL('../backend/auth-config.js', import.meta.url), 'utf8');
const syntheticSecret = 'isolated-test-only-12f636ae514f4ad3958408b2';
// Import the actual validator without initializing an optional SQLite database.
const moduleSource = source.replace('export const JWT_SECRET = readJwtSecret();', '');
const { readJwtSecret } = await import('data:text/javascript;base64,' + Buffer.from(moduleSource).toString('base64'));

test('optional backend refuses missing, short and formerly public JWT secrets', () => {
  for (const secret of [undefined, '', 'short', ' '.repeat(40), 'your-secret-key-change-in-production']) {
    assert.throws(() => readJwtSecret({ JWT_SECRET: secret }), /Set JWT_SECRET/);
  }
});

test('configured private signing key accepts its token and rejects the old fallback', () => {
  const secret = readJwtSecret({ JWT_SECRET: syntheticSecret });
  const options = { algorithms: ['HS256'] };
  assert.equal(jwt.verify(jwt.sign({ userId: 'synthetic-A' }, secret), secret, options).userId, 'synthetic-A');
  assert.throws(() => jwt.verify(jwt.sign({ userId: 'synthetic-A' }, 'your-secret-key-change-in-production'), secret, options));
});

test('server startup fails closed before opening the database when configuration is absent', () => {
  const result = spawnSync(process.execPath, ['backend/server.js'], {
    cwd: new URL('../', import.meta.url),
    env: { PATH: process.env.PATH, JWT_SECRET: '' }, encoding: 'utf8', timeout: 5000,
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Set JWT_SECRET/);
});
