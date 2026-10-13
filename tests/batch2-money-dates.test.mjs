import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';

function modules(root, fixedNow = '2024-01-15T12:00:00Z') {
  const cache = new Map();
  const RealDate = Date;
  class Clock extends RealDate { constructor(...args) { super(...(args.length ? args : [fixedNow])); } static now() { return +new RealDate(fixedNow); } }
  const load = file => {
    file = path.resolve(file);
    if (cache.has(file)) return cache.get(file).exports;
    const module = { exports: {} }; cache.set(file, module);
    const source = ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    vm.runInNewContext(source, { module, exports: module.exports, Date: Clock, console, require: id => load(path.resolve(path.dirname(file), id + '.ts')) }, { filename: file });
    return module.exports;
  };
  return { load, money: load(`${root}/utils/money.ts`), dates: load(`${root}/utils/dateHelpers.ts`), analytics: load(`${root}/utils/analytics.ts`), duplicate: load(`${root}/utils/duplicateDetection.ts`), Clock };
}
const transaction = (amount, date, type = 'expense', id = 't') => ({ id, type, amount, date, description: 'Coffee', bucketId: 'food' });

for (const root of ['src', 'mobile/src']) {
  const { money } = modules(root);
  test(`${root}: exact cents, signed differences, repeated cents and large totals`, () => {
    assert.equal(money.addMoney(0.1, 0.2), 0.3);
    assert.equal(money.subtractMoney(0.3, 0.1, 0.2), 0);
    assert.equal(money.addMoney(-0.1, -0.2), -0.3);
    assert.equal(Array(10000).fill(0.01).reduce((sum, amount) => money.addMoney(sum, amount), 0), 100);
    assert.equal(money.addMoney(9999999999.99, 0.01), 10000000000);
    assert.equal(money.addMoney(999999999999.98, 0.01), 999999999999.99);
    assert.equal(money.parseMoneyInput('9999999999.99'), 9999999999.99);
    assert.equal(money.parseMoneyInput('0.001'), null);
    assert.equal(money.parseMoneyInput('-0.01'), null); // Refund entry is not supported.
  });
  test(`${root}: malformed amounts and unsafe aggregates fail explicitly`, () => {
    for (const invalid of [NaN, Infinity, -Infinity, 0.001, 1.000000000001, 1000000000000]) {
      assert.throws(() => money.addMoney(invalid), { name: 'RangeError' });
    }
    assert.throws(() => money.addMoney(999999999999.99, 0.01), { name: 'RangeError' });
    assert.throws(() => money.subtractMoney(-999999999999.99, 0.01), { name: 'RangeError' });
  });
  for (const zone of ['Australia/Sydney', 'America/New_York', 'UTC']) {
    test(`${root}: calendar periods, leap day, DST and budgets agree in ${zone}`, () => {
      const prior = process.env.TZ; process.env.TZ = zone;
      try {
        const { money, dates, analytics, duplicate } = modules(root);
        const rows = [transaction(0.1, '2024-01-01'), transaction(0.2, '2024-01-31'), transaction(0.5, '2023-12-31'), transaction(0.3, '2024-01-01', 'income')];
        const result = analytics.comparePeriods(rows, dates.parseIsoDateLocal('2024-01-01'), dates.parseIsoDateLocal('2024-01-31'), dates.parseIsoDateLocal('2023-12-01'), dates.parseIsoDateLocal('2023-12-31'));
        assert.equal(result.current.expenses, 0.3); assert.equal(result.current.balance, 0);
        assert.equal(result.previous.expenses, 0.5); assert.equal(result.change.expenses, -0.2);
        assert.equal(result.current.expenses > 0.3, false);
        const trends = analytics.calculateSpendingTrends(rows, 2);
        assert.equal(trends[0].period, '2023-12'); assert.equal(trends[1].period, '2024-01');
        assert.equal(trends[1].expenses, 0.3); assert.equal(trends[1].balance, 0);
        const categories = analytics.calculateCategoryAverages(rows, [{ id: 'food', name: 'Food' }]);
        assert.equal(categories[0].total, 0.8);
        const compare = analytics.compareCategorySpending(rows, [], dates.parseIsoDateLocal('2024-01-01'), dates.parseIsoDateLocal('2024-01-31'), dates.parseIsoDateLocal('2023-12-01'), dates.parseIsoDateLocal('2023-12-31'));
        assert.equal(compare[0].currentPeriod, 0.3); assert.equal(compare[0].changeAmount, -0.2);
        assert.equal(dates.formatIsoDateLocal(dates.parseIsoDateLocal('2024-01-01')), '2024-01-01');
        assert.equal(dates.addDaysIsoLocal('2024-02-28', 1), '2024-02-29');
        assert.equal(dates.addDaysIsoLocal('2024-02-29', 1), '2024-03-01');
        for (const day of ['2024-03-10', '2024-11-03', '2024-04-07', '2024-10-06']) {
          assert.equal(dates.calendarDayNumber(dates.addDaysIsoLocal(day, 1)) - dates.calendarDayNumber(day), 1);
        }
        assert.equal(dates.isIsoDate('2023-02-29'), false); assert.equal(dates.isIsoDate('2024-02-30'), false);
        assert.equal(dates.normalizeIsoDate('2024-13-01'), undefined);
        assert.equal(dates.formatDate('2024-02-30'), 'Invalid date');
        assert.equal(Number.isNaN(+dates.parseIsoDateLocal('2024-02-30')), true);
        assert.equal(dates.formatIsoDateLocal(dates.parseIsoDateLocal('0001-01-01')), '0001-01-01');
        // Adjacent date-only records remain exactly one calendar day apart after DST fall-back.
        const adjacent = duplicate.checkForDuplicates(transaction(0.3, '2024-11-04'), [transaction(0.3, '2024-11-03')]);
        assert.equal(adjacent.isDuplicate, true);
        assert.equal(duplicate.checkForDuplicates(transaction(0.3, '2024-11-04'), [transaction(0.31, '2024-11-04')]).isDuplicate, false);
        assert.equal(duplicate.checkForDuplicates(transaction(0.3, '2024-11-04'), [transaction(0.001, '2024-11-04')]).isDuplicate, false);
        assert.equal(money.addMoney(...rows.filter(t => t.date.startsWith('2024-01') && t.type === 'expense').map(t => t.amount)), result.current.expenses);
      } finally { if (prior === undefined) delete process.env.TZ; else process.env.TZ = prior; }
    });
  }
  test(`${root}: local today uses the device calendar, not the UTC date`, () => {
    const prior = process.env.TZ;
    try {
      process.env.TZ = 'Australia/Sydney';
      assert.equal(modules(root, '2024-01-01T13:30:00Z').dates.todayIsoLocal(), '2024-01-02');
      process.env.TZ = 'America/New_York';
      assert.equal(modules(root, '2024-01-01T02:30:00Z').dates.todayIsoLocal(), '2023-12-31');
    } finally { if (prior === undefined) delete process.env.TZ; else process.env.TZ = prior; }
  });
}

