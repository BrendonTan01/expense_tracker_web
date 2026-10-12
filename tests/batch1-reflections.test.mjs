import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const importTS = async source => import('data:text/javascript;base64,' + Buffer.from(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React } }).outputText).toString('base64'));
const helpers = await importTS(readFileSync('mobile/src/utils/reflections.ts', 'utf8'));
test('period drafts preserve an intentionally empty reflection and remain isolated', () => {
  const month = helpers.reflectionKey(2026, 10), year = helpers.reflectionKey(2026);
  const drafts = { [month]: '' };
  assert.equal(helpers.reflectionText(drafts, month, { summary: 'Old month' }), '');
  assert.equal(helpers.reflectionText(drafts, year, { summary: 'Old year' }), 'Old year');
  drafts[month] = 'Replacement';
  assert.equal(helpers.reflectionText(drafts, month, { summary: 'Old month' }), 'Replacement');
});
test('years include saved reflections without transactions and the current year', () => {
  assert.deepEqual(helpers.reflectionYears([{ date: '2025-01-01' }], [{ year: 2023 }], [{ year: 2024 }], 2026), [2026, 2025, 2024, 2023]);
});

// Execute the real endpoint against a small owner-filtered query implementation.
// Explicit user_id predicates are enforced even if the mock has no RLS.
const apiSource = readFileSync('api/summaries.js', 'utf8').replace(/import \{ getAuthenticatedClient \} from '[^']+';/, 'const getAuthenticatedClient = async () => globalThis.reflectionAuth;');
const handler = (await import('data:text/javascript;base64,' + Buffer.from(apiSource).toString('base64'))).default;
function response() { return { status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; }, send() { return this; }, setHeader() {} }; }
function database(rows, failTable) {
  return { from(table) {
    const filters = [];
    const query = { delete() { return query; }, eq(key, value) { filters.push([key, value]); return query; }, async select() {
      if (table === failTable) return { error: new Error('Database unavailable') };
      const deleted = rows[table].filter(row => filters.every(([key, value]) => row[key] === value));
      rows[table] = rows[table].filter(row => !deleted.includes(row));
      return { data: deleted.map(({ id }) => ({ id })), error: null };
    } };
    return query;
  } };
}
test('old clients delete monthly and yearly summaries; absent and foreign IDs are idempotent', async () => {
  const rows = { monthly_summaries: [{ id: 'm', user_id: 'a' }, { id: 'foreign-month', user_id: 'b' }], yearly_summaries: [{ id: 'y', user_id: 'a' }, { id: 'foreign-year', user_id: 'b' }] };
  globalThis.reflectionAuth = { user: { id: 'a' }, supabase: database(rows) };
  for (const id of ['m', 'y', 'y', 'missing', 'foreign-month', 'foreign-year']) {
    const res = response(); await handler({ method: 'DELETE', headers: {}, query: { id } }, res);
    assert.equal(res.code, 204);
  }
  assert.deepEqual(rows.monthly_summaries, [{ id: 'foreign-month', user_id: 'b' }]);
  assert.deepEqual(rows.yearly_summaries, [{ id: 'foreign-year', user_id: 'b' }]);
});
test('typed deletion does not touch the other period table and rejects invalid type', async () => {
  const rows = { monthly_summaries: [{ id: 'same', user_id: 'a' }], yearly_summaries: [{ id: 'same', user_id: 'a' }] };
  globalThis.reflectionAuth = { user: { id: 'a' }, supabase: database(rows) };
  let res = response(); await handler({ method: 'DELETE', headers: {}, query: { id: 'same', type: 'yearly' } }, res);
  assert.equal(res.code, 204); assert.equal(rows.monthly_summaries.length, 1); assert.equal(rows.yearly_summaries.length, 0);
  res = response(); await handler({ method: 'DELETE', headers: {}, query: { id: 'same', type: 'other' } }, res); assert.equal(res.code, 400);
});

