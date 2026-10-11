import { RecurringFrequency } from '../types';

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDate(value: string | undefined | null): value is string {
  return typeof value === 'string' && ISO_DATE_RE.test(value);
}

export function normalizeIsoDate(value: string | undefined | null): string | undefined {
  if (!value) return undefined;
  const s = String(value);
  const d = s.split('T')[0];
  return isIsoDate(d) ? d : undefined;
}

export function parseIsoDateLocal(isoDate: string): Date {
  const d = normalizeIsoDate(isoDate);
  if (!d) return new Date(NaN);
  const [y, m, day] = d.split('-').map(Number);
  return new Date(y, m - 1, day, 0, 0, 0, 0);
}

export function formatIsoDateLocal(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function todayIsoLocal(): string {
  return formatIsoDateLocal(new Date());
}

export function compareIsoDates(a: string, b: string): number {
  return a.localeCompare(b);
}

export function maxIsoDate(...values: Array<string | undefined>): string | undefined {
  let max: string | undefined;
  for (const v of values) {
    const d = normalizeIsoDate(v);
    if (!d) continue;
    if (!max || d > max) max = d;
  }
  return max;
}

export function minIsoDate(...values: Array<string | undefined>): string | undefined {
  let min: string | undefined;
  for (const v of values) {
    const d = normalizeIsoDate(v);
    if (!d) continue;
    if (!min || d < min) min = d;
  }
  return min;
}

export function addDaysIsoLocal(isoDate: string, days: number): string {
  const base = parseIsoDateLocal(isoDate);
  if (isNaN(base.getTime())) return todayIsoLocal();
  base.setDate(base.getDate() + days);
  return formatIsoDateLocal(base);
}

export function startOfMonthIsoLocal(isoDate: string): string {
  const d = parseIsoDateLocal(isoDate);
  if (isNaN(d.getTime())) return todayIsoLocal();
  return formatIsoDateLocal(new Date(d.getFullYear(), d.getMonth(), 1));
}

export function endOfMonthIsoLocal(isoDate: string): string {
  const d = parseIsoDateLocal(isoDate);
  if (isNaN(d.getTime())) return todayIsoLocal();
  return formatIsoDateLocal(new Date(d.getFullYear(), d.getMonth() + 1, 0));
}

export function startOfYearIsoLocal(isoDate: string): string {
  const d = parseIsoDateLocal(isoDate);
  if (isNaN(d.getTime())) return todayIsoLocal();
  return formatIsoDateLocal(new Date(d.getFullYear(), 0, 1));
}

export function endOfYearIsoLocal(isoDate: string): string {
  const d = parseIsoDateLocal(isoDate);
  if (isNaN(d.getTime())) return todayIsoLocal();
  return formatIsoDateLocal(new Date(d.getFullYear(), 11, 31));
}

export function startOfWeekIsoLocal(isoDate: string, weekStartsOn: 0 | 1 = 1): string {
  const d = parseIsoDateLocal(isoDate);
  if (isNaN(d.getTime())) return todayIsoLocal();
  const dow = d.getDay();
  const diff = (dow - weekStartsOn + 7) % 7;
  d.setDate(d.getDate() - diff);
  return formatIsoDateLocal(d);
}

export function endOfWeekIsoLocal(isoDate: string, weekStartsOn: 0 | 1 = 1): string {
  const start = startOfWeekIsoLocal(isoDate, weekStartsOn);
  return addDaysIsoLocal(start, 6);
}

export function enumerateIsoDaysInclusive(startIso: string, endIso: string): string[] {
  const start = normalizeIsoDate(startIso);
  const end = normalizeIsoDate(endIso);
  if (!start || !end) return [];
  if (start > end) return [];
  const out: string[] = [];
  let cur = start;
  while (cur <= end) {
    out.push(cur);
    const next = addDaysIsoLocal(cur, 1);
    if (next === cur) break;
    cur = next;
  }
  return out;
}

function lastDayOfMonth(year: number, monthIndex: number): number {
  return new Date(year, monthIndex + 1, 0).getDate();
}

/** First scheduled occurrence after lastApplied, or the start when never applied. */
export function getNextOccurrence(
  frequency: RecurringFrequency,
  startDate: string,
  lastApplied?: string
): string {
  const startIso = normalizeIsoDate(startDate);
  if (!startIso) return todayIsoLocal();
  const previous = normalizeIsoDate(lastApplied);
  if (!previous || previous < startIso) return startIso;
  return firstOccurrenceOnOrAfter(frequency, startIso, addDaysIsoLocal(previous, 1));
}

export function shouldGenerateTransaction(
  frequency: RecurringFrequency,
  startDate: string,
  endDate: string | undefined,
  lastApplied: string | undefined
): boolean {
  const start = normalizeIsoDate(startDate);
  if (!start) return false;
  const today = todayIsoLocal();
  const end = normalizeIsoDate(endDate);
  const cutoff = end && end < today ? end : today;
  // An ended schedule can still have unapplied occurrences before its end date.
  return getNextOccurrence(frequency, start, lastApplied) <= cutoff;
}

/** All scheduled dates up to the requested cutoff, respecting the end date. */
export function getOccurrenceDatesUpTo(
  frequency: RecurringFrequency,
  startDate: string,
  endDate: string | undefined,
  lastApplied: string | undefined,
  upToDate: string
): string[] {
  const startIso = normalizeIsoDate(startDate);
  const upToIso = normalizeIsoDate(upToDate);
  if (!startIso || !upToIso) return [];
  const endIso = normalizeIsoDate(endDate);
  const results: string[] = [];
  let current = normalizeIsoDate(lastApplied)
    ? getNextOccurrence(frequency, startIso, lastApplied)
    : startIso;
  while (true) {
    if (current > upToIso) break;
    if (endIso && current > endIso) break;
    results.push(current);
    const next = getNextOccurrence(frequency, startIso, current);
    if (next === current) break;
    current = next;
  }
  return results;
}

function firstOccurrenceOnOrAfter(
  frequency: RecurringFrequency,
  startIso: string,
  targetIso: string
): string {
  const start = parseIsoDateLocal(startIso);
  const target = parseIsoDateLocal(targetIso);
  if (isNaN(start.getTime()) || isNaN(target.getTime())) return startIso;
  if (startIso >= targetIso) return startIso;

  if (frequency === 'daily' || frequency === 'weekly' || frequency === 'fortnightly') {
    const stepDays = frequency === 'daily' ? 1 : frequency === 'weekly' ? 7 : 14;
    // Count calendar days, not elapsed hours: local days can have 23 or 25 hours.
    const dayNumber = (date: Date) => Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86400000;
    const offset = Math.ceil((dayNumber(target) - dayNumber(start)) / stepDays) * stepDays;
    return addDaysIsoLocal(startIso, offset);
  }

  if (frequency === 'monthly') {
    let monthOffset = (target.getFullYear() - start.getFullYear()) * 12 + target.getMonth() - start.getMonth();
    const occurrence = (offset: number) => {
      const month = new Date(start.getFullYear(), start.getMonth() + offset, 1);
      return formatIsoDateLocal(new Date(month.getFullYear(), month.getMonth(),
        Math.min(start.getDate(), lastDayOfMonth(month.getFullYear(), month.getMonth()))));
    };
    if (occurrence(monthOffset) < targetIso) monthOffset += 1;
    return occurrence(monthOffset);
  }

  let year = target.getFullYear();
  const occurrence = (y: number) => formatIsoDateLocal(new Date(y, start.getMonth(),
    Math.min(start.getDate(), lastDayOfMonth(y, start.getMonth()))));
  if (occurrence(year) < targetIso) year += 1;
  return occurrence(year);
}

/** Returns scheduled dates within the inclusive range, respecting endDate. */
export function getOccurrenceDatesBetween(
  frequency: RecurringFrequency,
  startDate: string,
  endDate: string | undefined,
  fromDate: string,
  toDate: string
): string[] {
  const startIso = normalizeIsoDate(startDate);
  const fromIso = normalizeIsoDate(fromDate);
  const toIso = normalizeIsoDate(toDate);
  if (!startIso || !fromIso || !toIso) return [];
  if (fromIso > toIso) return [];
  const endIso = normalizeIsoDate(endDate);
  if (endIso && endIso < fromIso) return [];
  const first = firstOccurrenceOnOrAfter(frequency, startIso, fromIso);
  if (first > toIso) return [];
  if (endIso && first > endIso) return [];
  const results: string[] = [];
  let current = first;
  let guard = 0;
  while (current <= toIso) {
    if (endIso && current > endIso) break;
    results.push(current);
    const next = getNextOccurrence(frequency, startIso, current);
    if (next === current) break;
    current = next;
    guard += 1;
    if (guard > 100000) break;
  }
  return results;
}

export function formatDate(dateString: string): string {
  if (!dateString) return 'Invalid date';
  try {
    const normalized = normalizeIsoDate(dateString);
    const date = normalized ? parseIsoDateLocal(normalized) : new Date(dateString);
    if (isNaN(date.getTime())) return 'Invalid date';
    return date.toLocaleDateString();
  } catch (error) {
    console.error('Error formatting date:', error);
    return 'Invalid date';
  }
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(amount);
}
