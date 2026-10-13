import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {budgetError,recurringUpdatesError} from '../lib/financial.js';
const response=()=>({code:0,body:null,headers:{},setHeader(k,v){this.headers[k]=v;},status(n){this.code=n;return this;},json(v){this.body=v;return this;},end(){return this;},send(){return this;}});
async function load(path){const url=new URL(path,import.meta.url);let source=await readFile(url,'utf8');source=source.replace(/import \{ getAuthenticatedClient \} from '[^']+';/,'const getAuthenticatedClient = async () => globalThis.financialAuthentication;').replace(/from '(\.[^']+)'/g,(_,p)=>`from '${new URL(p,url).href}'`);return(await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'))).default;}
const budgetHandler=await load('../api/budgets.js'),recurringHandler=await load('../api/recurring/[id].js');
const run=async(handler,method,body,query={})=>{const res=response();await handler({headers:{},method,body,query},res);return res;};
const budget={id:'budget',bucketId:'bucket',amount:1.23,period:'monthly',year:2026,month:10};
function mockRows(current={...budget,user_id:'a'}){const calls=[];const client={from(table){let action='select',payload;const filters=[];const builder={select(){return builder;},eq(k,v){filters.push([k,v]);return builder;},insert(v){action='insert';payload=v;return builder;},update(v){action='update';payload=v;return builder;},delete(){action='delete';return builder;},order(){return builder;},single:async()=>{calls.push({table,action,payload,filters});return{data:action==='update'?{...current,...payload}:action==='insert'?payload[0]:current};},maybeSingle:async()=>({data:{id:'bucket'}}),then(resolve,reject){calls.push({table,action,payload,filters});return Promise.resolve({data:[],error:null}).then(resolve,reject);}};return builder;}};return{client,calls};}
test('budget periods reject coercion, missing month, fractional/out-of-range years and yearly months',()=>{
 for(const patch of [{year:'2026'},{year:'2026abc'},{year:0},{year:10000},{year:2026.1},{month:undefined},{month:0},{month:13},{month:'10'},{month:1.5},{period:'yearly',month:10},{user_id:'other'}])assert.ok(budgetError({...budget,...patch}),JSON.stringify(patch));
 assert.equal(budgetError(budget),null);assert.equal(budgetError({...budget,period:'yearly',month:null}),null);
});
test('budget batch passes stable receipt ID once and never performs sequential table writes',async()=>{
 const calls=[];globalThis.financialAuthentication={user:{id:'a'},supabase:{rpc:async(...args)=>{calls.push(args);return{data:{budgets:[budget],replayed:false}};},from(){throw Error('Forbidden fallback');}}};
 const res=await run(budgetHandler,'POST',{budgets:[budget],requestId:'retry-budget'},{action:'batch'});assert.equal(res.code,200);assert.deepEqual(calls,[['create_budget_batch',{p_budgets:[budget],p_request_id:'retry-budget'}]]);
 for(const body of [{budgets:[],requestId:'a'},{budgets:Array(13).fill(budget),requestId:'a'},{budgets:[budget],requestId:''},{budgets:[{...budget,month:13}],requestId:'a'},{budgets:[{...budget,user_id:'b'}],requestId:'a'}])assert.equal((await run(budgetHandler,'POST',body,{action:'batch'})).code,400);
 assert.equal(calls.length,1);
});
test('financial missing migration fails closed; request conflicts and validation errors remain explicit',async()=>{
 for(const [code,status] of [['PGRST202',503],['42883',503],['23505',409],['23514',400],['23503',400],['P0002',404],['NETWORK',500]]){
  globalThis.financialAuthentication={user:{id:'a'},supabase:{rpc:async()=>({error:{code,message:'private internals'}}),from(){throw Error('Forbidden fallback');}}};
  const res=await run(budgetHandler,'POST',{budgets:[budget],requestId:'retry'},{action:'batch'});assert.equal(res.code,status);assert.doesNotMatch(res.body.error,/private internals/);
 }
});
test('legacy budget create returns its original object shape; amount-only PUT preserves unchanged fields',async()=>{
 let mocked=mockRows();globalThis.financialAuthentication={user:{id:'a'},supabase:mocked.client};
 let res=await run(budgetHandler,'POST',budget);assert.equal(res.code,201);assert.equal(res.body.id,budget.id);assert.ok(!Array.isArray(res.body));
 mocked=mockRows();globalThis.financialAuthentication.supabase=mocked.client;
 res=await run(budgetHandler,'PUT',{amount:2.34},{id:budget.id});assert.equal(res.code,200);assert.equal(res.body.month,10);assert.equal(res.body.amount,2.34);
 const write=mocked.calls.find(x=>x.action==='update');assert.deepEqual(write.payload,{amount:2.34});assert.deepEqual(write.filters,[['id','budget'],['user_id','a']]);
});
test('legacy budget updates reject invalid final periods and unknown/foreign records do not write',async()=>{
 for(const patch of [{month:13},{period:'yearly'},{user_id:'b'},{id:'other'},{}]){
  const mocked=mockRows();globalThis.financialAuthentication={user:{id:'a'},supabase:mocked.client};assert.equal((await run(budgetHandler,'PUT',patch,{id:'budget'})).code,400);assert.ok(!mocked.calls.some(x=>x.action==='update'));
 }
 globalThis.financialAuthentication={user:{id:'a'},supabase:{from(){const q={select(){return q;},eq(){return q;},single:async()=>({error:{code:'PGRST116'}})};return q;}}};assert.equal((await run(budgetHandler,'PUT',{amount:2},{id:'foreign'})).code,404);
});
test('migration-backed capability discovery authenticates and returns false if RPC is absent',async()=>{
 globalThis.financialAuthentication={error:'Sign in'};assert.equal((await run(budgetHandler,'GET',null,{action:'capabilities'})).code,401);
 globalThis.financialAuthentication={user:{id:'a'},supabase:{rpc:async()=>({error:{code:'PGRST202'}})}};let res=await run(budgetHandler,'GET',null,{action:'capabilities'});assert.equal(res.code,200);assert.deepEqual(res.body,{budgetBatch:false,recurringEdit:false,recurringHistoryJump:false});assert.equal(res.headers['Cache-Control'],'no-store');
 const capabilities={budgetBatch:true,recurringEdit:true,recurringHistoryJump:true};globalThis.financialAuthentication.supabase.rpc=async()=>({data:capabilities});assert.deepEqual((await run(budgetHandler,'GET',null,{action:'capabilities'})).body,capabilities);
});
test('recurring atomic edit accepts explicit null, forwards scope/day/receipt and preserves omitted watermark',async()=>{
 const calls=[],updates={endDate:null,transaction:{type:'income',amount:1.23,description:'Updated'}};
 globalThis.financialAuthentication={user:{id:'a'},supabase:{rpc:async(...args)=>{calls.push(args);return{data:{recurring:{id:'r',endDate:null},updated:2,replayed:false}};},from(){throw Error('Forbidden separate writes');}}};
 const body={updates,historyScope:'all',today:'2024-02-29',requestId:'retry-edit'};
 const res=await run(recurringHandler,'PUT',body,{id:'r',action:'edit'});assert.equal(res.code,200);assert.deepEqual(calls,[['edit_recurring_transaction',{p_id:'r',p_updates:updates,p_history_scope:'all',p_today:'2024-02-29',p_request_id:'retry-edit'}]]);assert.ok(!Object.hasOwn(calls[0][1].p_updates,'lastApplied'));
 for(const patch of [{historyScope:'unknown'},{today:'2025-02-29'},{requestId:''},{updates:{endDate:''}},{updates:{user_id:'b'}},{updates:{startDate:'2024-02-30'}},{updates:{transaction:{type:'income',amount:0.001,description:'bad'}}}])assert.equal((await run(recurringHandler,'PUT',{...body,...patch},{id:'r',action:'edit'})).code,400);
 assert.equal(calls.length,1);
});
test('legacy recurring watermark-only PUT still writes once and nullable dates keep omission semantics',async()=>{
 let payload;const q={update(value){payload=value;return q;},eq(){return q;},select(){return q;},single:async()=>({data:{id:'r',type:'income',amount:1,description:'x',frequency:'daily',startDate:'2024-01-01',lastApplied:'2024-01-02'}})};
 globalThis.financialAuthentication={user:{id:'a'},supabase:{from:()=>q}};
 const res=await run(recurringHandler,'PUT',{lastApplied:'2024-01-02'},{id:'r'});assert.equal(res.code,200);assert.deepEqual(payload,{lastApplied:'2024-01-02'});assert.equal(res.body.lastApplied,'2024-01-02');
 assert.equal(recurringUpdatesError({endDate:null}),null);assert.ok(recurringUpdatesError({endDate:'invalid'}));
});
