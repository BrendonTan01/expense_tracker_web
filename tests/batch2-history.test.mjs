import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const response = () => ({ code: 0, body: null, headers: {}, setHeader(k, v) { this.headers[k] = v; }, status(n) { this.code = n; return this; }, json(v) { this.body = v; return this; }, end() { return this; } });
const url = new URL('../api/transactions.js', import.meta.url);
let source = await readFile(url, 'utf8');
source = source.replace(/import \{ getAuthenticatedClient \} from '[^']+';/, 'const getAuthenticatedClient = async () => globalThis.historyAuthentication;');
source = source.replace(/from '(\.[^']+)'/g, (_, path) => `from '${new URL(path, url).href}'`);
const handler = (await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'))).default;
const run = async (query = {}) => {
  const res = response();
  await handler({ method: 'GET', headers: {}, query }, res);
  return res;
};

test('history GET preserves all 2505 rows and the installed-client plain-array shape', async () => {
  const records = Array.from({ length: 2505 }, (_, i) => ({ id: `t${i}`, type: 'income', amount: 1.23, date: '2026-01-01', isRecurring: i % 2, bucketId: null, recurringId: null, tags: i === 0 ? '["test"]' : null, notes: null }));
  const calls = [];
  globalThis.historyAuthentication = { user: { id: 'a' }, supabase: { rpc: async (...args) => { calls.push(args); return { data: records }; }, from() { throw new Error('Never fall back to capped table reads'); } } };
  const res = await run();
  assert.equal(res.code, 200);
  assert.ok(Array.isArray(res.body));
  assert.equal(res.body.length, 2505);
  assert.equal(res.body.reduce((sum, t) => sum + Math.round(t.amount * 100), 0), 2505 * 123);
  assert.deepEqual(calls, [['get_transaction_history', { p_start_date: null, p_end_date: null, p_type: null }]]);
  assert.deepEqual(res.body[0].tags, ['test']);
  assert.equal(res.body[0].isRecurring, false);
  assert.equal(res.body[1].isRecurring, true);
  assert.equal(res.body[0].bucketId, undefined);
  assert.equal(res.body[0].notes, undefined);
});

test('history filters remain inclusive and invalid or repeated filters never query the database', async () => {
  const calls = [];
  globalThis.historyAuthentication = { user: { id: 'a' }, supabase: { rpc: async (...args) => { calls.push(args); return { data: [] }; } } };
  assert.equal((await run({ startDate: '2024-02-29', endDate: '2024-03-01', type: 'expense' })).code, 200);
  assert.deepEqual(calls[0], ['get_transaction_history', { p_start_date: '2024-02-29', p_end_date: '2024-03-01', p_type: 'expense' }]);
  assert.equal((await run({ startDate: '', endDate: '', type: '' })).code, 200);
  assert.deepEqual(calls[1][1], { p_start_date: null, p_end_date: null, p_type: null });
  for (const query of [{ startDate: '2025-02-29' }, { endDate: '2024-02-30' }, { startDate: ['2024-01-01'] }, { type: ['income'] }, { type: 'unknown' }, { startDate: null }, { endDate: '01/01/2024' }]) {
    assert.equal((await run(query)).code, 400);
  }
  assert.equal(calls.length, 2);
});

test('history missing migration and invalid RPC shapes fail closed rather than returning partial history', async () => {
  for (const code of ['PGRST202', '42883']) {
    globalThis.historyAuthentication = { user: { id: 'a' }, supabase: { rpc: async () => ({ error: { code } }), from() { throw new Error('Forbidden fallback'); } } };
    const res = await run();
    assert.equal(res.code, 503);
    assert.match(res.body.error, /database history update/);
  }
  for (const data of [null, undefined, {}, { transactions: [] }]) {
    globalThis.historyAuthentication.supabase.rpc = async () => ({ data });
    assert.equal((await run()).code, 503);
  }
  globalThis.historyAuthentication.supabase.rpc = async () => ({ data: [] });
  assert.deepEqual((await run()).body, []);
});

test('history authenticates and database failures do not masquerade as an empty successful result', async () => {
  globalThis.historyAuthentication = { error: 'Sign in' };
  assert.equal((await run()).code, 401);
  globalThis.historyAuthentication = { user: { id: 'a' }, supabase: { rpc: async () => ({ error: { code: 'NETWORK', message: 'private details' } }) } };
  const res = await run();
  assert.equal(res.code, 500);
  assert.doesNotMatch(res.body.error, /private details/);
});
