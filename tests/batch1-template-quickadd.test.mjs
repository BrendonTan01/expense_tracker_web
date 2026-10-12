import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

const tick = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
function hookHost() {
  const slots = [], cleanups = []; let cursor = 0, effects = [], writesAfterUnmount = 0, mounted = true;
  const react = {
    createElement: (type, props, ...children) => ({ type, props: { ...props, children: children.flat(Infinity) } }),
    useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = initial; return [slots[i], value => { if (!mounted) writesAfterUnmount++; slots[i] = typeof value === 'function' ? value(slots[i]) : value; }]; },
    useRef(initial) { const [ref] = react.useState({ current: initial }); return ref; },
    useEffect(fn, deps) { const i = cursor++; if (!slots[i] || deps.some((x, j) => !Object.is(x, slots[i][j]))) { slots[i] = deps; effects.push(() => { cleanups[i]?.(); cleanups[i] = fn(); }); } },
  };
  return { react, render(fn) { cursor = 0; return fn(); }, flush() { effects.splice(0).forEach(fn => fn()); }, unmount() { cleanups.forEach(fn => fn?.()); mounted = false; }, get writesAfterUnmount() { return writesAfterUnmount; } };
}
function load(path, mocks) {
  const exports = {};
  runInNewContext(ts.transpileModule(readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true } }).outputText, {
    exports, require: name => { if (!(name in mocks)) throw new Error(`Missing mock ${name}`); return mocks[name]; }, console,
  });
  return exports;
}
function harness({ user = { id: 'A' }, read = async () => null } = {}) {
  const host = hookHost(), calls = [], routes = [], used = [];
  const state = { user, focused: true };
  const asyncStorage = { getItem: key => { calls.push(key); return read(key); } };
  const storage = load('mobile/src/utils/storage.ts', { '@react-native-async-storage/async-storage': asyncStorage, './environment': { ENV_STORAGE_PREFIX: 'staging-test/' } });
  const keys = load('mobile/src/utils/templateStorage.ts', {});
  const mocks = {
    react: host.react,
    'react-native': { View: 'View', Text: 'Text', ScrollView: 'ScrollView', TouchableOpacity: 'TouchableOpacity', StyleSheet: { create: value => value }, Alert: { alert() {} }, Platform: { OS: 'android' } },
    '@react-navigation/native': { useIsFocused: () => state.focused, useNavigation: () => ({ navigate: (...args) => routes.push(args) }) },
    '../contexts/ThemeContext': { useTheme: () => ({ theme: { spacing: {}, colors: {}, fontSize: {}, borderRadius: {} } }) },
    '../contexts/AuthContext': { useAuth: () => ({ user: state.user }) },
    '../contexts/AppStateContext': { useAppState: () => ({ state: { buckets: [] } }) },
    '../navigation/transactionEntry': load('mobile/src/navigation/transactionEntry.ts', { '../utils/storage': storage }),
    '../utils/storage': storage, '../utils/templateStorage': keys,
    '../utils/haptics': { hapticSelection() {} }, '../utils/dateHelpers': { formatCurrency: String },
    '../utils/money': { getMoneyInputError: () => null }, '@react-native-async-storage/async-storage': asyncStorage,
  };
  const component = load('mobile/src/components/TransactionTemplatesSection.tsx', mocks).default;
  const manager = load('mobile/src/screens/TemplatesScreen.tsx', mocks).default;
  const outer = () => component({ buckets: [], onUseTemplate: value => used.push(value) });
  return { host, state, calls, routes, used, outer, manager, render() { const element = outer(); return element ? host.render(() => element.type(element.props)) : null; } };
}
function nodes(tree, predicate) { return !tree || typeof tree !== 'object' ? [] : [...(predicate(tree) ? [tree] : []), ...(tree.props?.children ?? []).flatMap(child => nodes(child, predicate))]; }
function button(tree, text) { return nodes(tree, n => n.type === 'TouchableOpacity' && nodes(n, t => t.type === 'Text' && t.props.children.includes(text)).length)[0]; }
const template = name => ({ id: name, name, type: 'income', description: `${name} description`, amount: 1.23, tags: [], notes: '' });

