import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { StackRouter, CommonActions } from '../mobile/node_modules/@react-navigation/routers/lib/module/index.js';

const tick = () => new Promise(resolve => setImmediate(resolve));
// Real component handlers/effects execute against inert element trees. Keys are
// reconciled explicitly by the harness; this is not React DOM/native rendering.
function hooks() {
  const slots = [], effects = [], cleanups = []; let cursor = 0, mounted = true, lateWrites = 0;
  const react = {
    createElement: (type, props, ...children) => ({ type, props: { ...props, children: children.flat(Infinity) } }),
    useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = typeof initial === 'function' ? initial() : initial; return [slots[i], value => { if (!mounted) lateWrites++; slots[i] = typeof value === 'function' ? value(slots[i]) : value; }]; },
    useRef(initial) { return react.useState({ current: initial })[0]; },
    useEffect(fn, deps) { const i = cursor++; if (!(i in slots) || !deps || deps.some((v, j) => !Object.is(v, slots[i]?.[j]))) { slots[i] = deps; effects.push(() => { cleanups[i]?.(); cleanups[i] = fn(); }); } },
    useMemo: fn => fn(), useCallback: fn => fn,
  };
  return { react, render(fn) { cursor = 0; return fn(); }, flush() { effects.splice(0).forEach(fn => fn()); }, unmount() { cleanups.forEach(fn => fn?.()); mounted = false; }, get lateWrites() { return lateWrites; } };
}
function load(path, mocks = {}) {
  const exports = {};
  runInNewContext(ts.transpileModule(readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true } }).outputText, {
    exports, require: name => { if (!(name in mocks)) throw Error(`Missing mock ${name}`); return mocks[name]; }, console,
  });
  return exports;
}
function nodes(tree, predicate) { return !tree || typeof tree !== 'object' ? [] : [...(predicate(tree) ? [tree] : []), ...(tree.props?.children ?? []).flatMap(c => nodes(c, predicate))]; }
function button(tree, text, type = 'button') { const found = nodes(tree, n => n.type === type && nodes(n, t => t.props?.children?.filter(c => typeof c !== 'object').join('') === text).length)[0]; assert.ok(found, `button ${text}`); return found; }
const privateTemplate = owner => ({ id: owner, name: `${owner} private`, type: 'income', description: `${owner} secret description`, amount: 1.23, tags: [], notes: '' });

function browserTemplates() {
  let user = { id: 'A' }, host, component, key;
  const reads = [], writes = [], alerts = [], used = [];
  const values = new Map([['transaction_templates', JSON.stringify([privateTemplate('legacy')])]]);
  const keys = load('src/utils/templateStorage.ts');
  for (const owner of ['A', 'B']) values.set(keys.templateStorageKey(owner), JSON.stringify([privateTemplate(owner)]));
  let failWrite = false;
  const storage = {
    getItem: k => { reads.push(k); return values.get(k) ?? null; },
    setItem: (k, v) => { writes.push(k); if (failWrite) throw Error('quota'); values.set(k, v); },
  };
  // Inject browser globals into the component's execution realm.
  const compileBrowser = () => {
    const exports = {}, mocks = {
      react: host.react, '../contexts/AuthContext': { useAuth: () => ({ user }) },
      '../utils/storage': { getStorageKey: k => k, generateId: () => 'new-template' },
      '../utils/templateStorage': keys, '../utils/money': { parseMoneyInput: Number, getMoneyInputError: () => null },
    };
    runInNewContext(ts.transpileModule(readFileSync('src/components/TransactionTemplates.tsx', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true } }).outputText, { exports, React: host.react, require: n => mocks[n], localStorage: storage, window: { alert: s => alerts.push(s), confirm: () => true } });
    return exports.default;
  };
  function mount(owner) {
    host?.unmount(); user = owner ? { id: owner } : null; host = hooks(); component = compileBrowser();
    const outer = component({ buckets: [], onUseTemplate: t => used.push(t) });
    key = outer?.props.key;
    return outer;
  }
  function render() { const outer = component({ buckets: [], onUseTemplate: t => used.push(t) }); return outer ? host.render(() => outer.type(outer.props)) : null; }
  return { mount, render, flush: () => host.flush(), values, reads, writes, alerts, used, keys, setFailWrite: v => { failWrite = v; }, get key() { return key; } };
}

