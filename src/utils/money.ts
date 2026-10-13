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

/** Aggregate cap preserves cent precision when exposed as legacy dollar numbers. */
export const MAX_TOTAL_CENTS = 99999999999999;

/** Convert valid signed, cent-denominated money without accepting extra precision. */
export function moneyToCents(amount: number): number {
  if (!Number.isFinite(amount)) throw new RangeError('Money must be finite.');
  const scaled = amount * 100;
  const cents = Math.round(scaled);
  // Binary representations of decimal cents have tiny multiplication noise.
  if (!Number.isSafeInteger(cents) || Math.abs(cents) > MAX_TOTAL_CENTS ||
      cents / 100 !== amount) {
    throw new RangeError('Money must have at most two decimal places and remain within the supported total.');
  }
  return cents;
}

export function centsToMoney(cents: number): number {
  if (!Number.isSafeInteger(cents) || Math.abs(cents) > MAX_TOTAL_CENTS) {
    throw new RangeError('Total exceeds the supported money range.');
  }
  return cents / 100;
}

/** All additions happen in checked integer cents; dollar models remain compatible. */
export function addMoney(...amounts: number[]): number {
  let cents = 0;
  for (const amount of amounts) {
    cents += moneyToCents(amount);
    if (!Number.isSafeInteger(cents) || Math.abs(cents) > MAX_TOTAL_CENTS) {
      throw new RangeError('Total exceeds the supported money range.');
    }
  }
  return centsToMoney(cents);
}

export function subtractMoney(amount: number, ...deductions: number[]): number {
  return addMoney(amount, ...deductions.map(value => -value));
}
