/** Isolated hosted integration test. Never point at production.
 * STAGING_CONFIG=/private/path/config.json EXPECTED_STAGING_REF=<ref> node tests/hosted-reliability.mjs
 * Config: {projectRef,url,anonKey,serviceRoleKey}. Requires schema + reliability migration.
 * Imports real API handlers; their Supabase Auth/PostgREST requests are not mocked.
 * Synthetic accounts created by this run are deleted in finally. No schema changes.
 */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { isAbsolute } from 'node:path';

const LIVE_REF = 'yqllvfovnmonmqgzmqkf';
const configPath = process.env.STAGING_CONFIG;
if (!configPath || !isAbsolute(configPath)) throw new Error('STAGING_CONFIG must be an absolute private JSON path');
let config;
try {
  config = JSON.parse(await readFile(configPath, 'utf8'));
  if (!config || typeof config !== 'object' || Array.isArray(config)) throw new Error();
} catch {
  throw new Error('Could not read a valid private staging configuration');
}
const { projectRef, url, anonKey, serviceRoleKey } = config;
if (typeof projectRef !== 'string' || !/^[a-z]{20}$/.test(projectRef) || projectRef === LIVE_REF || projectRef !== process.env.EXPECTED_STAGING_REF) {
  throw new Error('Refusing database: explicit EXPECTED_STAGING_REF must match a non-production ref');
}
let origin;
try { origin = new URL(url); }
catch { throw new Error('Invalid staging URL in private configuration'); }
if (origin.protocol !== 'https:' || origin.hostname !== `${projectRef}.supabase.co` || origin.port || origin.username || origin.password || origin.search || origin.hash || origin.pathname !== '/') {
  throw new Error('Staging URL must exactly match the expected Supabase project hostname');
}
if (typeof anonKey !== 'string' || !anonKey || typeof serviceRoleKey !== 'string' || !serviceRoleKey) throw new Error('Missing staging credentials');
// All real SDK and direct HTTP calls are constrained to this staging origin.
const networkFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const target = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
  if (target.origin !== origin.origin) throw new Error('Blocked request outside expected staging origin');
  return networkFetch(input, { ...init, redirect: 'error', signal: init?.signal || AbortSignal.timeout(30000) });
};
process.env.VITE_SUPABASE_URL = origin.origin;
process.env.SUPABASE_URL = origin.origin;
process.env.VITE_SUPABASE_ANON_KEY = anonKey;
process.env.SUPABASE_ANON_KEY = anonKey;
const [{ default: recurringHandler }, { default: transactionHandler }] = await Promise.all([
  import('../api/recurring.js'), import('../api/transactions.js'),
]);
const runId = randomUUID();
const users = [];
const say = message => process.stdout.write(`${message}\n`);
const request = async (path, { method='GET', token=anonKey, key=anonKey, body, prefer }={}) => {
  const response = await fetch(`${origin.origin}${path}`, {
    method, headers:{ apikey:key, Authorization:`Bearer ${token}`, 'Content-Type':'application/json', ...(prefer ? {Prefer:prefer} : {}) },
    ...(body === undefined ? {} : {body:JSON.stringify(body)}),
  });
  const text = await response.text();
  let data; try { data = text ? JSON.parse(text) : null; } catch { throw new Error(`Non-JSON staging response (${response.status})`); }
  return {status:response.status, data};
};
const ok = (response, message) => { assert.ok(response.status>=200 && response.status<300, `${message}: HTTP ${response.status}`); return response.data; };
const denied = (response,message) => assert.ok(response.status>=400 && response.status<500, `${message}: expected denial, HTTP ${response.status}`);
const api = async (handler,user,method,body,query={}) => {
  const response={statusCode:200,headers:{},data:null,setHeader(k,v){this.headers[k]=v;},status(n){this.statusCode=n;return this;},json(data){this.data=data;return this;},send(data){this.data=data;return this;},end(){return this;}};
  // Existing handlers log error objects. Suppress their logs so credentials cannot
  // accidentally enter a terminal transcript if an upstream library adds fields.
  const log=console.log, error=console.error, warn=console.warn;
  console.log=console.error=console.warn=()=>{};
  try { await handler({method,headers:{authorization:`Bearer ${user.token}`},body,query,url:'/isolated-test'},response); }
  finally { console.log=log;console.error=error;console.warn=warn; }
  return {status:response.statusCode,data:response.data};
};
const backup=(user,method,body)=>api(recurringHandler,user,method,body,{action:'backup'});
const exportData=async user=>ok(await backup(user,'GET'),'Export backup').data;
const restore=async(user,data,requestId=randomUUID())=>backup(user,'POST',{version:'2.0.0',expectedUserId:user.id,requestId,data});
const rpc=(user,name,body)=>request(`/rest/v1/rpc/${name}`,{method:'POST',token:user.token,body});
async function createUser(label) {
  const email=`expense-reliability-${label}-${runId}@example.com`;
  const password=`Test-${randomUUID()}-9aA!`;
  const created=ok(await request('/auth/v1/admin/users',{method:'POST',key:serviceRoleKey,token:serviceRoleKey,body:{email,password,email_confirm:true,user_metadata:{reliability_test_run:runId}}}),'Create synthetic account');
  assert.equal(typeof created.id,'string','Admin create must return account ID');
  const user={id:created.id};users.push(user);
  const session=ok(await request('/auth/v1/token?grant_type=password',{method:'POST',body:{email,password}}),'Sign in synthetic account');
  assert.equal(typeof session.access_token,'string','Session token required');user.token=session.access_token;
  return user;
}
let failure;
try {
  const a=await createUser('a'), b=await createUser('b');
  const bucketId=`bucket-${runId}`, recurringId=`recurring-${runId}`;
  const fixture={
    buckets:[{id:bucketId,name:'Synthetic category',color:'#123456'}],
    transactions:[],budgets:[{id:`budget-${runId}`,bucketId,amount:10.01,period:'monthly',year:2024,month:1}],
    recurringTransactions:[{id:recurringId,frequency:'monthly',startDate:'2024-01-31',endDate:'2024-03-31',transaction:{type:'expense',amount:1.01,description:'Synthetic recurring',bucketId}}],
    monthlySummaries:[{id:`month-${runId}`,year:2024,month:1,summary:'Synthetic monthly reflection'}],
    yearlySummaries:[{id:`year-${runId}`,year:2024,summary:'Synthetic yearly reflection'}],
  };
  ok(await restore(a,fixture),'Restore six-table fixture through actual API handler');
  let saved=await exportData(a);
  assert.equal(saved.monthlySummaries.length,1);assert.equal(saved.yearlySummaries.length,1);
  // Reject invalid money through actual authentication + API validation.
  const invalid=await api(transactionHandler,a,'POST',{id:`invalid-${runId}`,type:'expense',amount:0.001,description:'Synthetic invalid amount',date:'2024-01-31',bucketId});
  assert.equal(invalid.status,400,'Subcent amount must be rejected');assert.deepEqual(await exportData(a),saved);
  // Independent HTTP connections race the same database advisory lock.
  const concurrent=await Promise.all(Array.from({length:6},()=>rpc(a,'process_recurring_transactions',{p_today:'2024-03-31'})));
  assert.equal(concurrent.reduce((sum,r)=>sum+ok(r,'Concurrent recurring process').created,0),3);
  saved=await exportData(a);
  assert.deepEqual(saved.transactions.map(t=>t.date).sort(),['2024-01-31','2024-02-29','2024-03-31']);
  assert.equal(new Set(saved.transactions.map(t=>`${t.recurringId}:${t.date}`)).size,3);
  say('PASS money validation, six-table export/restore, concurrent recurring idempotency');
  // Full RLS read isolation, denied cross-owner insert, invisible cross-owner edits.
  for(const table of ['buckets','transactions','recurring_transactions','budgets','monthly_summaries','yearly_summaries','backup_restore_receipts']) {
    assert.deepEqual(ok(await request(`/rest/v1/${table}?select=*`,{token:b.token}),`B select ${table}`),[]);
  }
  denied(await request('/rest/v1/buckets',{method:'POST',token:b.token,body:{id:`attack-${runId}`,user_id:a.id,name:'Denied'}}),'Cross-owner insert');
  assert.deepEqual(ok(await request(`/rest/v1/buckets?id=eq.${bucketId}`,{method:'PATCH',token:b.token,body:{name:'Denied'},prefer:'return=representation'}),'Cross-owner update'),[]);
  assert.deepEqual(ok(await request(`/rest/v1/transactions?user_id=eq.${a.id}`,{method:'DELETE',token:b.token,prefer:'return=representation'}),'Cross-owner delete'),[]);
  denied(await request('/rest/v1/transactions',{method:'POST',token:b.token,body:{id:`reference-${runId}`,user_id:b.id,type:'expense',amount:1,description:'Denied ref',date:'2024-01-01',bucketId}}),'Cross-owner reference');
  assert.deepEqual(await exportData(a),saved);
  // These functions must not be callable with only the public anonymous key.
  for(const [name,body] of [['export_user_backup',{}],['process_recurring_transactions',{p_today:'2024-03-31'}],['restore_user_backup',{p_data:fixture,p_request_id:randomUUID()}]]) {
    denied(await request(`/rest/v1/rpc/${name}`,{method:'POST',body}),`Anonymous RPC ${name}`);
  }
  denied(await request('/rest/v1/backup_restore_receipts?request_id=not.is.null',{method:'PATCH',token:a.token,body:{payload_hash:'changed'}}),'Receipt update grant');
  denied(await request('/rest/v1/backup_restore_receipts?request_id=not.is.null',{method:'DELETE',token:a.token}),'Receipt delete grant');
  say('PASS cross-user read/write/reference isolation and anonymous/receipt grants');
  for(const change of [data=>data.transactions[0].amount=0.001,data=>data.transactions[0].bucketId='missing-synthetic-bucket',data=>data.transactions[0].date='2024-02-30']) {
    const invalid=structuredClone(saved);change(invalid);
    assert.equal((await restore(a,invalid)).status,400,'Invalid restore must fail');
    assert.deepEqual(await exportData(a),saved,'Failed restore must roll back every table');
  }
  // Wrong-account confirmation must not call restore or change either account.
  const mismatch=await backup(b,'POST',{version:'2.0.0',expectedUserId:a.id,requestId:randomUUID(),data:saved});
  assert.equal(mismatch.status,409);assert.deepEqual(await exportData(a),saved);assert.equal((await exportData(b)).buckets.length,0);
  // Replay the exact request after a new edit: receipt must preserve that edit.
  const receipt=randomUUID();ok(await restore(a,saved,receipt),'Initial idempotent restore');
  ok(await request(`/rest/v1/buckets?id=eq.${bucketId}`,{method:'PATCH',token:a.token,body:{name:'Edited after restore'}}),'Intervening edit');
  const afterEdit=await exportData(a);
  ok(await restore(a,saved,receipt),'Replay successful restore');assert.deepEqual(await exportData(a),afterEdit);
  const altered=structuredClone(saved);altered.buckets[0].name='Changed payload';
  assert.equal((await restore(a,altered,receipt)).status,400);assert.deepEqual(await exportData(a),afterEdit);
  say('PASS atomic failed restore, account mismatch rejection, durable retry receipts');
} catch(error) {
  // Do not print response objects, tokens, config, or arbitrary SDK errors.
  failure=error instanceof assert.AssertionError ? `Assertion failed: ${error.message.split('\n')[0]}` : 'Hosted test failed; inspect staging service health/configuration and test stage';
} finally {
  for(const user of users) {
    try {
      // Only IDs returned by account creation in this run are ever deleted.
      const result=await request(`/auth/v1/admin/users/${encodeURIComponent(user.id)}`,{method:'DELETE',key:serviceRoleKey,token:serviceRoleKey});
      if(result.status<200 || result.status>=300) { failure ||= 'Synthetic-account cleanup failed';say(`Cleanup required for synthetic test run ${runId}`); }
    } catch { failure ||= 'Synthetic-account cleanup failed';say(`Cleanup required for synthetic test run ${runId}`); }
  }
}
if(failure) {say(failure);process.exitCode=1;} else say('PASS hosted reliability checks; synthetic accounts cleaned up');