test('browser account mount A → signed out → B → A isolates template rendering/use/write and leaves ownerless data untouched', () => {
  const h = browserTemplates();
  h.mount('A'); assert.equal(h.key, 'A'); h.render(); h.flush();
  let tree = h.render(); button(tree, 'Use').props.onClick(); assert.equal(h.used.at(-1).id, 'A');
  button(tree, 'Edit').props.onClick(); tree = h.render();
  const name = nodes(tree, n => n.type === 'input' && n.props.placeholder === 'e.g., Grocery Shopping')[0];
  name.props.onChange({ target: { value: 'A updated' } }); tree = h.render();
  nodes(tree, n => n.type === 'form')[0].props.onSubmit({ preventDefault() {} });
  assert.equal(JSON.parse(h.values.get(h.keys.templateStorageKey('A')))[0].name, 'A updated');
  const before = h.reads.length; h.mount(null); assert.equal(h.render(), null); h.flush(); assert.equal(h.reads.length, before);
  h.mount('B'); assert.equal(h.key, 'B'); h.render(); h.flush(); tree = h.render();
  const text = JSON.stringify(tree); assert.match(text, /B private/); assert.doesNotMatch(text, /A updated|A secret|legacy private/);
  button(tree, 'Use').props.onClick(); assert.equal(h.used.at(-1).id, 'B');
  button(tree, 'Delete').props.onClick(); assert.deepEqual(JSON.parse(h.values.get(h.keys.templateStorageKey('B'))), []);
  h.mount('A'); h.render(); h.flush(); assert.match(JSON.stringify(h.render()), /A updated/);
  assert.deepEqual(h.writes, [h.keys.templateStorageKey('A'), h.keys.templateStorageKey('B')]);
  assert.ok(!h.reads.includes('transaction_templates')); assert.equal(JSON.parse(h.values.get('transaction_templates'))[0].id, 'legacy');
});

test('browser template rejected storage write retains the edit and supports a successful retry without false list updates', () => {
  const h = browserTemplates(); h.mount('A'); h.render(); h.flush();
  button(h.render(), 'Edit').props.onClick(); let tree = h.render();
  nodes(tree, n => n.type === 'input' && n.props.placeholder === 'e.g., Grocery Shopping')[0].props.onChange({ target: { value: 'Retry saved' } });
  tree = h.render(); h.setFailWrite(true); nodes(tree, n => n.type === 'form')[0].props.onSubmit({ preventDefault() {} });
  tree = h.render(); assert.ok(nodes(tree, n => n.type === 'form').length); assert.equal(JSON.parse(h.values.get(h.keys.templateStorageKey('A')))[0].name, 'A private');
  assert.match(h.alerts.at(-1), /could not be saved/);
  h.setFailWrite(false); nodes(tree, n => n.type === 'form')[0].props.onSubmit({ preventDefault() {} });
  assert.equal(nodes(h.render(), n => n.type === 'form').length, 0); assert.equal(JSON.parse(h.values.get(h.keys.templateStorageKey('A')))[0].name, 'Retry saved');
});

