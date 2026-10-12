import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { StackRouter, CommonActions, StackActions } from '../mobile/node_modules/@react-navigation/routers/lib/module/index.js';

// Native views are inert trees; component handlers/hooks and the installed stack
// router execute real code. This does not substitute for Android Back testing.
function host() {
  const slots = []; let cursor = 0;
  const react = {
    createElement: (type, props, ...children) => ({ type, props: { ...props, children: children.flat(Infinity) } }),
    useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = typeof initial === 'function' ? initial() : initial; return [slots[i], v => { slots[i] = typeof v === 'function' ? v(slots[i]) : v; }]; },
    useRef(v) { const [ref] = react.useState({ current: v }); return ref; },
    useEffect() {}, useMemo: fn => fn(), useCallback: fn => fn,
  };
  return { react, render(fn) { cursor = 0; return fn(); } };
}
function load(path, mocks) {
  const exports = {};
  runInNewContext(ts.transpileModule(readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true } }).outputText, {
    exports, require(name) { if (!(name in mocks)) throw Error(`Missing ${name}`); return mocks[name]; }, console,
  });
  return exports;
}
function nodes(tree, predicate) { return !tree || typeof tree !== 'object' ? [] : [...(predicate(tree) ? [tree] : []), ...(tree.props?.children ?? []).flatMap(c => nodes(c, predicate))]; }
function button(tree, text) { const found = nodes(tree, n => n.type === 'TouchableOpacity' && nodes(n, t => t.type === 'Text' && t.props.children.includes(text)).length)[0]; assert.ok(found, text); return found; }
let nextId = 0;
const storage = { generateId: () => `entry-${++nextId}` };
const entry = load('mobile/src/navigation/transactionEntry.ts', { '../utils/storage': storage });
const date = load('mobile/src/utils/dateHelpers.ts', {});
function mocks(h, state = { buckets: [], transactions: [], budgets: [], recurringTransactions: [] }) {
  return {
    react: h.react,
    'react-native': { ...Object.fromEntries(['View','Text','TextInput','TouchableOpacity','ScrollView','KeyboardAvoidingView','ActivityIndicator','RefreshControl'].map(n => [n,n])), StyleSheet: { create: x => x }, Platform: { OS: 'android' }, Alert: { alert() {} }, Dimensions: { get: () => ({ width: 400 }) } },
    '../contexts/ThemeContext': { useTheme: () => ({ theme: { colors: {}, fontSize: {}, spacing: {}, borderRadius: {} } }) },
    '../contexts/AppStateContext': { useAppState: () => ({ state }) },
    '../contexts/ToastContext': { useToast: () => ({}) },
    '../utils/haptics': { hapticLight() {}, hapticSelection() {}, hapticSuccess() {}, hapticError() {} },
    '../utils/dateHelpers': date, '../utils/storage': storage, '../navigation/transactionEntry': entry,
    '../utils/money': { parseMoneyInput: Number, getMoneyInputError: () => null },
    '../utils/duplicateDetection': { checkForDuplicates: () => null },
    '../components/TransactionTemplatesSection': 'Templates',
    '@react-native-community/datetimepicker': 'DatePicker', 'react-native-calendars': { Calendar: 'Calendar' },
  };
}
function tabs() {
  const h = host(), m = mocks(h);
  m['@react-navigation/bottom-tabs'] = m['@react-navigation/native-stack'] = { createBottomTabNavigator: () => ({ Navigator: 'Navigator', Screen: 'Screen' }), createNativeStackNavigator: () => ({ Navigator: 'Navigator', Screen: 'Screen' }) };
  m['../contexts/LayoutContext'] = { useLayout: () => ({ layout: { tabs: ['summary','calendar','add','transactions','more'].map(id => ({ id, visible: id === 'more' || id === 'add' })) } }) };
  for (const n of ['Summary','Calendar','Transactions','TransactionForm','Buckets']) m[`../screens/${n}Screen`] = n;
  m['./MoreStack'] = 'More'; m['./transactionEntry'] = entry;
  return nodes(load('mobile/src/navigation/MainTabs.tsx', m).default(), n => n.type === 'Screen');
}
function stack(screenNodes, initialRouteName) {
  const router = StackRouter({ initialRouteName });
  const opts = { routeNames: screenNodes.map(n => n.props.name), routeParamList: {}, routeGetIdList: Object.fromEntries(screenNodes.map(n => [n.props.name, n.props.getId])) };
  let state = router.getInitialState(opts);
  return { get state() { return state; }, apply(action) { const next = router.getStateForAction(state, action, opts); assert.ok(next, 'router handles action'); state = next; return state.routes[state.index]; } };
}
function pressTab(tab) { let call; let prevented = false; tab.props.listeners({ navigation: { navigate: (...args) => { call = args; } } }).tabPress({ preventDefault() { prevented = true; } }); assert.equal(prevented, true); return call; }
function nestedAction(params) { return CommonActions.navigate(params.screen, params.params, { pop: params.pop }); }