// Lightweight hook host renders the actual screen without a native runtime.
function hookHost() {
  let slots = [], cursor = 0, effects = [], cleanups = [];
  const react = { createElement(type, props, ...children) { return { type, props: { ...props, children: children.flat(Infinity) } }; } };
  function useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = initial; return [slots[i], value => { slots[i] = typeof value === 'function' ? value(slots[i]) : value; }]; }
  return { react, useState, useRef(initial) { const [value] = useState({ current: initial }); return value; }, useMemo(fn) { return fn(); }, useEffect(fn) { const i = cursor++; if (!(i in slots)) { slots[i] = true; effects.push(fn); } }, render(fn) { cursor = 0; return fn(); }, flush() { effects.splice(0).forEach(fn => { const cleanup = fn(); if (cleanup) cleanups.push(cleanup); }); }, unmount() { cleanups.forEach(fn => fn()); } };
}
function nodes(tree, predicate) {
  if (!tree || typeof tree !== 'object') return [];
  return [...(predicate(tree) ? [tree] : []), ...(tree.props?.children || []).flatMap(child => nodes(child, predicate))];
}
const tick = () => new Promise(resolve => setImmediate(resolve));
test('real reflection screen saves cleared text and retains scoped month and year drafts', async () => {
  const host = hookHost(), calls = [];
  const monthly = [{ id: 'month-id', year: 2026, month: 1, summary: 'Monthly saved' }];
  const yearly = [{ id: 'year-id', year: 2026, summary: 'Year saved' }];
  globalThis.reflectionHarness = { ...host, helpers, api: {
    getMonthly: async () => monthly, getYearly: async () => yearly,
    update: async (id, summary, type) => { calls.push({ id, summary, type }); return { ...(type === 'monthly' ? monthly[0] : yearly[0]), summary }; },
    create: async value => { calls.push(value); return value; },
  } };
  let source = readFileSync('mobile/src/screens/ReflectionsScreen.tsx', 'utf8').replace(/import[\s\S]*?from ['"][^'"]+['"];\n/g, '');
  source = `const { react: React, useState, useEffect, useMemo, useRef, helpers: {reflectionKey, reflectionText, reflectionYears}, api: summariesApi } = globalThis.reflectionHarness;
const View='View', Text='Text', FlatList='FlatList', TouchableOpacity='TouchableOpacity', TextInput='TextInput', KeyboardAvoidingView='KeyboardAvoidingView', ScrollView='ScrollView';
const StyleSheet={create: x=>x}, Platform={OS:'android'}, Alert={alert:()=>{}}, useAuth=()=>({user:{id:'a'}}), useTheme=()=>({theme:{colors:{},spacing:{},fontSize:{},borderRadius:{}}}), useAppState=()=>({state:{transactions:[]}}), formatCurrency=String, hapticSelection=()=>{}, generateId=()=> 'new-id';
` + source;
  const module = await importTS(source);
  const accountScreen = module.default().type;
  let tree = host.render(accountScreen); host.flush(); await tick(); tree = host.render(accountScreen);
  const list = nodes(tree, n => n.type === 'FlatList')[0];
  list.props.renderItem({ item: 2026 }).props.onPress(); tree = host.render(accountScreen);
  nodes(tree, n => n.type === 'TextInput')[0].props.onChangeText('Year draft');
  const january = nodes(tree, n => n.type === 'TouchableOpacity' && nodes(n, child => child.type === 'Text' && child.props.children.includes('January')).length)[0];
  january.props.onPress(); tree = host.render(accountScreen);
  nodes(tree, n => n.type === 'TextInput')[0].props.onChangeText(''); tree = host.render(accountScreen);
  assert.equal(nodes(tree, n => n.type === 'TextInput')[0].props.value, '');
  const save = nodes(tree, n => n.type === 'TouchableOpacity').at(-1); save.props.onPress(); await tick();
  assert.deepEqual(calls[0], { id: 'month-id', summary: '', type: 'monthly' });
  tree = host.render(accountScreen); nodes(tree, n => n.type === 'TextInput')[0].props.onChangeText('Unsaved month');
  nodes(tree, n => n.type === 'TouchableOpacity')[0].props.onPress(); tree = host.render(accountScreen);
  assert.equal(nodes(tree, n => n.type === 'TextInput')[0].props.value, 'Year draft');
  nodes(tree, n => n.type === 'TouchableOpacity')[1].props.onPress(); await tick();
  assert.deepEqual(calls[1], { id: 'year-id', summary: 'Year draft', type: 'yearly' });
  host.unmount();
});

