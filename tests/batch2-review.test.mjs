import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';

// Independently exercise actual component calculations and actions. Views and
// charts are inert trees; financial/date modules execute their production code.
// These tests cannot verify browser rendering, native gestures, or hosted SQL.
function host() {
  const slots = []; let cursor = 0;
  const react = {
    useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = typeof initial === 'function' ? initial() : initial; return [slots[i], value => { slots[i] = typeof value === 'function' ? value(slots[i]) : value; }]; },
    useMemo: fn => fn(), useEffect() {}, useCallback: fn => fn,
  };
  return { react, render(fn) { cursor = 0; return fn(); } };
}
function loader(h, now = '2024-03-15T12:00:00Z', visibility = {}) {
  const RealDate = Date;
  class Clock extends RealDate { constructor(...args) { super(...(args.length ? args : [now])); } static now() { return +new RealDate(now); } }
  const element = (type, props, key) => ({ type, props: { ...props, ...(key === undefined ? {} : { key }) } });
  const cache = new Map();
  const load = (file, extra = '') => {
    file = path.resolve(file);
    if (!extra && cache.has(file)) return cache.get(file).exports;
    const module = { exports: {} }; if (!extra) cache.set(file, module);
    const mocks = {
      react: h.react, 'react/jsx-runtime': { jsx: element, jsxs: element, Fragment: 'Fragment' },
      recharts: Object.fromEntries(['BarChart','Bar','XAxis','YAxis','CartesianGrid','Tooltip','Legend','ResponsiveContainer','Cell','PieChart','Pie','LineChart','Line'].map(n => [n,n])),
      './SummaryNotes': 'SummaryNotes',
      '../utils/storage': { saveToLocalStorage() {}, loadFromLocalStorage: async () => null, generateId: () => 'synthetic' },
    };
    const source = ts.transpileModule(readFileSync(file, 'utf8') + extra, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
    vm.runInNewContext(source, { module, exports: module.exports, Date: Clock, console,
      localStorage: { getItem: () => JSON.stringify(visibility), setItem() {} },
      window: { innerWidth: 1200 }, document: { documentElement: { classList: { contains: () => false } } },
      require: id => id in mocks ? mocks[id] : load(path.resolve(path.dirname(file), id + '.ts')),
    }, { filename: file });
    return module.exports;
  };
  return { load };
}
function nodes(tree, predicate) {
  if (!tree || typeof tree !== 'object') return [];
  return [...(predicate(tree) ? [tree] : []), ...[tree.props?.children].flat(Infinity).flatMap(child => nodes(child, predicate))];
}
function texts(tree) {
  if (typeof tree === 'string' || typeof tree === 'number') return [String(tree)];
  if (!tree || typeof tree !== 'object') return [];
  return [tree.props?.children].flat(Infinity).flatMap(texts);
}
const transaction = (id, amount, date, type = 'expense') => ({ id, amount, date, type, description: id, bucketId: 'food' });

test('both money modules agree with an independent integer oracle over varied cent inputs', () => {
  for (const root of ['src', 'mobile/src']) {
    const { addMoney, subtractMoney } = loader(host()).load(`${root}/utils/money.ts`);
    let seed = 713, actual = 0, oracle = 0n;
    for (let i = 0; i < 4000; i++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      const cents = (seed % 200000001) - 100000000;
      oracle += BigInt(cents); actual = addMoney(actual, cents / 100);
      assert.equal(actual, Number(oracle) / 100, `${root}, record ${i}`);
    }
    assert.equal(subtractMoney(actual, Number(oracle) / 100), 0);
    assert.throws(() => addMoney(actual, 0.0001), { name: 'RangeError' });
  }
});

test('both date modules preserve years below 100 in periods and anchored recurrence arithmetic', () => {
  const prior = process.env.TZ;
  try {
    for (const zone of ['Australia/Sydney','America/New_York','UTC']) {
      process.env.TZ = zone;
      for (const root of ['src','mobile/src']) {
        const dates = loader(host()).load(`${root}/utils/dateHelpers.ts`);
        for (const year of ['0001','0099']) {
          assert.equal(dates.startOfMonthIsoLocal(`${year}-02-16`), `${year}-02-01`, root+zone);
          assert.equal(dates.endOfMonthIsoLocal(`${year}-02-16`), `${year}-02-28`, root+zone);
          assert.equal(dates.startOfYearIsoLocal(`${year}-02-16`), `${year}-01-01`, root+zone);
          assert.equal(dates.endOfYearIsoLocal(`${year}-02-16`), `${year}-12-31`, root+zone);
          assert.equal(dates.getNextOccurrence('monthly',`${year}-01-31`,`${year}-02-28`), `${year}-03-31`, root+zone);
        }
        assert.equal(dates.getNextOccurrence('yearly','0004-02-29','0005-02-28'), '0006-02-28', root+zone);
        assert.equal(dates.getNextOccurrence('yearly','0004-02-29','0007-02-28'), '0008-02-29', root+zone);
        assert.equal(dates.getNextOccurrence('yearly','0099-01-31','0099-01-31'), '0100-01-31', root+zone);
      }
    }
  } finally { if (prior === undefined) delete process.env.TZ; else process.env.TZ = prior; }
});

test('actual web Summary chart and cards agree at cents and leap/month boundaries in each supported timezone', () => {
  const prior = process.env.TZ;
  try {
    for (const zone of ['Australia/Sydney', 'America/New_York', 'UTC']) {
      process.env.TZ = zone;
      const h = host(), { load } = loader(h);
      const Summary = load('src/components/Summary.tsx').default;
      const rows = [transaction('feb', 9, '2024-02-29'), transaction('first', 0.1, '2024-03-01'), transaction('last', 0.2, '2024-03-31'), transaction('income', 0.3, '2024-03-01', 'income')];
      const render = () => h.render(() => Summary({ transactions: rows, buckets: [{ id: 'food', name: 'Food' }], budgets: [] }));
      let tree = render();
      nodes(tree, n => n.type === 'select')[0].props.onChange({ target: { value: 'thisMonth' } }); tree = render();
      const chart = nodes(tree, n => n.type === 'BarChart')[0].props.data;
      assert.equal(chart.length, 1, zone); assert.equal(chart[0].periodKey, '2024-03', zone);
      assert.equal(chart[0].expenses, 0.3, zone); assert.equal(chart[0].income, 0.3, zone);
      const visible = texts(tree); assert.ok(visible.includes('$0.00'), zone); assert.ok(visible.includes('$0.30'), zone);
    }
  } finally { if (prior === undefined) delete process.env.TZ; else process.env.TZ = prior; }
});

test('actual web Calendar excludes projected expenses from posted totals and includes them only on request', () => {
  const { load } = loader(host());
  const { computeStats, postedExpenseTotal } = load('src/components/CalendarView.tsx', '\nexport { computeStats, postedExpenseTotal };');
  const posted = [transaction('one', 0.1, '2024-03-10'), transaction('two', 0.2, '2024-03-10'), transaction('income', 0.3, '2024-03-10', 'income')].map(t => ({ kind: 'posted', date: t.date, transaction: t }));
  const projected = { kind: 'scheduled', date: '2024-03-10', transaction: transaction('next', 0.4, '2024-03-10'), recurringId: 'rec' };
  const items = [...posted, projected];
  assert.equal(postedExpenseTotal(items), 0.3);
  const actual = computeStats(items, [{ id: 'food', name: 'Food' }], false);
  assert.equal(actual.expenses, 0.3); assert.equal(actual.balance, 0); assert.equal(actual.bucketBreakdown[0].total, 0.3);
  const withProjection = computeStats(items, [], true);
  assert.equal(withProjection.expenses, 0.7); assert.equal(withProjection.balance, -0.4);
});

test('actual web Summary keeps active budget spending bound to its period when dashboard ranges change', () => {
  const h = host(), { load } = loader(h, '2024-03-15T12:00:00Z', { budgetStatus: true });
  const Summary = load('src/components/Summary.tsx').default;
  const rows = [transaction('prior year', 8, '2023-12-31'), transaction('prior month', 0.4, '2024-02-29'), transaction('first', 0.1, '2024-03-01'), transaction('last', 0.2, '2024-03-31')];
  const budgets = [{ id: 'month', bucketId: 'food', amount: 0.3, period: 'monthly', year: 2024, month: 3 }, { id: 'year', bucketId: 'food', amount: 0.7, period: 'yearly', year: 2024 }];
  const render = () => h.render(() => Summary({ transactions: rows, buckets: [{ id: 'food', name: 'Food' }], budgets }));
  const verify = tree => {
    const section = nodes(tree, n => n.props.className === 'budget-status')[0];
    for (const [id, spent] of [['month','$0.30'], ['year','$0.70']]) {
      const card = nodes(section, n => n.props.key === id)[0]; assert.ok(card);
      const visible = texts(card); assert.ok(visible.includes(spent), id); assert.ok(visible.includes('On Track'), id);
    }
  };
  let tree = render(); verify(tree);
  nodes(tree, n => n.type === 'select')[0].props.onChange({ target: { value: 'all' } }); tree = render(); verify(tree);
  nodes(tree, n => n.type === 'select')[0].props.onChange({ target: { value: 'custom' } }); tree = render();
  const dates = nodes(tree, n => n.type === 'input' && n.props.type === 'date');
  dates[0].props.onChange({ target: { value: '2023-12-01' } }); dates[1].props.onChange({ target: { value: '2023-12-31' } }); tree = render();
  nodes(tree, n => n.type === 'button' && n.props.className === 'btn-apply')[0].props.onClick(); tree = render(); verify(tree);
  const chart = nodes(tree, n => n.type === 'BarChart')[0].props.data;
  assert.equal(chart.length, 1); assert.equal(chart[0].periodKey, '2023-12'); assert.equal(chart[0].expenses, 8);
});

test('actual web entry/list default to local today and list includes that day after UTC midnight divergence', () => {
  const prior = process.env.TZ;
  try {
    for (const [zone, instant, day, next] of [['Australia/Sydney','2024-01-01T13:30:00Z','2024-01-02','2024-01-03'], ['America/New_York','2024-01-01T02:30:00Z','2023-12-31','2024-01-01']]) {
      process.env.TZ = zone;
      const h = host(), { load } = loader(h, instant);
      const Form = load('src/components/TransactionForm.tsx').default;
      const tree = h.render(() => Form({ buckets: [], onSubmit() {}, existingTransactions: [] }));
      assert.equal(nodes(tree, n => n.type === 'input' && n.props.type === 'date')[0].props.value, day);
      const listHost = host();
      const List = loader(listHost, instant).load('src/components/TransactionList.tsx').default;
      const list = listHost.render(() => List({ transactions: [transaction('today visible', 0.1, day), transaction('future hidden', 0.1, next)], buckets: [], onDelete() {} }));
      const visible = texts(list); assert.ok(visible.includes('today visible'), zone); assert.ok(!visible.includes('future hidden'), zone);
    }
  } finally { if (prior === undefined) delete process.env.TZ; else process.env.TZ = prior; }
});

for (const mutation of ['delete', 'create']) test(`authoritative budget refresh preserves an acknowledged transaction ${mutation} while loading`, async () => {
  const source = readFileSync('src/App.tsx','utf8');
  const handler = (name, following) => source.slice(source.indexOf(`  const ${name} =`), source.indexOf(`  const ${following} =`));
  const code = handler('handleAddBudgets','handleUpdateBudget') + handler('handleDeleteTransaction','handleEditTransaction') + handler('handleAddTransaction','handleDuplicateTransaction') + '\nexports.add=handleAddBudgets; exports.remove=handleDeleteTransaction; exports.create=handleAddTransaction;';
  let release;
  const oldSnapshot = new Promise(resolve => { release = resolve; });
  const owner = { id:'A', mounted:true }, exports = {}; let reads=0;
  let current = { transactions:[transaction('deleted',1.23,'2024-03-01')], recurringTransactions:[], budgets:[], buckets:[] };
  const before = structuredClone(current);
  vm.runInNewContext(ts.transpileModule(code,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText, {
    exports, accountLifetime:{current:owner}, readSequence:{current:0}, ownsAccount: actual => actual === owner,
    setState: update => { current = typeof update === 'function' ? update(current) : update; },
    setError() {}, setActionStatus() {}, setEditingTransaction() {}, setActiveTab() {}, editingTransaction:null, state:before,
    showSaved() {}, setTimeout() {}, console, generateId:()=> 'created',
    budgetsApi:{createBatch:async()=>({})}, transactionsApi:{delete:async()=>{},create:async value=>value},
    appStateApi:{load:()=> ++reads === 1 ? oldSnapshot : Promise.resolve({...current,budgets:[{id:'budget'}]})},
  });
  const save = exports.add([{id:'budget'}],'receipt'); await new Promise(resolve => setImmediate(resolve));
  if (mutation === 'delete') await exports.remove('deleted');
  else await exports.create({type:'income',amount:0.3,date:'2024-03-01',description:'created'});
  const expected = JSON.stringify(current.transactions);
  release({...before,budgets:[{id:'budget'}]}); await save;
  assert.equal(JSON.stringify(current.transactions),expected,'older complete snapshot must not overwrite acknowledged transaction changes');
  assert.equal(current.budgets[0].id,'budget','fresh authoritative data must still include the saved budget');
  assert.equal(reads,2);
});

test('web authoritative refresh stops on repeated concurrent changes without publishing stale data or success', async () => {
  const source=readFileSync('src/App.tsx','utf8');
  const code=source.slice(source.indexOf('  const handleAddBudgets ='),source.indexOf('  const handleUpdateBudget ='))+'\nexports.save=handleAddBudgets;';
  const owner={id:'A'},exports={},sequence={current:0}; let reads=0,writes=0,successes=0;
  vm.runInNewContext(ts.transpileModule(code,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{
    exports,accountLifetime:{current:owner},readSequence:sequence,ownsAccount:value=>value===owner,
    setError(){},setActionStatus(){},setState(){writes++;},showSaved(){successes++;},
    budgetsApi:{createBatch:async()=>({})},appStateApi:{load:async()=>{reads++;sequence.current++;return {transactions:[{id:'stale'}]};}},
  });
  await assert.rejects(exports.save([{id:'b'}],'request'),/changed while refreshing/);
  assert.ok(reads>1&&reads<=5,'refresh retries must be bounded'); assert.equal(writes,0); assert.equal(successes,0);
});

test('old web account refresh completing during a new login cannot publish its snapshot', async () => {
  const source=readFileSync('src/App.tsx','utf8');
  const code=source.slice(source.indexOf('  const handleAddBudgets ='),source.indexOf('  const handleUpdateBudget ='))+'\nexports.save=handleAddBudgets;';
  let release;const wait=new Promise(resolve=>{release=resolve;});const owner={id:'A'},lifetime={current:owner},exports={};let writes=0,successes=0;
  vm.runInNewContext(ts.transpileModule(code,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{
    exports,accountLifetime:lifetime,readSequence:{current:0},ownsAccount:value=>value===lifetime.current,
    setError(){},setActionStatus(){},setState(){writes++;},showSaved(){successes++;},
    budgetsApi:{createBatch:async()=>({})},appStateApi:{load:()=>wait},
  });
  const pending=exports.save([{id:'b'}],'request');await new Promise(resolve=>setImmediate(resolve));
  lifetime.current={id:'B'};release({transactions:[{id:'A-private'}]});
  await assert.rejects(pending,/Account changed/);assert.equal(writes,0);assert.equal(successes,0);
});