test('actual Add handler plus installed router creates a fresh editor after editing; bucket Back preserves its route', () => {
  const all = tabs();
  const tx = all.find(n => n.props.name === 'TransactionsTab');
  assert.equal(tx.props.options.tabBarItemStyle.display, 'none');
  const s = stack(nodes(tx.props.component(), n => n.type === 'Screen'), 'TransactionsList');
  const editing = s.apply(CommonActions.navigate('TransactionForm', entry.transactionEntry({ transaction: { id: 'old' } })));
  const add = pressTab(all.find(n => n.props.name === 'AddTab'));
  assert.equal(add[0], 'TransactionsTab'); assert.equal(add[1].initial, false);
  const fresh = s.apply(nestedAction(add[1]));
  assert.notEqual(fresh.key, editing.key); assert.equal(fresh.params.transaction, undefined);
  s.apply(StackActions.push('TransactionBuckets', { returnToTransaction: true }));
  const returned = s.apply(CommonActions.goBack());
  assert.equal(returned.key, fresh.key); assert.equal(returned.params.entryId, fresh.params.entryId);
  const listCall = pressTab(tx); s.apply(nestedAction(listCall[1]));
  assert.equal(s.state.routes.length, 1); assert.equal(s.state.routes[0].name, 'TransactionsList');
});

test('same template invoked twice gets separate editors in both installed stack configurations', () => {
  for (const name of ['TransactionsTab', 'CalendarTab']) {
    const tab = tabs().find(n => n.props.name === name);
    const screens = nodes(tab.props.component(), n => n.type === 'Screen');
    const s = stack(screens, screens[0].props.name);
    const template = { id: 'same', type: 'income', amount: 1.23, description: 'Template' };
    const a = s.apply(CommonActions.navigate('TransactionForm', entry.transactionEntry({ template })));
    const b = s.apply(CommonActions.navigate('TransactionForm', entry.transactionEntry({ template })));
    assert.notEqual(a.key, b.key); assert.notEqual(a.params.entryId, b.params.entryId);
    assert.equal(b.params.template, template);
  }
});

test('actual More tab press pops a populated More stack to its hub without duplicating it', () => {
  const m = mocks(host()); m['@react-navigation/native-stack'] = { createNativeStackNavigator: () => ({ Navigator: 'Navigator', Screen: 'Screen' }) };
  for (const n of ['More','Settings','Buckets','Budgets','Recurring','Reflections','Backup','Templates']) m[`../screens/${n}Screen`] = n;
  const tree = load('mobile/src/navigation/MoreStack.tsx', m).default();
  const s = stack(nodes(tree, n => n.type === 'Screen'), tree.props.initialRouteName);
  s.apply(CommonActions.navigate('Templates')); s.apply(CommonActions.navigate('Settings'));
  const call = pressTab(tabs().find(n => n.props.name === 'MoreTab'));
  assert.equal(call[1].initial, false); s.apply(nestedAction(call[1]));
  assert.equal(s.state.routes.length, 1); assert.equal(s.state.routes[0].name, 'MoreHome');
  s.apply(nestedAction(call[1])); assert.equal(s.state.routes.length, 1);
});

