import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

const react = { createElement: (type, props, ...children) => ({ type, props: { ...props, children: children.flat(Infinity) } }) };
const theme = { colors: {}, fontSize: {}, spacing: {}, borderRadius: {} };
const baseMocks = {
  react,
  'react-native': { ScrollView: 'ScrollView', View: 'View', Text: 'Text', TouchableOpacity: 'TouchableOpacity', StyleSheet: { create: value => value, hairlineWidth: 1 } },
  '../contexts/ThemeContext': { useTheme: () => ({ theme }) },
  '../utils/haptics': { hapticSelection() {} },
};
function load(path, mocks) {
  const exports = {};
  runInNewContext(ts.transpileModule(readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true } }).outputText, {
    exports, require(name) { if (!(name in mocks)) throw new Error(`Missing mock ${name}`); return mocks[name]; },
  });
  return exports.default;
}
function nodes(tree, predicate) {
  if (!tree || typeof tree !== 'object') return [];
  return [...(predicate(tree) ? [tree] : []), ...(tree.props?.children ?? []).flatMap(child => nodes(child, predicate))];
}
function setup() {
  const routes = [];
  const screen = load('mobile/src/screens/MoreScreen.tsx', baseMocks);
  const tree = screen({ navigation: { navigate: (...args) => routes.push(args) } });
  const buttons = nodes(tree, n => n.type === 'TouchableOpacity');
  return { screen, tree, routes, buttons };
}

test('actual More hub buttons reach every existing tool including Templates and nested list roots', () => {
  const h = setup();
  const expected = [
    ['Transaction Templates', ['Templates']], ['Buckets', ['Buckets']], ['Budgets', ['Budgets']],
    ['Recurring Transactions', ['Recurring']], ['Transactions', ['TransactionsTab', { screen: 'TransactionsList', pop: true }]],
    ['Calendar', ['CalendarTab', { screen: 'CalendarView', pop: true }]], ['Reflections', ['Reflections']],
    ['Backup & Restore', ['Backup']], ['Settings', ['Settings']],
  ];
  assert.equal(h.buttons.length, expected.length);
  for (const [label, target] of expected) {
    const button = h.buttons.find(n => n.props.accessibilityLabel === label);
    assert.ok(button, label);
    button.props.onPress();
    assert.equal(JSON.stringify(h.routes.at(-1)), JSON.stringify(target), label);
    assert.equal(button.props.accessibilityRole, 'button');
    assert.ok(button.props.accessibilityHint.length > 10);
    assert.ok(button.props.style[0].minHeight >= 48);
  }
});

test('More navigator opens hub first and registers every local menu destination without breaking existing route names', () => {
  const h = setup();
  const mocks = { ...baseMocks, '@react-navigation/native-stack': { createNativeStackNavigator: () => ({ Navigator: 'Navigator', Screen: 'Screen' }) } };
  for (const name of ['Settings', 'Buckets', 'Budgets', 'Recurring', 'Reflections', 'Backup', 'Templates']) mocks[`../screens/${name}Screen`] = () => null;
  mocks['../screens/MoreScreen'] = h.screen;
  const tree = load('mobile/src/navigation/MoreStack.tsx', mocks)();
  assert.equal(tree.props.initialRouteName, 'MoreHome');
  const screens = nodes(tree, n => n.type === 'Screen');
  assert.equal(screens[0].props.name, 'MoreHome');
  assert.equal(screens[0].props.component, h.screen);
  const names = screens.map(n => n.props.name);
  for (const button of h.buttons) {
    button.props.onPress();
    const target = h.routes.at(-1);
    if (target.length === 1) assert.ok(names.includes(target[0]), target[0]);
  }
  assert.equal(new Set(names).size, names.length);
});
