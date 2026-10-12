/** Batch 1 staging acceptance, using real handlers + hosted Auth/PostgREST.
 * STAGING_CONFIG=/private/config.json EXPECTED_STAGING_REF=tfjegsgjwyzcixlueosi node tests/hosted-batch1.mjs
 * Fresh disposable users only; no migrations or production traffic. Not part of npm test.
 */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { isAbsolute } from 'node:path';

const STAGING_REF = 'tfjegsgjwyzcixlueosi';
if (!process.env.STAGING_CONFIG || !isAbsolute(process.env.STAGING_CONFIG)) throw new Error('Absolute private STAGING_CONFIG required');
let config;
try { config = JSON.parse(await readFile(process.env.STAGING_CONFIG, 'utf8')); }
catch { throw new Error('Cannot read private staging config'); }
if (config.projectRef !== STAGING_REF || process.env.EXPECTED_STAGING_REF !== STAGING_REF) throw new Error('Refusing unapproved project');
const origin = new URL(config.url);
if (origin.href !== `https://${STAGING_REF}.supabase.co/`) throw new Error('Refusing unapproved staging URL');
const { anonKey, serviceRoleKey } = config;
if (typeof anonKey !== 'string' || !anonKey || typeof serviceRoleKey !== 'string' || !serviceRoleKey) throw new Error('Staging keys required');
config = null;
const networkFetch = globalThis.fetch;
globalThis.fetch = (input, init) => {
  const target = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
  if (target.origin !== origin.origin) return Promise.reject(new Error('Outside staging blocked'));
  return networkFetch(input, { ...init, redirect: 'error', signal: init?.signal || AbortSignal.timeout(30000) });
};
process.env.VITE_SUPABASE_URL = process.env.SUPABASE_URL = origin.origin;
process.env.VITE_SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY = anonKey;
const { default: summaries } = await import('../api/summaries.js');
const runId = randomUUID(), users = [];
const say = value => process.stdout.write(`${value}\n`);
let stage = 'create disposable users', failure;