test('all four allowed tab visibility settings retain Add, edit and first-bucket destinations through installed stack routers', () => {
  let id = 0;
  for (const calendar of [false, true]) for (const transactions of [false, true]) {
    const host = hooks(), nav = { Navigator: 'Navigator', Screen: 'Screen' };
    const mocks = {
      react: host.react, 'react-native': { View: 'View', TouchableOpacity: 'TouchableOpacity', StyleSheet: {}, Platform: { OS: 'android' } },
      '../utils/haptics': { hapticLight() {} }, './transactionEntry': { transactionEntry: () => ({ entryId: `entry-${++id}` }) },
      '@react-navigation/bottom-tabs': { createBottomTabNavigator: () => nav }, '@react-navigation/native-stack': { createNativeStackNavigator: () => nav },
      '../contexts/ThemeContext': { useTheme: () => ({ theme: { colors: {}, fontSize: {} } }) },
      '../contexts/LayoutContext': { useLayout: () => ({ layout: { tabs: ['summary','calendar','add','transactions','more'].map(t => ({ id: t, visible: t === 'calendar' ? calendar : t === 'transactions' ? transactions : true })) } }) },
      './MoreStack': 'More',
    };
    for (const n of ['Summary','Calendar','Transactions','TransactionForm','Buckets']) mocks[`../screens/${n}Screen`] = n;
    const tree = load('mobile/src/navigation/MainTabs.tsx', mocks).default();
    assert.equal(tree.props.initialRouteName, 'SummaryTab');
    const routes = nodes(tree, n => n.type === 'Screen');
    assert.equal(routes.length, 5);
    for (const [tab, visible] of [['CalendarTab', calendar], ['TransactionsTab', transactions]]) {
      const screen = routes.find(n => n.props.name === tab); assert.equal(screen.props.options.tabBarItemStyle?.display === 'none', !visible);
      const screens = nodes(screen.props.component(), n => n.type === 'Screen'), router = StackRouter({ initialRouteName: screens[0].props.name });
      const opts = { routeNames: screens.map(n => n.props.name), routeParamList: {}, routeGetIdList: Object.fromEntries(screens.map(n => [n.props.name, n.props.getId])) };
      let state = router.getInitialState(opts);
      const params = { entryId: `edit-${++id}`, transaction: { id: 'original', date: '2026-01-01' } };
      state = router.getStateForAction(state, CommonActions.navigate('TransactionForm', params), opts);
      assert.equal(state.routes[state.index].params.transaction.id, 'original'); const editorKey = state.routes[state.index].key;
      state = router.getStateForAction(state, CommonActions.navigate('TransactionBuckets', { returnToTransaction: true }), opts);
      assert.equal(state.routes[state.index].name, 'TransactionBuckets');
      state = router.getStateForAction(state, CommonActions.goBack(), opts); assert.equal(state.routes[state.index].key, editorKey);
    }
    let add;
    routes.find(n => n.props.name === 'AddTab').props.listeners({ navigation: { navigate: (...args) => { add = args; } } }).tabPress({ preventDefault() {} });
    assert.equal(add[0], 'TransactionsTab'); assert.equal(add[1].screen, 'TransactionForm'); assert.equal(add[1].initial, false); assert.ok(add[1].params.entryId);
  }
});

function reflectionScreen(api) {
  const host = hooks(), alerts = [];
  const mocks = {
    react: host.react,
    'react-native': { ...Object.fromEntries(['View','Text','TextInput','TouchableOpacity','ScrollView','KeyboardAvoidingView','FlatList'].map(n => [n, n])), StyleSheet: { create: x => x }, Platform: { OS: 'android' }, Alert: { alert: (...args) => alerts.push(args) } },
    '../contexts/AuthContext': { useAuth: () => ({ user: { id: 'A' } }) },
    '../contexts/ThemeContext': { useTheme: () => ({ theme: { colors: {}, fontSize: {}, spacing: {}, borderRadius: {} } }) },
    '../contexts/AppStateContext': { useAppState: () => ({ state: { transactions: [] } }) },
    '../utils/reflections': load('mobile/src/utils/reflections.ts'),
    '../components/FinancialErrorBoundary': { withFinancialErrorBoundary: screen => screen },
    '../utils/money': load('mobile/src/utils/money.ts'),
    '../utils/api': { summariesApi: api }, '../utils/haptics': { hapticSelection() {} },
    '../utils/storage': { generateId: () => 'new-reflection' }, '../utils/dateHelpers': load('mobile/src/utils/dateHelpers.ts'),
  };
  const screen = load('mobile/src/screens/ReflectionsScreen.tsx', mocks).default;
  return { host, alerts, render() { const outer = screen(); return host.render(() => outer.type(outer.props)); } };
}