test('actual quick-add and manager read the same environment/account key; legacy values never load', async () => {
  const a = template('A template');
  const read = async key => JSON.stringify(key.endsWith(':user:A') ? [a] : [template('Legacy private')]);
  const h = harness({ read });
  h.render(); h.host.flush(); await tick(); const tree = h.render();
  button(tree, 'A template').props.onPress(); assert.equal(h.used[0].id, a.id);
  assert.equal(button(tree, 'Legacy private'), undefined);
  const manager = harness({ read }); const outer = manager.manager({ navigation: {} });
  manager.host.render(() => outer.type(outer.props)); manager.host.flush(); await tick();
  assert.deepEqual(h.calls, ['@expense_tracker/staging-test/transaction_templates:user:A']);
  assert.deepEqual(manager.calls, h.calls);
});

test('account change replaces the subtree; delayed A cannot populate B or write after unmount', async () => {
  const pending = deferred(); const a = harness({ read: () => pending.promise });
  assert.equal(a.outer().props.key, 'A'); a.render(); a.host.flush();
  a.state.user = { id: 'B' }; assert.equal(a.outer().props.key, 'B');
  a.host.unmount();
  const b = harness({ user: { id: 'B' }, read: async () => JSON.stringify([template('B template')]) });
  b.render(); b.host.flush(); await tick();
  pending.resolve(JSON.stringify([template('A private')])); await tick();
  assert.ok(button(b.render(), 'B template')); assert.equal(button(b.render(), 'A private'), undefined);
  assert.equal(a.host.writesAfterUnmount, 0);
  assert.deepEqual(b.calls, ['@expense_tracker/staging-test/transaction_templates:user:B']);
});

test('blur cancels an old read; refocus reloads new templates without old result overriding it', async () => {
  const pending = deferred(); let count = 0;
  const h = harness({ read: () => ++count === 1 ? pending.promise : Promise.resolve(JSON.stringify([template('Updated')])) });
  h.render(); h.host.flush(); h.state.focused = false; h.render(); h.host.flush();
  h.state.focused = true; h.render(); h.host.flush(); await tick();
  pending.resolve(JSON.stringify([template('Old')])); await tick();
  assert.ok(button(h.render(), 'Updated')); assert.equal(button(h.render(), 'Old'), undefined);
});

test('signed-out quick add returns null without reading storage', () => {
  const h = harness({ user: null }); assert.equal(h.render(), null); h.host.flush(); assert.deepEqual(h.calls, []);
});

test('empty and malformed storage remain usable; Manage and first-template both navigate to the registered manager', async () => {
  for (const stored of [null, '{}', '{bad json']) {
    const h = harness({ read: async () => stored }); h.render(); h.host.flush(); await tick(); const tree = h.render();
    button(tree, 'Manage').props.onPress(); button(tree, '+ Create your first template').props.onPress();
    assert.equal(JSON.stringify(h.routes), JSON.stringify([['MoreTab', { screen: 'Templates', initial: false }], ['MoreTab', { screen: 'Templates', initial: false }]]));
  }
});

test('actual template manager Use opens distinct fresh editors for repeat use and retains a list Back root', async () => {
  const saved = template('Repeat'); const h = harness({ read: async () => JSON.stringify([saved]) });
  const outer = h.manager({ navigation: { navigate: (...args) => h.routes.push(args) } });
  const render = () => h.host.render(() => outer.type(outer.props));
  render(); h.host.flush(); await tick();
  button(render(), 'Use').props.onPress(); button(render(), 'Use').props.onPress();
  for (const [tab, params] of h.routes) {
    assert.equal(tab, 'TransactionsTab'); assert.equal(params.screen, 'TransactionForm');
    assert.equal(params.initial, false); assert.equal(params.params.template.id, saved.id);
    assert.ok(params.params.entryId); assert.equal(params.params.transaction, undefined);
  }
  assert.notEqual(h.routes[0][1].params.entryId, h.routes[1][1].params.entryId);
});
