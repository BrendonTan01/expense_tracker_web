import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

for (const path of ['src/utils/money.ts', 'mobile/src/utils/money.ts']) {
  const source = readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2022 } });
  const { parseMoneyInput, getMoneyInputError } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);

  test(`${path}: accepts cents and ordinary whole amounts without rounding`, () => {
    for (const [input, expected] of [['0.01', 0.01], ['.01', 0.01], ['1', 1], ['1.2', 1.2], ['1.23', 1.23], ['001.20', 1.2], [' 12.34 ', 12.34], ['9999999999.99', 9999999999.99]]) {
      assert.equal(parseMoneyInput(input), expected, input);
    }
  });
  test(`${path}: rejects fractional cents, incomplete input and non-decimal representations`, () => {
    for (const input of ['0.001', '1.234', '1.000', '0', '0.00', '-1', '+1', '1.', '.', '', ' ', '1x', '1.2.3', '1e2', '1,000', 'NaN', 'Infinity', '0x10', '10000000000', '9999999999.999', '9'.repeat(400)]) {
      assert.equal(parseMoneyInput(input), null, input);
    }
  });
  test(`${path}: every cent survives representative decimal input conversion`, () => {
    for (const whole of [0, 1, 29, 9999999999]) {
      for (let fraction = 0; fraction < 100; fraction++) {
        const input = `${whole}.${String(fraction).padStart(2, '0')}`;
        const result = parseMoneyInput(input);
        if (whole === 0 && fraction === 0) assert.equal(result, null);
        else assert.equal(Math.round(result * 100), whole * 100 + fraction, input);
      }
    }
  });
  test(`${path}: inline feedback reacts to typing, blur, correction and optional blanks`, () => {
    assert.equal(getMoneyInputError('', false), null, 'fresh required field stays quiet');
    assert.equal(typeof getMoneyInputError('', true), 'string', 'blur or save exposes a missing required amount');
    for (const input of ['0.001', '1.234', '1.000', '-1', '0', '1e2', '-', '.', '1e']) {
      assert.equal(typeof getMoneyInputError(input, false), 'string', `invalid typing: ${input}`);
    }
    for (const touched of [false, true]) {
      assert.equal(getMoneyInputError('12.34', touched), null, 'correction clears warning');
      assert.equal(getMoneyInputError('', touched, true), null, 'templates allow blank amounts');
      assert.equal(getMoneyInputError('   ', touched, true), null, 'optional whitespace is blank');
      assert.equal(typeof getMoneyInputError('0.001', touched, true), 'string', 'optional values still require cents');
    }
    assert.match(getMoneyInputError('10000000000', false), /10 billion/);
  });

}