test('actual reflections screen discovers orphan monthly/yearly years and edits each saved record by the correct period ID', async () => {
  const monthly = [{ id: 'orphan-month', year: 2001, month: 12, summary: 'December orphan' }];
  const yearly = [{ id: 'orphan-year', year: 2002, summary: 'Year orphan' }]; const calls = [];
  const h = reflectionScreen({ getMonthly: async () => monthly, getYearly: async () => yearly, update: async (id, summary, type) => { calls.push({ id, summary, type }); return { ...(type === 'monthly' ? monthly[0] : yearly[0]), summary }; } });
  h.render(); h.host.flush(); await tick(); let tree = h.render();
  let list = nodes(tree, n => n.type === 'FlatList')[0]; assert.deepEqual(Array.from(list.props.data), [new Date().getFullYear(), 2002, 2001]);
  list.props.renderItem({ item: 2001 }).props.onPress(); tree = h.render();
  button(tree, 'December', 'TouchableOpacity').props.onPress(); tree = h.render();
  assert.equal(nodes(tree, n => n.type === 'TextInput')[0].props.value, 'December orphan');
  nodes(tree, n => n.type === 'TextInput')[0].props.onChangeText(''); tree = h.render();
  button(tree, 'Save Reflection', 'TouchableOpacity').props.onPress(); await tick();
  assert.equal(nodes(h.render(), n => n.type === 'TextInput')[0].props.value, '');
  button(h.render(), 'Back to 2001', 'TouchableOpacity').props.onPress(); button(h.render(), 'Back to all years', 'TouchableOpacity').props.onPress();
  tree = h.render(); list = nodes(tree, n => n.type === 'FlatList')[0]; list.props.renderItem({ item: 2002 }).props.onPress(); tree = h.render();
  assert.equal(nodes(tree, n => n.type === 'TextInput')[0].props.value, 'Year orphan');
  nodes(tree, n => n.type === 'TextInput')[0].props.onChangeText('Year replaced');
  button(h.render(), 'Save Reflection', 'TouchableOpacity').props.onPress(); await tick();
  assert.deepEqual(calls, [{ id: 'orphan-month', summary: '', type: 'monthly' }, { id: 'orphan-year', summary: 'Year replaced', type: 'yearly' }]);
  h.host.unmount();
});

test('reflection load failure has explicit retry; failed save retains draft and blocks duplicate taps until retry', async () => {
  let failedLoad = true, updates = 0, rejectSave;
  const year = new Date().getFullYear();
  const pendingSave = new Promise((_resolve, reject) => { rejectSave = reject; });
  const h = reflectionScreen({
    getMonthly: async () => [], getYearly: async () => { if (failedLoad) throw Error('offline'); return [{ id: 'saved', year, summary: 'Old' }]; },
    update: async (id, summary) => { updates++; if (updates === 1) return pendingSave; return { id, year, summary }; },
  });
  h.render(); h.host.flush(); await tick();
  assert.equal(nodes(h.render(), n => n.type === 'FlatList').length, 0); failedLoad = false;
  button(h.render(), 'Try again', 'TouchableOpacity').props.onPress(); await tick();
  nodes(h.render(), n => n.type === 'FlatList')[0].props.renderItem({ item: year }).props.onPress();
  nodes(h.render(), n => n.type === 'TextInput')[0].props.onChangeText('Draft preserved');
  const staleSaveButton = button(h.render(), 'Save Reflection', 'TouchableOpacity'); staleSaveButton.props.onPress(); staleSaveButton.props.onPress();
  assert.equal(updates, 1); assert.equal(nodes(h.render(), n => n.type === 'TextInput')[0].props.editable, false);
  rejectSave(Error('connection lost')); await tick();
  assert.equal(nodes(h.render(), n => n.type === 'TextInput')[0].props.value, 'Draft preserved'); assert.match(h.alerts[0][0], /Could not save/);
  button(h.render(), 'Save Reflection', 'TouchableOpacity').props.onPress(); await tick(); assert.equal(updates, 2);
  assert.equal(nodes(h.render(), n => n.type === 'TextInput')[0].props.value, 'Draft preserved');
  h.host.unmount();
});

test('reflection load completing after account subtree unmount cannot publish old account results', async () => {
  let resolve; const pending = new Promise(r => { resolve = r; });
  const h = reflectionScreen({ getMonthly: () => pending, getYearly: async () => [] });
  h.render(); h.host.flush(); h.host.unmount(); resolve([{ id: 'A-private', year: 2001, month: 1, summary: 'Private' }]); await tick();
  assert.equal(h.host.lateWrites, 0);
});