test('hidden Transactions remains a registered navigable route for Add', async () => {
  const host = hookHost();
  globalThis.tabHarness = host;
  let source = readFileSync('mobile/src/navigation/MainTabs.tsx', 'utf8').replace(/import[\s\S]*?from ['"][^'"]+['"];\n/g, '');
  source = `const React=globalThis.tabHarness.react; const transactionEntry=()=>({entryId:'new-entry'});
const View='View', StyleSheet={}, TouchableOpacity='TouchableOpacity', Platform={OS:'android'}, hapticLight=()=>{};
const createBottomTabNavigator=()=>({Navigator:'Navigator',Screen:'Screen'}), createNativeStackNavigator=createBottomTabNavigator;
const SummaryScreen='Summary', CalendarScreen='Calendar', TransactionsScreen='Transactions', TransactionFormScreen='Form', MoreStack='More', BucketsScreen='Buckets';
const useTheme=()=>({theme:{colors:{},fontSize:{}}}), useLayout=()=>({layout:{tabs:[{id:'summary',visible:true},{id:'add',visible:true},{id:'transactions',visible:false},{id:'calendar',visible:false},{id:'more',visible:true}]}});
` + source;
  const module = await importTS(source), tree = module.default();
  const screens = nodes(tree, n => n.type === 'Screen');
  const transactions = screens.find(n => n.props.name === 'TransactionsTab');
  assert.ok(transactions); assert.deepEqual(transactions.props.options.tabBarItemStyle, { display: 'none' });
  assert.ok(screens.find(n => n.props.name === 'CalendarTab'));
  const calls = [];
  const add = screens.find(n => n.props.name === 'AddTab');
  add.props.listeners({ navigation: { navigate: (...args) => calls.push(args) } }).tabPress({ preventDefault() {} });
  assert.deepEqual(calls, [['TransactionsTab', { screen: 'TransactionForm', params: {entryId:'new-entry'}, initial:false }]]);
  const stack = transactions.props.component();
  assert.ok(nodes(stack, n => n.type === 'Screen').some(n => n.props.name === 'TransactionBuckets'));
});

test('reflection deletion database failure is reported and can be retried for either table without touching another owner', async () => {
  for (const type of ['monthly', 'yearly']) {
    const table = `${type}_summaries`;
    const rows = { monthly_summaries: [], yearly_summaries: [] };
    rows[table] = [{ id: 'mine', user_id: 'a' }, { id: 'foreign', user_id: 'b' }];
    globalThis.reflectionAuth = { user: { id: 'a' }, supabase: database(rows, table) };
    let res = response();
    const originalError = console.error; console.error = () => {};
    try { await handler({ method: 'DELETE', headers: {}, query: { id: 'mine', type } }, res); }
    finally { console.error = originalError; }
    assert.equal(res.code, 500); assert.equal(rows[table].length, 2);
    globalThis.reflectionAuth = { user: { id: 'a' }, supabase: database(rows) };
    res = response(); await handler({ method: 'DELETE', headers: {}, query: { id: 'mine', type } }, res);
    assert.equal(res.code, 204); assert.deepEqual(rows[table], [{ id: 'foreign', user_id: 'b' }]);
  }
});
