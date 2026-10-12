import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
const source = ts.transpileModule(await readFile('mobile/src/utils/transactionDeletion.ts','utf8'), {compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {deleteIndividually,createTransactionUndo} = await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
const active=()=>{};
const original={id:'original',type:'expense',amount:1.23,description:'Test',date:'2026-10-11',isRecurring:true,recurringId:'rule',bucketId:'bucket',tags:['tag']};
const missing=()=>Object.assign(new Error('Not found'),{status:404});

test('failed deletion never reports success; second failure reconciles other successful removals',async()=>{
  const visible=new Set(['a','b','c']);
  const requests=[];
  const result=await deleteIndividually(['a','b','b','c'],async id=>{requests.push(id);if(id==='b')throw Error('offline');},id=>visible.delete(id),active);
  assert.deepEqual(result,{deletedIds:['a','c'],failedIds:['b']});
  assert.deepEqual([...visible],['b']);assert.deepEqual(requests,['a','b','c']);
  assert.deepEqual(await deleteIndividually(['x'],async()=>{throw Error('failure')},()=>assert.fail(),active),{deletedIds:[],failedIds:['x']});
});
test('undo retains original stable ID and recurring association; lost successful response never duplicates',async()=>{
 const rows=new Map();let posts=0;const restored=[];
 const undo=createTransactionUndo([original],{getById:async id=>{if(!rows.has(id))throw missing();return rows.get(id)},create:async t=>{posts++;rows.set(t.id,t);throw Error('response lost')}},t=>restored.push(t),active);
 await undo();await undo();assert.equal(posts,1);assert.deepEqual(restored,[original]);assert.equal(rows.size,1);
});
test('partial undo retries only remaining IDs and does not overwrite a conflicting record',async()=>{
 const second={...original,id:'second'};const rows=new Map();let fail=true;const posts=[];
 const undo=createTransactionUndo([original,second],{getById:async id=>{if(!rows.has(id))throw missing();return rows.get(id)},create:async t=>{posts.push(t.id);if(t.id==='second'&&fail)throw Error('offline');rows.set(t.id,t);return t}},active,active);
 await assert.rejects(undo());fail=false;await undo();assert.deepEqual(posts,['original','second','second']);assert.equal(rows.size,2);
 const conflict=createTransactionUndo([original],{getById:async()=>({...original,amount:99}),create:async()=>assert.fail()},()=>assert.fail(),active);
 await assert.rejects(conflict(),/changed since deletion/);
});
test('unknown read errors never permit creates and repeated undo taps are blocked',async()=>{
 let release;const pending=new Promise(resolve=>release=resolve);let gets=0;
 const undo=createTransactionUndo([original],{getById:async()=>{gets++;await pending;throw Error('network')},create:async()=>assert.fail()},()=>assert.fail(),active);
 const first=undo();await assert.rejects(undo(),/already in progress/);release();await assert.rejects(first,/network/);assert.equal(gets,1);
});
test('account changes cancel retained undo and prevent follow-on requests and state writes',async()=>{
 let session=1;const check=()=>{if(session!==1)throw Error('Account changed')};let creates=0;
 const undo=createTransactionUndo([original],{getById:async()=>{session=2;throw missing()},create:async()=>{creates++;return original}},()=>assert.fail(),check);
 await assert.rejects(undo(),/Account changed/);await assert.rejects(undo(),/Account changed/);assert.equal(creates,0);
 session=1;let requests=0;
 await assert.rejects(deleteIndividually(['a','b'],async()=>{requests++;session=2},()=>assert.fail(),check),/Account changed/);
 assert.equal(requests,1);
});