test('calendar selected day reaches a fresh editor with that date; editing keeps its original date', () => {
  const h = host(), routes = [], selectedDate = '2024-02-29';
  const component = load('mobile/src/screens/CalendarScreen.tsx', mocks(h)).default;
  const render = () => h.render(() => component({ navigation: { navigate: (...args) => routes.push(args) } }));
  let tree = render(); nodes(tree, n => n.type === 'Calendar')[0].props.onDayPress({ dateString: selectedDate }); tree = render();
  button(tree, '+ Add on this day').props.onPress();
  assert.equal(routes[0][0], 'TransactionForm'); assert.equal(routes[0][1].initialDate, selectedDate); assert.ok(routes[0][1].entryId);
  for (const [params, expected] of [[routes[0][1], selectedDate], [{ ...routes[0][1], transaction: { id: 'edit', type: 'income', amount: 1, description: 'Edited', date: '2023-12-31' } }, '2023-12-31']]) {
    const formHost = host(); const form = load('mobile/src/screens/TransactionFormScreen.tsx', mocks(formHost)).default;
    const formTree = formHost.render(() => form({ route: { params }, navigation: {} }));
    assert.ok(nodes(formTree, n => n.type === 'Text' && n.props.children.includes(date.formatDate(expected))).length, `visible editor date ${expected}`);
  }
});

test('first-bucket detour handler pushes setup without starting a new editor or clearing its draft', () => {
  const h = host(), routes = []; const form = load('mobile/src/screens/TransactionFormScreen.tsx', mocks(h)).default;
  const render = () => h.render(() => form({ route: { params: entry.transactionEntry() }, navigation: { push: (...args) => routes.push(args) } }));
  let tree = render(); nodes(tree, n => n.type === 'TextInput' && n.props.placeholder === 'What was this for?')[0].props.onChangeText('Keep this draft');
  tree = render(); button(tree, 'Create bucket').props.onPress();
  assert.equal(JSON.stringify(routes), JSON.stringify([['TransactionBuckets', { returnToTransaction: true }]]));
  assert.equal(nodes(render(), n => n.type === 'TextInput' && n.props.placeholder === 'What was this for?')[0].props.value, 'Keep this draft');
});

test('dashboard empty and populated budget actions and notes expose direct destinations with a Back root', () => {
  for (const hasBudget of [false, true]) {
    const h = host(), calls = [], now = new Date();
    const state = { transactions: [], buckets: [], budgets: hasBudget ? [{ id: 'b', period: 'monthly', month: now.getMonth()+1, year: now.getFullYear(), amount: 10 }] : [] };
    const m = mocks(h, state);
    m['react-native-gifted-charts'] = { BarChart: 'BarChart', PieChart: 'PieChart', LineChart: 'LineChart' };
    m['../contexts/LayoutContext'] = { useLayout: () => ({ layout: { dashboardSections: [{ id: 'budgetStatus', visible: true }, { id: 'summaryNotes', visible: true }] } }) };
    m['../utils/analytics'] = { calculateSpendingTrends: () => [], calculateCategoryAverages: () => [] };
    const component = load('mobile/src/screens/SummaryScreen.tsx', m).default;
    const tree = h.render(() => component({ navigation: { navigate: (...args) => calls.push(args) } }));
    button(tree, hasBudget ? 'Manage budgets' : 'Set up a budget').props.onPress(); button(tree, 'Open reflections').props.onPress();
    assert.equal(JSON.stringify(calls), JSON.stringify([['MoreTab', { screen: 'Budgets', initial: false }], ['MoreTab', { screen: 'Reflections', initial: false }]]));
  }
});