// Exercise the actual mobile dashboard/budget/reflection computation bodies.
function functionsFromScreen(file, start, end, globals, exports) {
  const original = readFileSync(file, 'utf8');
  let source = original.slice(original.indexOf(start), original.indexOf(end));
  source += `\nmodule.exports = {${exports}};`;
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(js, { module, ...globals });
  return module.exports;
}
test('actual dashboard, reflection and budget formulas use the same cent totals at January boundary', () => {
  const prior = process.env.TZ; process.env.TZ = 'America/New_York';
  try {
    const { money, dates, Clock } = modules('mobile/src');
    const transactions = [transaction(0.1, '2024-01-01'), transaction(0.2, '2024-01-31'), transaction(0.3, '2024-01-01', 'income'), transaction(5, '2023-12-31')];
    const summary = functionsFromScreen('mobile/src/screens/SummaryScreen.tsx', 'function getDateRange', 'function SummaryScreen', { ...money, ...dates, Date: Clock }, 'getDateRange, filterTransactions, computeTotals, computeSavingsScore');
    const january = summary.getDateRange('thisMonth');
    const totals = summary.computeTotals(summary.filterTransactions(transactions, january.start, january.end));
    assert.equal(totals.expenses, 0.3); assert.equal(totals.net, 0); assert.equal(totals.savingPct, 0);
    const budgets = [{ bucketId: 'food', period: 'monthly', year: 2024, month: 1, amount: 0.3 }];
    const scoreAtLimit = summary.computeSavingsScore(transactions, budgets, []);
    const scoreBelowLimit = summary.computeSavingsScore(transactions, [{ ...budgets[0], amount: 0.29 }], []);
    assert.equal(scoreAtLimit - scoreBelowLimit, 10);
    const budget = functionsFromScreen('mobile/src/screens/BudgetsScreen.tsx', '  const getSpent', '  const monthNames', { ...money, ...dates, state: { transactions } }, 'getSpent');
    assert.equal(budget.getSpent('food', 'monthly', 2024, 1), 0.3);
    const reflection = functionsFromScreen('mobile/src/screens/ReflectionsScreen.tsx', '  const getYearTotals', '  const handleSaveSummary', { ...money, ...dates, state: { transactions } }, 'getYearTotals, getMonthTotals');
    assert.equal(reflection.getYearTotals(2024).expenses, 0.3);
    assert.equal(reflection.getMonthTotals(2024, 1).expenses, 0.3);
  } finally { if (prior === undefined) delete process.env.TZ; else process.env.TZ = prior; }
});

test('actual mobile boundary hides failed calculations, permits retry and scopes recovery by account/route', () => {
  class Component { constructor(props) { this.props = props; } setState(state) { this.state = state; } }
  let account = 'a';
  const React = { Component, createElement: (type, props, ...children) => ({ type, props: { ...props, children } }) };
  const module = { exports: {} };
  const source = ts.transpileModule(readFileSync('mobile/src/components/FinancialErrorBoundary.tsx', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true } }).outputText;
  vm.runInNewContext(source, { module, exports: module.exports, require: id => id === 'react' ? React : id === 'react-native' ? { Text: 'Text', View: 'View', TouchableOpacity: 'Button' } : id.endsWith('AuthContext') ? { useAuth: () => ({ user: { id: account } }) } : { useTheme: () => ({ theme: { colors: {}, spacing: {}, fontSize: {}, borderRadius: {} } }) } });
  const { FinancialErrorBoundary, withFinancialErrorBoundary } = module.exports;
  let retried = false;
  const boundary = new FinancialErrorBoundary({ children: 'Totals', fallback: retry => { retried = retry; return 'Error'; } });
  assert.equal(boundary.render(), 'Totals');
  boundary.state = FinancialErrorBoundary.getDerivedStateFromError(new RangeError('unsafe total'));
  assert.equal(boundary.render(), 'Error'); retried(); assert.equal(boundary.render(), 'Totals');
  const wrapped = withFinancialErrorBoundary(() => null);
  assert.equal(wrapped({ route: { key: 'summary' } }).props.key, 'a:summary'); account = 'b';
  assert.equal(wrapped({ route: { key: 'summary' } }).props.key, 'b:summary');
});
