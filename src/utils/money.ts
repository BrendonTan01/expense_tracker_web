/** Maximum supported amount; cents remain safely representable as integers. */
export const MAX_MONEY_AMOUNT = 9999999999.99;
export const MONEY_INPUT_ERROR = 'Enter an amount from 0.01 to 9,999,999,999.99 with no more than 2 decimal places.';

/** Validate the entire input before converting. Never silently round money. */
export function parseMoneyInput(input: string): number | null {
  const text = input.trim();
  if (!/^(?:\d+(?:\.\d{1,2})?|\.\d{1,2})$/.test(text)) return null;
  const [whole, fraction = ''] = text.split('.');
  const cents = Number(whole || '0') * 100 + Number(fraction.padEnd(2, '0'));
  if (!Number.isSafeInteger(cents) || cents <= 0 || cents > 999999999999) return null;
  return cents / 100;
}

/** Show malformed nonempty input immediately; required blanks after blur/save. */
export function getMoneyInputError(input: string, touched = false, optional = false): string | null {
  if (!input.trim()) return optional || !touched ? null : 'Use 0.01 or more, with up to 2 decimal places.';
  if (parseMoneyInput(input) !== null) return null;
  return Number(input) > MAX_MONEY_AMOUNT
    ? 'Amount must be less than 10 billion.'
    : 'Use 0.01 or more, with up to 2 decimal places.';
}
