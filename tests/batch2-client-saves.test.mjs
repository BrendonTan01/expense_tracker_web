import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { recurringUpdatesError } from '../lib/financial.js';

const deferred = () => { let resolve, reject; const promise = new Promise((a,b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const tick = () => new Promise(resolve => setImmediate(resolve));
function host() {
  const slots=[], effects=[], cleanups=[]; let cursor=0, mounted=true, late=0;
  const react={
    createElement: (type,props,...children) => ({type,props:{...props,children:children.flat(Infinity)}}),
    useState(initial) { const i=cursor++; if (!(i in slots)) slots[i]=typeof initial === 'function' ? initial() : initial; return [slots[i],v=>{ if(!mounted) late++; slots[i]=typeof v === 'function' ? v(slots[i]) : v; }]; },
    useRef(initial) { const [ref]=react.useState({current:initial}); return ref; },
    useMemo(fn) { cursor++; return fn(); },
    useEffect(fn,deps) { const i=cursor++; if (!slots[i] || deps.some((v,j)=>v!==slots[i][j])) { slots[i]=deps; effects.push(()=>{cleanups[i]?.(); cleanups[i]=fn();}); } },
  };
  return {react,render(fn){cursor=0;return fn();},flush(){effects.splice(0).forEach(f=>f());},unmount(){mounted=false;cleanups.forEach(f=>f?.());},get late(){return late;}};
}
function load(path,mocks,react) {
  const exports={}; const code=ts.transpileModule(readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React,esModuleInterop:true}}).outputText;
  runInNewContext(code,{exports,React:react,require:name=>{if(!(name in mocks))throw Error(`Missing mock ${name}`);return mocks[name];},console,Error,window:{alert(){}}});return exports;
}
function nodes(tree,predicate) { if(!tree||typeof tree!=='object')return [];return [...(predicate(tree)?[tree]:[]),...(tree.props?.children??[]).flatMap(n=>nodes(n,predicate)),...nodes(tree.props?.ListHeaderComponent,predicate)]; }
const text = n => (n?.props?.children??[]).map(c=>typeof c==='object'?text(c):String(c??'')).join('');
function button(tree,label) { return nodes(tree,n=>['button','TouchableOpacity'].includes(n.type)&&text(n)===label)[0]; }
function fixtures(mobile=false) {
  const h=host();let seq=0;const clock={today:'2030-01-31'};
  const dates={todayIsoLocal:()=>clock.today,formatDate:String,formatCurrency:String,parseIsoDateLocal:v=>new Date(`${v}T00:00:00`),formatIsoDateLocal:()=>clock.today,getNextOccurrence:()=>clock.today};
  const money=load(mobile?'mobile/src/utils/money.ts':'src/utils/money.ts',{},h.react);
  const utils={'./storage':{generateId:()=>`request-${++seq}`},'./dateHelpers':dates,react:h.react};
  const attempt=load(mobile?'mobile/src/utils/mutationAttempt.ts':'src/utils/mutationAttempt.ts',utils,h.react);
  const mocks={'../contexts/AuthContext':{useAuth:()=>({user:{id:'A'}})},react:h.react,'../utils/mutationAttempt':attempt,'../utils/storage':utils['./storage'],'../utils/money':money,'../utils/dateHelpers':dates,'../utils/api':{},'./TransactionForm':'TransactionForm'};
  return {h,clock,mocks};
}
function webBudgets(save) {
  const f=fixtures();const props={budgets:[],buckets:[{id:'food',name:'Food'}],onAdd:save,onUpdate:async()=>{},onDelete:async()=>{}};
  const component=load('src/components/BudgetManager.tsx',f.mocks,f.h.react).default;
  const render=()=>f.h.render(()=>component(props));render();f.h.flush();button(render(),'Add Budget').props.onClick();
  const fill=(year='2030',amount='1.23')=>{
    let tree=render();nodes(tree,n=>n.type==='select')[0].props.onChange({target:{value:'food'}});
    nodes(tree,n=>n.type==='input'&&n.props.inputMode==='decimal')[0].props.onChange({target:{value:amount}});
    nodes(tree,n=>n.type==='input'&&n.props.type==='number')[0].props.onChange({target:{value:year}});
  };
  fill();return {...f,render,fill,submit:()=>nodes(render(),n=>n.type==='form')[0].props.onSubmit({preventDefault(){}})};
}

test('web all-month creation is one guarded batch; ambiguous failure preserves draft, budget IDs and request on retry',async()=>{
  const calls=[],wait=deferred();let count=0;
  const f=webBudgets(async(...args)=>{calls.push(args);if(++count===1)await wait.promise;});
  const first=f.submit();const duplicate=f.submit();assert.equal(calls.length,1);assert.equal(calls[0][0].length,12);
  assert.equal(nodes(f.render(),n=>n.type==='fieldset')[0].props.disabled,true);
  wait.reject(new Error('response lost'));await Promise.all([first,duplicate]);
  assert.equal(nodes(f.render(),n=>n.type==='input'&&n.props.inputMode==='decimal')[0].props.value,'1.23');
  assert.ok(nodes(f.render(),n=>n.props?.role==='alert').length);
  f.clock.today='2030-02-01';await f.submit();assert.equal(JSON.stringify(calls[1]),JSON.stringify(calls[0]));assert.equal(nodes(f.render(),n=>n.type==='form').length,0);
});

test('web changed budget draft gets fresh request/IDs; fractional or non-integer year never reaches save',async()=>{
  const calls=[];const f=webBudgets(async(...args)=>{calls.push(args);throw new Error('offline');});
  await f.submit();f.fill('2030','2.34');await f.submit();assert.notEqual(calls[0][1],calls[1][1]);assert.notEqual(calls[0][0][0].id,calls[1][0][0].id);
  for(const year of ['2030.5','2030junk','0','10000','']) { f.fill(year);await f.submit(); }
  assert.equal(calls.length,2);
});

function webRecurring(save) {
  const f=fixtures(),calls=[];
  const row={id:'schedule',transaction:{type:'income',amount:1.23,description:'Salary'},frequency:'monthly',startDate:'2030-01-01',endDate:'2030-01-31',lastApplied:'2030-01-01'};
  const props={recurringTransactions:[row],transactions:[],buckets:[],onAdd:async()=>{},onUpdate:async(...args)=>{calls.push(args);await save(...args);},onDelete:()=>{}};
  const component=load('src/components/RecurringTransactionManager.tsx',f.mocks,f.h.react).default;
  const render=()=>f.h.render(()=>component(props));render();f.h.flush();button(render(),'Edit').props.onClick();
  const dates=nodes(render(),n=>n.type==='input'&&n.props.type==='date');dates[1].props.onChange({target:{value:''}});
  nodes(render(),n=>n.type==='TransactionForm')[0].props.onSubmit(row.transaction);
  return {...f,render,calls};
}
test('web recurring chooser sends explicit null, preserves first-attempt day and request after save/reload failure',async()=>{
  let count=0;const wait=deferred();const f=webRecurring(async()=>{if(++count===1)await wait.promise;});
  const first=button(f.render(),'Update all generated').props.onClick();button(f.render(),'Update all generated').props.onClick();assert.equal(f.calls.length,1);
  assert.equal(f.calls[0][1].endDate,null);assert.equal(f.calls[0][1].id,undefined);assert.equal(recurringUpdatesError(f.calls[0][1]),null);assert.equal(f.calls[0][1].lastApplied,undefined);assert.equal(f.calls[0][2].applyToGenerated,'all');
  wait.reject(new Error('reload failed after commit'));await first;f.clock.today='2030-02-01';
  assert.ok(nodes(f.render(),n=>n.props?.role==='dialog').length);await button(f.render(),'Update all generated').props.onClick();
  assert.equal(JSON.stringify(f.calls[0]),JSON.stringify(f.calls[1]));assert.equal(nodes(f.render(),n=>n.props?.role==='dialog').length,0);
});

test('web selecting different recurring history scope creates a new attempt',async()=>{
  const f=webRecurring(async()=>{throw new Error('offline');});await button(f.render(),'Update all generated').props.onClick();await button(f.render(),'Only from next onwards').props.onClick();
  assert.equal(f.calls[1][2].applyToGenerated,'fromNext');assert.notEqual(f.calls[0][2].requestId,f.calls[1][2].requestId);
});

function mobileScreen(kind,save) {
  const f=fixtures(true),calls=[];
  const row={id:'schedule',transaction:{type:'income',amount:1.23,description:'Salary'},frequency:'monthly',startDate:'2030-01-01',endDate:'2030-01-31',lastApplied:'2030-01-01'};
  const state={buckets:[{id:'food',name:'Food'}],budgets:[],transactions:[],recurringTransactions:[row]};
  Object.assign(f.mocks,{
    'react-native':{View:'View',Text:'Text',FlatList:'FlatList',TouchableOpacity:'TouchableOpacity',TextInput:'TextInput',Modal:'Modal',ScrollView:'ScrollView',KeyboardAvoidingView:'KeyboardAvoidingView',Platform:{OS:'android'},StyleSheet:{create:x=>x},Alert:{alert(){}}},
    '../contexts/ThemeContext':{useTheme:()=>({theme:{spacing:{},fontSize:{},colors:{},borderRadius:{}}})},
    '../contexts/AuthContext':{useAuth:()=>({user:{id:'A'}})},
    '../contexts/AppStateContext':{useAppState:()=>({state,addBudgets:async(...args)=>{calls.push(args);await save(...args);},updateBudget:async()=>{},deleteBudget:()=>{},addRecurring:async()=>{},updateRecurring:async(...args)=>{calls.push(args);await save(...args);},deleteRecurring:()=>{}})},
    '../components/FinancialErrorBoundary':{withFinancialErrorBoundary:fn=>fn},'../utils/haptics':{hapticSelection(){}},'@react-native-community/datetimepicker':'DateTimePicker',
  });
  const outer=load(`mobile/src/screens/${kind}Screen.tsx`,f.mocks,f.h.react).default;
  const inner=outer();const render=()=>f.h.render(()=>inner.type(inner.props));render();f.h.flush();
  return {...f,calls,state,row,render};
}
test('mobile recurring edit clears endDate without resetting progress and retries exact attempt after midnight',async()=>{
  let count=0;const wait=deferred();const f=mobileScreen('Recurring',async()=>{if(++count===1)await wait.promise;});
  const list=nodes(f.render(),n=>n.type==='FlatList')[0];const row=list.props.renderItem({item:f.row});nodes(row,n=>n.type==='TouchableOpacity')[0].props.onPress();
  button(f.render(),'Set end date').props.onPress();const press=button(f.render(),'Save').props.onPress;const first=press();press();assert.equal(f.calls.length,1);assert.equal(f.calls[0][1].endDate,null);assert.equal(f.calls[0][1].id,undefined);assert.equal(recurringUpdatesError(f.calls[0][1]),null);assert.equal(f.calls[0][1].lastApplied,undefined);
  wait.reject(new Error('connection lost'));await tick();f.clock.today='2030-02-01';button(f.render(),'Save').props.onPress();await tick();
  assert.equal(JSON.stringify(f.calls[0]),JSON.stringify(f.calls[1]));assert.equal(nodes(f.render(),n=>n.type==='Modal')[0].props.visible,false);await first;
});
test('mobile all-month creation uses one batch, keeps input on failure and guards rapid Save',async()=>{
  const calls=[],wait=deferred();let count=0;const f=mobileScreen('Budgets',async(...args)=>{calls.push(args);if(++count===1)await wait.promise;});
  button(f.render(),'+ Add Budget').props.onPress();nodes(f.render(),n=>n.type==='TextInput')[0].props.onChangeText('2.34');button(f.render(),'Apply to all months').props.onPress();
  const press=button(f.render(),'Save').props.onPress;press();press();assert.equal(calls.length,1);assert.equal(calls[0][0].length,12);
  wait.reject(new Error('500'));await tick();assert.equal(nodes(f.render(),n=>n.type==='Modal')[0].props.visible,true);assert.equal(nodes(f.render(),n=>n.type==='TextInput')[0].props.value,'2.34');
  button(f.render(),'Save').props.onPress();await tick();assert.equal(JSON.stringify(calls[0]),JSON.stringify(calls[1]));assert.equal(nodes(f.render(),n=>n.type==='Modal')[0].props.visible,false);
});

test('pending mutation cannot publish draft reset or error after account subtree unmount',async()=>{
  const f=fixtures(),wait=deferred();let succeeded=0,hook;
  f.h.render(()=>{hook=f.mocks['../utils/mutationAttempt'].useMutationAttempt('A');});f.h.flush();
  const first=hook.run('payload',()=>({amount:1.23}),()=>wait.promise,()=>succeeded++);f.h.unmount();wait.resolve();await first;assert.equal(succeeded,0);assert.equal(f.h.late,0);
});

test('actual web save handler uses one recurring RPC, propagates reload failure, then replays and publishes complete authoritative history',async()=>{
  const source=readFileSync('src/App.tsx','utf8');const start=source.indexOf('  const handleUpdateRecurring =');const end=source.indexOf('  const handleDeleteRecurring =',start);
  const code=ts.transpileModule(source.slice(start,end)+'\nexports.save=handleUpdateRecurring;',{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const owner={id:'A'},exports={},calls=[],writes=[];let failed=true;
  runInNewContext(code,{exports,accountLifetime:{current:owner},readSequence:{current:0},ownsAccount:o=>o===owner,setError(){},setActionStatus(){},showSaved(){},setState:v=>writes.push(v),recurringApi:{edit:async(...args)=>calls.push(args)},appStateApi:{load:async()=>{if(failed)throw new Error('reload failed');return {transactions:[{id:'after-row-cap'}],recurringTransactions:[{id:'schedule'}],budgets:[],buckets:[]};}},Error});
  const options={applyToGenerated:'all',requestId:'retry-id',today:'2030-01-31'};
  await assert.rejects(exports.save('schedule',{endDate:null},options),/reload failed/);failed=false;await exports.save('schedule',{endDate:null},options);
  assert.equal(calls.length,2);assert.equal(JSON.stringify(calls[0]),JSON.stringify(calls[1]));assert.equal(writes[0].transactions[0].id,'after-row-cap');
});

test('actual web budget handler rejects old-account completion and never publishes its data or success status',async()=>{
  const source=readFileSync('src/App.tsx','utf8'),a=source.indexOf('  const handleAddBudgets ='),b=source.indexOf('  const handleUpdateBudget =',a),exports={};
  const code=ts.transpileModule(source.slice(a,b)+'\nexports.save=handleAddBudgets;',{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const lifetime={current:{id:'A'}},wait=deferred(),writes=[],statuses=[];
  runInNewContext(code,{exports,accountLifetime:lifetime,readSequence:{current:0},ownsAccount:o=>lifetime.current===o,setError(){},setActionStatus:v=>statuses.push(v),showSaved:()=>statuses.push('success'),setState:v=>writes.push(v),budgetsApi:{createBatch:()=>wait.promise},appStateApi:{load:async()=>{throw Error('must not read B');}},Error});
  const pending=exports.save([{id:'budget'}],'request');lifetime.current={id:'B'};wait.resolve();await assert.rejects(pending,/Account changed/);assert.equal(writes.length,0);assert.equal(statuses.length,1);
});

test('actual mobile context invokes atomic edit with no history rewrite and surfaces post-commit reload errors',async()=>{
  const source=readFileSync('mobile/src/contexts/AppStateContext.tsx','utf8'),a=source.indexOf('  const updateRecurring ='),b=source.indexOf('  const deleteRecurring =',a),exports={},calls=[],refreshes=[],revision={current:0};
  const code=ts.transpileModule(source.slice(a,b)+'\nexports.save=updateRecurring;',{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  runInNewContext(code,{exports,useCallback:fn=>fn,assertActive(){},mutationRevision:revision,recurringApi:{edit:async(...args)=>calls.push(args)},refreshAll:async value=>{refreshes.push(value);throw new Error('reload lost');},Error});
  await assert.rejects(exports.save('schedule',{endDate:null},'same-request','2030-01-31'),/reload lost/);
  assert.equal(calls[0][2].historyScope,'none');assert.equal(calls[0][2].requestId,'same-request');assert.equal(calls[0][2].today,'2030-01-31');assert.equal(revision.current,1);assert.deepEqual(refreshes,[false]);
});

test('actual mobile budget context never applies replay rows directly; old account is rejected before refresh',async()=>{
  const source=readFileSync('mobile/src/contexts/AppStateContext.tsx','utf8'),a=source.indexOf('  const addBudgets ='),b=source.indexOf('  const updateBudget =',a),exports={},wait=deferred(),calls=[];let active=true;
  const code=ts.transpileModule(source.slice(a,b)+'\nexports.save=addBudgets;',{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  runInNewContext(code,{exports,useCallback:fn=>fn,assertActive:()=>{if(!active)throw new Error('Account changed');},mutationRevision:{current:0},budgetsApi:{createBatch:async(...args)=>{calls.push(args);return wait.promise;}},refreshAll:async()=>{throw new Error('must not refresh next account');},Error});
  const pending=exports.save([{id:'budget'}],'stable-request');active=false;wait.resolve({budgets:[{id:'stale-row'}],replayed:true});await assert.rejects(pending,/Account changed/);assert.equal(calls.length,1);
});


test('web bulk edit projects server budget rows into allowed patch fields and retains failed draft',async()=>{
  const f=fixtures(),calls=[];
  const props={budgets:[1,2].map(month=>({id:`budget-${month}`,bucketId:'food',amount:1.23,period:'monthly',year:2030,month,user_id:'A',created_at:'server-only'})),buckets:[{id:'food',name:'Food'}],onAdd:async()=>{},onUpdate:async(...args)=>{calls.push(args);if(args[0]==='budget-2')throw new Error('500');},onDelete:async()=>{}};
  const component=load('src/components/BudgetManager.tsx',f.mocks,f.h.react).default;
  const render=()=>f.h.render(()=>component(props));render();f.h.flush();button(render(),'Bulk Edit').props.onClick();
  await button(render(),'Update 2 Budgets').props.onClick();assert.equal(calls.length,2);
  for(const [,patch] of calls)assert.deepEqual(Object.keys(patch).sort(),['amount','bucketId','month','period','year']);
  assert.ok(nodes(render(),n=>n.props?.role==='alert'&&text(n).includes('1 budget updates failed')).length);assert.ok(button(render(),'Update 2 Budgets'));
});
