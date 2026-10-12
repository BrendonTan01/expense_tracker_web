import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const importSource = source => import('data:text/javascript;base64,' + Buffer.from(ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React },
}).outputText).toString('base64'));
const deletion = await importSource(readFileSync('mobile/src/utils/transactionDeletion.ts', 'utf8'));
const original = { id: 'a', description: 'Test', amount: 1, type: 'income', date: '2026-10-11' };
const snapshot = transactions => ({ buckets: [], transactions, recurringTransactions: [], budgets: [] });
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
let harnessId = 0;

// Execute the actual provider's state and mutation callbacks. Effects/native
// rendering are intentionally absent: each test explicitly initiates each read.
async function contextHost(initial = [original]) {
  const slots = []; let cursor = 0;
  const useState = initialValue => {
    const index = cursor++;
    if (!(index in slots)) slots[index] = initialValue;
    return [slots[index], next => { slots[index] = typeof next === 'function' ? next(slots[index]) : next; }];
  };
  const user = { id: 'account-a' };
  let loader = async () => snapshot(initial);
  globalThis.batchStateHarness = {
    React: { createElement: (type, props, ...children) => ({ type, props: { ...props, children } }) },
    useState, useRef: value => useState({ current: value })[0], useEffect: () => {},
    useCallback: fn => fn, useMemo: fn => fn(), createContext: () => ({ Provider: 'Provider' }), useContext: () => {},
    useAuth: () => ({ user }), ...deletion,
    appStateApi: { load: () => loader() },
    transactionsApi: {
      delete: async () => {}, create: async row => row,
      getById: async () => { throw Object.assign(new Error('Not found'), { status: 404 }); },
    },
    bucketsApi: {}, recurringApi: {}, budgetsApi: {},
    getSessionGeneration: () => 1, assertSessionGeneration: () => {}, todayIsoLocal: () => '2026-10-11',
  };
  const source = readFileSync('mobile/src/contexts/AppStateContext.tsx', 'utf8').replace(/import[\s\S]*?from ['"][^'"]+['"];\n/g, '');
  const module = await importSource(`// isolated host ${++harnessId}
const {React,useState,useRef,useEffect,useCallback,useMemo,createContext,useContext,useAuth,createTransactionUndo,deleteIndividually,appStateApi,transactionsApi,bucketsApi,recurringApi,budgetsApi,getSessionGeneration,assertSessionGeneration,todayIsoLocal}=globalThis.batchStateHarness;
${source}`);
  const render = () => { cursor = 0; return module.AppStateProvider({ children: null }).props.value; };
  await render().refreshAll(false);
  return { render, setLoader: fn => { loader = fn; } };
}

test('a pre-delete refresh cannot resurrect an acknowledged deleted transaction', async () => {
  const host = await contextHost(), stale = deferred();
  host.setLoader(() => stale.promise);
  const refresh = host.render().refreshAll(false);
  assert.deepEqual(await host.render().deleteTransactions(['a']), { deletedIds: ['a'], failedIds: [] });
  assert.deepEqual(host.render().state.transactions, []);
  stale.resolve(snapshot([original])); await refresh;
  assert.deepEqual(host.render().state.transactions, []);
});

test('a pre-undo refresh cannot remove an acknowledged restored transaction', async () => {
  const host = await contextHost([]), stale = deferred();
  host.setLoader(() => stale.promise);
  const refresh = host.render().refreshAll(false);
  await host.render().createDeleteUndo([original])();
  assert.deepEqual(host.render().state.transactions, [original]);
  stale.resolve(snapshot([])); await refresh;
  assert.deepEqual(host.render().state.transactions, [original]);
});

test('a slower older refresh cannot overwrite the latest requested snapshot', async () => {
  const host = await contextHost(), stale = deferred(), latest = deferred();
  let requests = 0;
  host.setLoader(() => ++requests === 1 ? stale.promise : latest.promise);
  const older = host.render().refreshAll(false), newer = host.render().refreshAll(false);
  const updated = { ...original, description: 'Newer snapshot' };
  latest.resolve(snapshot([updated])); await newer;
  stale.resolve(snapshot([original])); await older;
  assert.deepEqual(host.render().state.transactions, [updated]);
});
