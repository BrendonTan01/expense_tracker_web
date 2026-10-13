/** Batch 2 staging acceptance, using real handlers + hosted Auth/PostgREST.
 * STAGING_CONFIG=/private/config.json EXPECTED_STAGING_REF=tfjegsgjwyzcixlueosi node tests/hosted-batch2.mjs
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
const [{default: historyHandler}, {default: budgetHandler}, {default: editHandler}] = await Promise.all([import('../api/transactions.js'),import('../api/budgets.js'),import('../api/recurring/[id].js')]);
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
  const email = `expense-batch2-${label}-${runId}@example.com`, password = `Test-${randomUUID()}-9aA!`;
  const created = ok(await request('/auth/v1/admin/users', { method: 'POST', key: serviceRoleKey, token: serviceRoleKey,
    body: { email, password, email_confirm: true, user_metadata: { batch2_test_run: runId } } }), 'Create user');
  assert.equal(typeof created.id, 'string');
  const user = { id: created.id }; users.push(user);
  user.token = ok(await request('/auth/v1/token?grant_type=password', { method: 'POST', body: { email, password } }), 'Login').access_token;
  assert.equal(typeof user.token, 'string'); return user;
}
async function api(handler, user, method, body = {}, query = {}) {
  const res = { statusCode: 200, data: null, setHeader() {}, status(code) { this.statusCode = code; return this; },
    json(data) { this.data = data; return this; }, send() { return this; }, end() { return this; } };
  const log = console.log, error = console.error, warn = console.warn;
  console.log = console.error = console.warn = () => {};
  try { await handler({ method, headers: user ? { authorization: `Bearer ${user.token}` } : {}, body, query }, res); }
  finally { console.log = log; console.error = error; console.warn = warn; }
  return { status: res.statusCode, data: res.data };
}
import ts from 'typescript';
import vm from 'node:vm';
import path from 'node:path';
import { readFileSync } from 'node:fs';
function clientModules(root, user) {
  const cache = new Map();
  const store = { getItem: async () => user.token, setItem: async () => {}, removeItem: async () => {} };
  const mocks = {
    '@react-native-async-storage/async-storage': store,
    'expo-secure-store': { getItemAsync: store.getItem, setItemAsync: store.setItem, deleteItemAsync: store.removeItem },
    './storage': { generateId: randomUUID }, './restoreReceipt': { restoreReceiptKey: () => 'test-only' },
    './environment': { API_BASE_URL: 'http://127.0.0.1:3001/api', ENV_STORAGE_PREFIX: 'test.', IS_STAGING: true, STAGING_PROJECT_REF: STAGING_REF },
  };
  const load = file => {
    file = path.resolve(file); if (cache.has(file)) return cache.get(file);
    const exports = {}; cache.set(file, exports);
    const compiled = ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    vm.runInNewContext(compiled, { exports, module: { exports }, Date, URL, URLSearchParams, Headers, AbortController, setTimeout, clearTimeout,
      console: { log() {}, error() {}, warn() {} }, localStorage: { getItem: () => user.token, removeItem() {} }, window: { location: { reload() {} } },
      fetch: async (url, options) => {
        const target = new URL(url, 'http://127.0.0.1:3001');
        if (target.pathname === '/api/health') return new Response(JSON.stringify({environment:'staging',projectRef:STAGING_REF}));
        assert.equal(target.pathname, '/api/transactions'); assert.equal(options.headers.Authorization, 'Bearer ' + user.token);
        const result = await api(historyHandler,user,'GET',{},Object.fromEntries(target.searchParams));
        return new Response(JSON.stringify(result.data), {status:result.status});
      }, require: id => mocks[id] || load(path.resolve(path.dirname(file), id + '.ts')) }, {filename:file});
    return exports;
  };
  return {api:load(root+'/utils/api.ts'),money:load(root+'/utils/money.ts'),dates:load(root+'/utils/dateHelpers.ts'),analytics:load(root+'/utils/analytics.ts')};
}
const rpc = (user,name,body={}) => request('/rest/v1/rpc/'+name,{method:'POST',token:user.token,body});
const exported = user => rpc(user,'export_user_backup').then(r=>ok(r,'Export fixture'));

try {
  const a=await createUser('a'),b=await createUser('b');
  stage='complete hosted history above row cap';
  const bucketId='bucket-'+runId;
  const transactions=Array.from({length:2505},(_,i)=>({id:`${runId}-t-${String(i).padStart(5,'0')}`,type:'expense',amount:i%2?0.2:0.1,description:'Synthetic cents',bucketId,date:'2024-01-01',isRecurring:false,tags:['test'],notes:'keep'}));
  const fixture={buckets:[{id:bucketId,name:'Synthetic'}],transactions,recurringTransactions:[],budgets:[],monthlySummaries:[],yearlySummaries:[]};
  ok(await rpc(a,'restore_user_backup',{p_data:fixture,p_request_id:randomUUID()}),'Restore large fixture');
  const started=performance.now(); const response=await api(historyHandler,a,'GET'); const rows=ok(response,'Complete history');
  assert.equal(rows.length,2505);assert.equal(new Set(rows.map(t=>t.id)).size,2505);
  const capped=ok(await request('/rest/v1/transactions?select=id&order=id',{token:a.token}),'Ordinary capped PostgREST read');
  assert.ok(capped.length<rows.length,'Hosted fixture must exceed the ordinary PostgREST response cap');
  say(`PASS observed ordinary PostgREST cap: ${capped.length} of ${rows.length}; scalar history retains all rows`);
  assert.deepEqual(rows.map(t=>t.id),transactions.map(t=>t.id).sort().reverse());
  assert.equal(rows.reduce((n,t)=>n+Math.round(t.amount*100),0),37570);
  assert.deepEqual(ok(await api(historyHandler,b,'GET'),'B isolated history'),[]);
  assert.equal((await api(historyHandler,null,'GET')).status,401);
  denied(await request('/rest/v1/rpc/get_transaction_history',{method:'POST',body:{}}),'Anonymous history');
  assert.equal(ok(await api(historyHandler,a,'GET',{}, {startDate:'2024-01-01',endDate:'2024-01-01',type:'expense'}),'Inclusive filtered history').length,2505);
  assert.equal(ok(await api(historyHandler,a,'GET',{}, {type:'income'}),'Empty type filter').length,0);
  say(`PASS hosted complete history: 2505 equal-date rows, 37570 cents; ${Math.round(performance.now()-started)}ms, ${Buffer.byteLength(JSON.stringify(rows))} bytes`);
  stage='both client reads and financial totals';
  for(const root of ['src','mobile/src']){
    const client=clientModules(root,a);const data=await client.api.transactionsApi.getAll();
    assert.equal(data.length,2505);assert.equal(client.money.addMoney(...data.map(t=>t.amount)),375.7);
    const summary=client.analytics.comparePeriods(data,client.dates.parseIsoDateLocal('2024-01-01'),client.dates.parseIsoDateLocal('2024-01-31'),client.dates.parseIsoDateLocal('2023-12-01'),client.dates.parseIsoDateLocal('2023-12-31'));
    assert.equal(summary.current.expenses,375.7);assert.equal(summary.current.balance,-375.7);
  }
  say('PASS actual web/mobile API mappers + analytics cover complete hosted history');
  stage='concurrent insert and complete history snapshot';
  const newId='concurrent-'+runId;
  const [snapshot,insert]=await Promise.all([api(historyHandler,a,'GET'),request('/rest/v1/transactions',{method:'POST',token:a.token,body:{id:newId,user_id:a.id,type:'income',amount:0.3,description:'Concurrent',date:'2024-01-01'}})]);
  ok(insert,'Concurrent insert');const seen=ok(snapshot,'Concurrent snapshot');assert.ok([2505,2506].includes(seen.length));
  assert.equal(new Set(seen.map(t=>t.id)).size,seen.length);assert.equal(seen.filter(t=>t.id!==newId).length,2505);
  assert.equal(ok(await api(historyHandler,a,'GET'),'Next complete snapshot').length,2506);
  say('PASS simultaneous write/read returns complete pre/post statement snapshot');
  stage='atomic budget batch and durable receipts';
  const budgets=Array.from({length:12},(_,i)=>({id:`${runId}-budget-${i+1}`,bucketId,amount:0.3,period:'monthly',year:2024,month:i+1}));
  const receipt=randomUUID();const created=ok(await api(budgetHandler,a,'POST',{budgets,requestId:receipt},{action:'batch'}),'Create12 budgets');assert.equal(created.budgets.length,12);
  const copies=await Promise.all(Array.from({length:4},()=>rpc(a,'create_budget_batch',{p_budgets:budgets,p_request_id:receipt})));
  copies.forEach(r=>assert.equal(ok(r,'Concurrent replay').replayed,true));
  assert.equal((await exported(a)).budgets.length,12);
  const conflicting=[{...budgets[0],id:'would-create-'+runId,year:2025},{...budgets[0],id:'new-conflict-'+runId}];
  const before=await exported(a);assert.equal((await api(budgetHandler,a,'POST',{budgets:conflicting,requestId:randomUUID()},{action:'batch'})).status,409);assert.deepEqual(await exported(a),before);
  assert.equal((await api(budgetHandler,a,'POST',{budgets:[{...budgets[0],year:2025,month:13}],requestId:randomUUID()},{action:'batch'})).status,400);
  denied(await api(budgetHandler,b,'POST',{budgets:[{...budgets[0],id:'foreign-budget-'+runId}],requestId:randomUUID()},{action:'batch'}),'Foreign bucket');
  ok(await request('/rest/v1/budgets?id=eq.'+budgets[0].id,{method:'DELETE',token:a.token}),'Intervening budget deletion');
  ok(await api(budgetHandler,a,'POST',{budgets,requestId:receipt},{action:'batch'}),'Replay after deletion');assert.equal((await exported(a)).budgets.length,11);
  assert.equal((await api(budgetHandler,a,'POST',{budgets:budgets.map(x=>({...x,amount:0.4})),requestId:receipt},{action:'batch'})).status,409);
  say('PASS atomic12month budgets, whole-batch conflicts, concurrent receipts, no recreation after deletion');
  stage='recurring atomic edits and clearing';
  const recurringId='recurring-'+runId;
  ok(await request('/rest/v1/recurring_transactions',{method:'POST',token:a.token,body:{id:recurringId,user_id:a.id,type:'income',amount:0.1,description:'Recurring',frequency:'monthly',startDate:'2024-01-31',endDate:'2024-03-31'}}),'Create schedule');
  assert.equal(ok(await rpc(a,'process_recurring_transactions',{p_today:'2024-03-31'}),'Process anchored monthly').created,3);
  const options={updates:{transaction:{type:'income',amount:0.2,description:'Edited'},endDate:null},historyScope:'all',today:'2024-03-31',requestId:randomUUID()};
  const edited=ok(await api(editHandler,a,'PUT',options,{id:recurringId,action:'edit'}),'Atomic edit');assert.equal(edited.updated,3);assert.ok(!edited.recurring.endDate);
  const after=await exported(a);assert.equal(after.transactions.filter(t=>t.recurringId===recurringId&&t.amount===0.2).length,3);
  assert.equal((await api(editHandler,b,'PUT',{...options,requestId:randomUUID()},{id:recurringId,action:'edit'})).status,404);assert.deepEqual(await exported(a),after);
  const concurrentEdits=await Promise.all(Array.from({length:3},()=>rpc(a,'edit_recurring_transaction',{p_id:recurringId,p_updates:options.updates,p_history_scope:'all',p_today:options.today,p_request_id:options.requestId})));
  concurrentEdits.forEach(r=>assert.equal(ok(r,'Concurrent edit replay').replayed,true));assert.deepEqual(await exported(a),after);
  assert.equal(ok(await rpc(a,'process_recurring_transactions',{p_today:'2024-04-30'}),'Cleared enddate resumes').created,1);
  ok(await request('/rest/v1/transactions?recurringId=eq.'+recurringId,{method:'PATCH',token:a.token,body:{description:'Later manual edit'}}),'Later history change');
  ok(await api(editHandler,a,'PUT',options,{id:recurringId,action:'edit'}),'Replay after later edit');
  assert.ok((await exported(a)).transactions.filter(t=>t.recurringId===recurringId).every(t=>t.description==='Later manual edit'));
  denied(await request('/rest/v1/rpc/create_budget_batch',{method:'POST',body:{p_budgets:budgets,p_request_id:randomUUID()}}),'Anonymous budgetbatch');
  denied(await request('/rest/v1/rpc/edit_recurring_transaction',{method:'POST',body:{p_id:recurringId,p_updates:options.updates,p_history_scope:'none',p_today:options.today,p_request_id:randomUUID()}}),'Anonymous recurringedit');
  say('PASS recurring schedule/history atomic edit, enddate clearing, authenticated ownership and durable replay');
  stage='completed recurring history and fresh due work';
  const completed=Array.from({length:14},(_,i)=>({id:`completed-${runId}-${i}`,user_id:a.id,type:'income',amount:0.01,description:'Imported completed',frequency:'daily',startDate:'2000-01-01',endDate:'2024-03-31',lastApplied:'2024-03-31'}));
  ok(await request('/rest/v1/recurring_transactions',{method:'POST',token:a.token,body:completed}),'Completed schedules');
  ok(await request('/rest/v1/recurring_transactions',{method:'POST',token:a.token,body:{id:'new-due-'+runId,user_id:a.id,type:'income',amount:0.01,description:'New due',frequency:'daily',startDate:'2024-04-30'}}),'New due schedule');
  assert.equal(ok(await rpc(a,'process_recurring_transactions',{p_today:'2024-04-30'}),'Skip completed large history').created,1);
  assert.equal(ok(await rpc(a,'process_recurring_transactions',{p_today:'2024-04-30'}),'Repeat processing').created,0);
  const raced=await Promise.all(Array.from({length:4},()=>rpc(a,'process_recurring_transactions',{p_today:'2024-05-01'})));
  assert.equal(raced.reduce((n,r)=>n+ok(r,'Concurrent new work').created,0),1);
  say('PASS14 long completed schedules skipped, fresh occurrence processed once across concurrent calls');
  stage='receipt isolation and immutable grants';
  assert.deepEqual(ok(await request('/rest/v1/financial_operation_receipts?select=*',{token:b.token}),'B receipt isolation'),[]);
  denied(await request('/rest/v1/financial_operation_receipts',{method:'POST',token:b.token,body:{user_id:a.id,operation:'budget_batch',request_id:randomUUID(),payload_hash:'denied',result:{}}}),'Foreign receipt insert');
  denied(await request('/rest/v1/financial_operation_receipts?request_id=not.is.null',{method:'PATCH',token:a.token,body:{payload_hash:'changed'}}),'Receipt alteration');
  denied(await request('/rest/v1/financial_operation_receipts?request_id=not.is.null',{method:'DELETE',token:a.token}),'Receipt deletion');
  say('PASS account-scoped immutable financial receipt permissions');
  stage='test bucket deletion cascades budgets and preserves entries';
  ok(await request('/rest/v1/buckets?id=eq.'+bucketId,{method:'DELETE',token:a.token}),'Delete synthetic test bucket');
  const cleaned=await exported(a);assert.equal(cleaned.budgets.length,0);
  const preserved=cleaned.transactions.filter(t=>t.id.startsWith(runId+'-t-'));
  assert.equal(preserved.length,2505);assert.deepEqual(preserved.map(t=>t.id).sort(),transactions.map(t=>t.id).sort());
  assert.ok(preserved.every(t=>!t.bucketId));
  ok(await api(budgetHandler,a,'POST',{budgets,requestId:receipt},{action:'batch'}),'Replay after bucket deletion');
  assert.equal((await exported(a)).budgets.length,0);
  say('PASS bucket cleanup removes its budgets, preserves entries and cannot recreate deleted budgets by replay');


} catch (error) {
  failure = `${stage}: ${error instanceof assert.AssertionError ? error.message.split('\n')[0] : 'hosted request failed'}`;
} finally {
  for (const user of users) {
    try { ok(await request(`/auth/v1/admin/users/${encodeURIComponent(user.id)}`, { method: 'DELETE', key: serviceRoleKey, token: serviceRoleKey }), 'Cleanup'); }
    catch { failure ||= 'Disposable-user cleanup failed'; say(`Inspect staging accounts tagged batch2_test_run=${runId}`); }
  }
}
if (failure) { say(`FAIL ${failure}; if account creation had an unknown outcome, inspect batch2_test_run=${runId}`); process.exitCode = 1; }
else say('PASS Batch 2 hosted acceptance; disposable accounts removed');
