import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import ts from 'typescript';

for (const file of ['src/utils/dateHelpers.ts', 'mobile/src/utils/dateHelpers.ts']) {
  const { outputText } = ts.transpileModule(readFileSync(new URL(`../${file}`, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.ES2022 } });
  const url = `data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`;
  const dates = await import(url);
  test(`${file}: month-end stays anchored and clamps February`, () => {
    assert.deepEqual(dates.getOccurrenceDatesUpTo('monthly', '2024-01-31', undefined, undefined, '2024-05-31'), ['2024-01-31', '2024-02-29', '2024-03-31', '2024-04-30', '2024-05-31']);
    assert.equal(dates.getNextOccurrence('monthly', '2025-01-31', '2025-01-31'), '2025-02-28');
    assert.equal(dates.getNextOccurrence('monthly', '2025-01-31', '2025-02-10'), '2025-02-28');
    assert.equal(dates.getNextOccurrence('monthly', '2025-01-31', '2025-12-31'), '2026-01-31');
  });
  test(`${file}: leap anniversary clamps and returns to Feb 29`, () => {
    assert.deepEqual(dates.getOccurrenceDatesUpTo('yearly', '2024-02-29', undefined, undefined, '2028-02-29'), ['2024-02-29', '2025-02-28', '2026-02-28', '2027-02-28', '2028-02-29']);
    assert.equal(dates.getNextOccurrence('yearly', '2024-02-29', '2026-01-01'), '2026-02-28');
  });
  test(`${file}: initial, bounded catch-up and arbitrary progress dates`, () => {
    assert.equal(dates.getNextOccurrence('monthly', '2025-01-31'), '2025-01-31');
    assert.equal(dates.getNextOccurrence('weekly', '2025-01-01', '2025-01-02'), '2025-01-08');
    assert.equal(dates.getNextOccurrence('weekly', '2025-01-01', '2024-12-20'), '2025-01-01');
    assert.equal(dates.shouldGenerateTransaction('monthly', '2020-01-31', '2020-03-31', '2020-02-29'), true);
    assert.equal(dates.shouldGenerateTransaction('monthly', '2020-01-31', '2020-03-31', '2020-03-31'), false);
    assert.equal(dates.shouldGenerateTransaction('monthly', '2020-01-31', '2020-01-01', undefined), false);
    assert.deepEqual(dates.getOccurrenceDatesUpTo('monthly', '2020-01-31', '2020-03-31', '2020-02-29', '2021-01-01'), ['2020-03-31']);
  });
  for (const timezone of ['Australia/Sydney', 'America/New_York']) {
    test(`${file}: calendar recurrences across DST in ${timezone}`, () => {
      const code = `
        import assert from 'node:assert/strict';
        const dates = await import(${JSON.stringify(url)});
        const cases = ${JSON.stringify(timezone === 'Australia/Sydney'
          ? [['2025-10-04', '2025-10-06', '2025-10-07'], ['2025-04-05', '2025-04-07', '2025-04-08']]
          : [['2025-03-08', '2025-03-10', '2025-03-11'], ['2025-11-01', '2025-11-03', '2025-11-04']])};
        for (const [start, from, to] of cases) {
          assert.deepEqual(dates.getOccurrenceDatesBetween('daily', start, undefined, from, to), [from, to]);
          for (const frequency of ['weekly', 'fortnightly']) {
            const step = frequency === 'weekly' ? 7 : 14;
            const last = dates.addDaysIsoLocal(start, step);
            const after = dates.addDaysIsoLocal(last, 1);
            const next = dates.addDaysIsoLocal(last, step);
            assert.deepEqual(dates.getOccurrenceDatesBetween(frequency, start, undefined, after, next), [next]);
          }
        }
      `;
      const result = spawnSync(process.execPath, ['--input-type=module', '-e', code], { env: { ...process.env, TZ: timezone }, encoding: 'utf8' });
      assert.equal(result.status, 0, result.stderr);
    });
  }
}
