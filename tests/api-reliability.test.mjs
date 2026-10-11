import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { isValidAmount, isDate } from '../lib/validation.js';
import { rpcErrorResponse } from '../lib/reliability.js';
const response = () => ({ code:0, headers:{}, body:null, setHeader(k,v){this.headers[k]=v;}, status(n){this.code=n;return this;}, json(v){this.body=v;return this;}, end(){return this;} });
async function handler(path) {
 const url=new URL(path,import.meta.url);
 let source=await readFile(url,'utf8');
 source=source.replace(/import \{ getAuthenticatedClient \} from '[^']+';/,"const getAuthenticatedClient = async () => globalThis.testAuthentication;");
 source=source.replace(/import backupHandler from '[^']+';/, 'const backupHandler = globalThis.testBackupHandler;');
 source=source.replace(/from '(\.[^']+)'/g,(_,path)=>`from '${new URL(path,url).href}'`);
 return (await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'))).default;
}
test('API rejects subcent, malformed and nonfinite amounts; accepts exact cents',()=>{
 for(const value of [0,-1,0.001,1.005,NaN,Infinity,'1.00',null,1e10]) assert.equal(isValidAmount(value),false,String(value));
 for(const value of [0.01,1,1.23,9999999999.99]) assert.equal(isValidAmount(value),true);
 assert.equal(isDate('2024-02-29'),true); assert.equal(isDate('2025-02-29'),false); assert.equal(isDate('2024-02-30'),false);
});
test('backup authenticates, rejects malformed versions, passes stable receipt ID, fails closed',async()=>{
 const run=await handler('../lib/backup.js'); let calls=[];
 globalThis.testAuthentication={error:'Sign in'};
 let res=response(); await run({method:'GET',headers:{}},res);assert.equal(res.code,401);
 globalThis.testAuthentication={user:{id:'a'},supabase:{rpc:async(name,args)=>{calls.push({name,args});return {data:{restored:true}};}}};
 res=response();await run({method:'POST',headers:{},body:{version:'99',expectedUserId:'a'}},res);assert.equal(res.code,400);assert.equal(calls.length,0);
 const backup={expectedUserId:'a',version:'2.0.0',requestId:'retry-1',data:{buckets:[],transactions:[],recurringTransactions:[],budgets:[],monthlySummaries:[],yearlySummaries:[]}};
 res=response();await run({method:'POST',headers:{},body:backup},res);assert.equal(res.code,200);assert.equal(calls[0].args.p_request_id,'retry-1');assert.deepEqual(calls[0].args.p_data,backup.data);
 res=response();await run({method:'POST',headers:{},body:{...backup,expectedUserId:'b'}},res);assert.equal(res.code,409);assert.equal(calls.length,1);
 globalThis.testAuthentication.supabase.rpc=async()=>({error:{code:'PGRST202'}});
 res=response();await run({method:'POST',headers:{},body:backup},res);assert.equal(res.code,503);
});
test('recurring process only invokes RPC, with a valid local calendar day',async()=>{
 const run=await handler('../api/recurring.js');let calls=[];
 globalThis.testAuthentication={user:{id:'a'},supabase:{rpc:async(...args)=>{calls.push(args);return {data:{created:2}};}}};
 let res=response();await run({method:'POST',query:{action:'process'},headers:{},body:{today:'2025-02-29'}},res);assert.equal(res.code,400);assert.equal(calls.length,0);
 res=response();await run({method:'POST',query:{action:'process'},headers:{},body:{today:'2024-02-29'}},res);assert.deepEqual(res.body,{created:2});assert.deepEqual(calls[0],['process_recurring_transactions',{p_today:'2024-02-29'}]);
});
test('every money write endpoint rejects a subcent before issuing a write',async()=>{
 const tx={id:'t',type:'expense',amount:0.001,description:'Test',date:'2026-10-11'};
 const recurring={id:'r',transaction:tx,frequency:'monthly',startDate:'2026-10-11'};
 for(const [path,method,body,query] of [
  ['../api/transactions.js','POST',tx,{}],['../api/transactions/[id].js','PUT',tx,{id:'t'}],
  ['../api/recurring.js','POST',recurring,{}],['../api/recurring/[id].js','PUT',recurring,{id:'r'}],
  ['../api/budgets.js','POST',{id:'b',bucketId:'bucket',amount:0.001,period:'monthly',year:2026,month:10},{}],
  ['../api/budgets.js','PUT',{bucketId:'bucket',amount:0.001,period:'monthly',year:2026,month:10},{id:'b'}],
  ['../api/transactions/recurring/[recurringId].js','PUT',{transaction:tx},{recurringId:'r'}]
 ]) {
  globalThis.testAuthentication={user:{id:'a'},supabase:{from:()=>{throw new Error('Unexpected database write');}}};
  const run=await handler(path);const res=response();await run({method,body,query,headers:{}},res);assert.equal(res.code,400,path);
 }
});
test('uncertain transport failure does not claim rollback',()=>{
 const res=response();rpcErrorResponse(res,{code:'NETWORK'});assert.match(res.body.error,/Could not confirm/);
});

test('backup route reuses recurring function and preserves method/auth validation',async()=>{
 globalThis.testBackupHandler=await handler('../lib/backup.js');
 globalThis.testAuthentication={error:'Sign in'};
 // New module instance so injected backup handler is captured.
 const source=await readFile(new URL('../api/recurring.js',import.meta.url),'utf8');
 assert.match(source,/action === 'backup'/);
 let code=source.replace(/import backupHandler from '[^']+';/,'const backupHandler = globalThis.testBackupHandler;').replace(/import \{ getAuthenticatedClient \} from '[^']+';/,'const getAuthenticatedClient = async () => globalThis.testAuthentication;').replace(/from '(\.[^']+)'/g,(_,p)=>`from '${new URL(p,new URL('../api/recurring.js',import.meta.url)).href}'`);
 const run=(await import('data:text/javascript;base64,'+Buffer.from(code+'\n// routing test').toString('base64'))).default;
 const res=response();await run({method:'GET',query:{action:'backup'},headers:{}},res);assert.equal(res.code,401);
});

test('capability probe authenticates and does not touch database records',async()=>{
 const run=await handler('../api/recurring.js');
 globalThis.testAuthentication={user:{id:'a'},supabase:{}};
 const res=response();await run({method:'GET',query:{action:'capabilities'},headers:{}},res);
 assert.deepEqual(res.body,{recurringProcessing:true});assert.equal(res.headers['Cache-Control'],'no-store');
});