async function request(path, { method = 'GET', token = anonKey, key = anonKey, body, prefer } = {}) {
  const res = await fetch(origin.origin + path, { method, headers: {
    apikey: key, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(prefer ? { Prefer: prefer } : {}),
  }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const text = await res.text();
  return { status: res.status, data: text ? JSON.parse(text) : null };
}
function ok(r, message) { assert.ok(r.status >= 200 && r.status < 300, `${message}: HTTP ${r.status}`); return r.data; }
function denied(r, message) { assert.ok(r.status >= 400 && r.status < 500, `${message}: HTTP ${r.status}`); }
async function createUser(label) {
  const email = `expense-batch1-${label}-${runId}@example.com`, password = `Test-${randomUUID()}-9aA!`;
  const created = ok(await request('/auth/v1/admin/users', { method: 'POST', key: serviceRoleKey, token: serviceRoleKey,
    body: { email, password, email_confirm: true, user_metadata: { batch1_test_run: runId } } }), 'Create user');
  assert.equal(typeof created.id, 'string');
  const user = { id: created.id }; users.push(user);
  user.token = ok(await request('/auth/v1/token?grant_type=password', { method: 'POST', body: { email, password } }), 'Login').access_token;
  assert.equal(typeof user.token, 'string'); return user;
}
async function api(user, method, body = {}, query = {}) {
  const res = { statusCode: 200, data: null, setHeader() {}, status(code) { this.statusCode = code; return this; },
    json(data) { this.data = data; return this; }, send() { return this; }, end() { return this; } };
  const log = console.log, error = console.error, warn = console.warn;
  console.log = console.error = console.warn = () => {};
  try { await summaries({ method, headers: user ? { authorization: `Bearer ${user.token}` } : {}, body, query }, res); }
  finally { console.log = log; console.error = error; console.warn = warn; }
  return { status: res.statusCode, data: res.data };
}
async function get(user, id) { return api(user, 'GET', {}, { id }); }
async function remove(user, id, type) { return api(user, 'DELETE', {}, { id, ...(type ? { type } : {}) }); }

try {
  const a = await createUser('a'), b = await createUser('b');
  assert.equal((await api(null, 'GET')).status, 401);
  assert.equal((await api(null, 'POST', { id: 'not-created' })).status, 401);
  assert.equal((await api(null, 'PUT', { id: 'not-created', summary: 'denied' })).status, 401);
  assert.equal((await remove(null, 'not-created')).status, 401);
  for (const type of ['monthly', 'yearly']) {
    stage = `${type} owner save/clear and account isolation`;
    const table = `${type}_summaries`, id = `${type}-${runId}`, ownB = `${type}-b-${runId}`;
    const period = { type, year: 2021, ...(type === 'monthly' ? { month: 2 } : {}) };
    const create = await api(a, 'POST', { id, ...period, summary: 'A original' });
    assert.equal(create.status, 201); assert.equal(create.data.user_id, a.id);
    assert.equal(ok(await get(a, id), 'Owner read').summary, 'A original');
    assert.equal((await get(b, id)).status, 404);
    assert.deepEqual(ok(await api(b, 'GET'), 'B empty list'), { monthly: [], yearly: [] });
    assert.deepEqual(ok(await api(b, 'GET', {}, { type, year: '2021' }), 'B filtered list'), []);
    for (const suppliedType of [type, undefined]) {
      const update = await api(b, 'PUT', { id, summary: 'B overwrite', ...(suppliedType ? { type: suppliedType } : {}) });
      assert.equal(update.status, 404);
      assert.equal((await remove(b, id, suppliedType)).status, 204);
      assert.equal(ok(await get(a, id), 'A survives foreign mutation').summary, 'A original');
    }
    // A client-supplied owner field cannot impersonate A. Matching periods are per-user.
    assert.equal((await api(b, 'POST', { id: ownB, ...period, user_id: a.id, summary: 'B own' })).status, 201);
    assert.equal(ok(await get(b, ownB), 'B owns created row').user_id, b.id);
    assert.equal((await get(a, ownB)).status, 404);
    assert.equal(ok(await get(a, id), 'A period unchanged').summary, 'A original');
    assert.equal(ok(await api(a, 'POST', { id: `ignored-${runId}`, ...period, summary: 'A replacement' }), 'Same-period upsert').id, id);
    assert.equal(ok(await api(a, 'PUT', { id, type, summary: '' }), 'Clear reflection').summary, null);
    assert.equal(ok(await get(a, id), 'Clear survives reload').summary, null);
    assert.equal(ok(await api(a, 'PUT', { id, summary: 'A legacy update' }), 'Legacy update').summary, 'A legacy update');
    denied(await request(`/rest/v1/${table}`, { method: 'POST', token: b.token,
      body: { id: `attack-${type}-${runId}`, user_id: a.id, year: 2022, ...(type === 'monthly' ? { month: 3 } : {}), summary: 'denied' } }), 'Foreign owner insert');
    denied(await request(`/rest/v1/${table}?id=eq.${id}`, { method: 'PATCH', token: a.token, body: { user_id: b.id } }), 'Owner transfer');
    assert.deepEqual(ok(await request(`/rest/v1/${table}?id=eq.${id}`, { method: 'PATCH', token: b.token,
      body: { summary: 'denied' }, prefer: 'return=representation' }), 'Foreign direct edit'), []);
    assert.deepEqual(ok(await request(`/rest/v1/${table}?id=eq.${id}`, { method: 'DELETE', token: b.token,
      prefer: 'return=representation' }), 'Foreign direct delete'), []);
    assert.equal(ok(await get(a, id), 'A remains unchanged').summary, 'A legacy update');
    assert.equal((await remove(a, id, type)).status, 204);
    assert.equal((await get(a, id)).status, 404);
    assert.equal((await remove(a, id, type)).status, 204);
    // Legacy deletion must fall through from an empty monthly result to yearly.
    assert.equal((await remove(b, ownB)).status, 204);
    assert.equal((await get(b, ownB)).status, 404);
    say(`PASS ${type}: owner create/upsert/clear/reload, foreign API + RLS mutations denied, typed/legacy deletion`);
  }
  stage = 'typed deletion with shared IDs and missing IDs';
  const sameId = `shared-${runId}`;
  assert.equal((await api(a, 'POST', { id: sameId, type: 'monthly', year: 2023, month: 1, summary: 'monthly' })).status, 201);
  assert.equal((await api(a, 'POST', { id: sameId, type: 'yearly', year: 2023, summary: 'yearly' })).status, 201);
  assert.equal((await remove(a, sameId, 'yearly')).status, 204);
  assert.equal(ok(await get(a, sameId), 'Monthly survives typed yearly deletion').summary, 'monthly');
  assert.equal((await remove(a, sameId, 'invalid')).status, 400);
  assert.equal((await remove(a, sameId)).status, 204);
  assert.equal((await remove(a, `missing-${runId}`)).status, 204);
  assert.deepEqual(ok(await api(a, 'GET'), 'All test rows deleted'), { monthly: [], yearly: [] });
  say('PASS unauthenticated rejection, shared-ID type isolation, idempotent deletion');
} catch (error) {
  failure = `${stage}: ${error instanceof assert.AssertionError ? error.message.split('\n')[0] : 'hosted request failed'}`;
} finally {
  for (const user of users) {
    try { ok(await request(`/auth/v1/admin/users/${encodeURIComponent(user.id)}`, { method: 'DELETE', key: serviceRoleKey, token: serviceRoleKey }), 'Cleanup'); }
    catch { failure ||= 'Disposable-user cleanup failed'; say(`Inspect staging accounts tagged batch1_test_run=${runId}`); }
  }
}
if (failure) { say(`FAIL ${failure}; if account creation had an unknown outcome, inspect batch1_test_run=${runId}`); process.exitCode = 1; }
else say('PASS Batch 1 hosted acceptance; disposable accounts removed');
