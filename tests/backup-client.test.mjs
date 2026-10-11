import test from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';
import { readFile } from 'node:fs/promises';
const asModule = source=>'data:text/javascript;base64,'+Buffer.from(source).toString('base64');
const compile = source=>ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const backup={version:'2.0.0',exportDate:'2026-10-11T00:00:00Z',data:{buckets:[],transactions:[],recurringTransactions:[],budgets:[],monthlySummaries:[],yearlySummaries:[]}};
for(const prefix of ['src','mobile/src']) {
 test(`${prefix}: backup version validation and legacy reflections`,async()=>{
  let source=await readFile(`${prefix}/utils/backup.ts`,'utf8');
  source=source.replace(/^import .* from 'expo-[^']+';$/gm,'');
  const {importFromJSON}=await import(asModule(compile(source)));
  assert.deepEqual(importFromJSON(JSON.stringify(backup)),backup);
  const legacy=structuredClone(backup);legacy.version='1.0.0';delete legacy.data.monthlySummaries;delete legacy.data.yearlySummaries;
  assert.equal(importFromJSON(JSON.stringify(legacy)).data.monthlySummaries,undefined);
  for(const invalid of ['null','{}',JSON.stringify({...backup,version:'3.0.0'}),JSON.stringify({...backup,data:legacy.data})]) assert.throws(()=>importFromJSON(invalid));
 });
 test(`${prefix}: receipt survives timeout and module reload; accounts remain separate`,async()=>{
  const values=new Map([['auth_token','test-token']]);
  const storage={getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};
  globalThis.localStorage=storage;
  globalThis.testStorage=storage;
  let seq=0;globalThis.testGenerateId=()=>`request-${++seq}`;
  let source=compile(await readFile(`${prefix}/utils/api.ts`,'utf8'));
  const receipt=asModule(compile(await readFile(`${prefix}/utils/restoreReceipt.ts`,'utf8')));
  source=source.replace(/import \{ generateId \} from '.\/storage';/, 'const generateId = () => globalThis.testGenerateId();');
  source=source.replace(/from '.\/restoreReceipt'/,`from '${receipt}'`);
  if (prefix === 'mobile/src') {
    const environment = asModule(compile(await readFile(`${prefix}/utils/environment.ts`, 'utf8')));
    source=source.replace(/from '.\/environment'/,`from '${environment}'`);
  }
  source=source.replace(/import AsyncStorage from '[^']+';/,'const AsyncStorage = globalThis.testStorage;');
  source=source.replace(/import \* as SecureStore from '[^']+';/,'const SecureStore = { getItemAsync: async () => "test-token" };');
  const first=await import(asModule(source+'\n// first '+prefix));
  const sent=[];
  globalThis.fetch=async(_url,options)=>{ sent.push(JSON.parse(options.body)); throw new Error('Connection lost after server commit'); };
  await assert.rejects(first.backupApi.restore(backup,'user-a'));
  const retry=await import(asModule(source+'\n// restarted '+prefix));
  globalThis.fetch=async(_url,options)=>{sent.push(JSON.parse(options.body)); return {ok:true,status:200,json:async()=>({restored:true})};};
  await retry.backupApi.restore(JSON.parse(JSON.stringify(backup)),'user-a');
  assert.equal(sent[0].requestId,sent[1].requestId);
  assert.equal(sent[1].expectedUserId,'user-a');
  assert.equal([...values.keys()].filter(k=>k.startsWith('expense_restore_pending:')).length,0);
  await retry.backupApi.restore(backup,'user-b');assert.notEqual(sent[2].requestId,sent[1].requestId);assert.equal(sent[2].expectedUserId,'user-b');
  // Old backend ignores the capability query and returns a list: no POST allowed.
  const recurringRequests=[];
  globalThis.fetch=async(url,options)=>{ recurringRequests.push({url,method:options.method || 'GET'}); return {ok:true,status:200,json:async()=>[]}; };
  assert.deepEqual(await retry.recurringApi.process('2026-10-11'),{created:0,available:false});
  assert.equal(recurringRequests.length,1);assert.equal(recurringRequests[0].method,'GET');
  recurringRequests.length=0;
  globalThis.fetch=async(url,options)=>{ recurringRequests.push({url,method:options.method || 'GET'}); return {ok:true,status:200,json:async()=>url.includes('capabilities')?{recurringProcessing:true}:{created:2}}; };
  assert.deepEqual(await retry.recurringApi.process('2026-10-11'),{created:2});
  assert.deepEqual(recurringRequests.map(r=>r.method),['GET','POST']);

 });
}
