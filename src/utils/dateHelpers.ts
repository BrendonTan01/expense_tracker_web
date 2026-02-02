import { RecurringFrequency } from '../types';

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDate(value: string | undefined | null): value is string {
  return typeof value === 'string' && ISO_DATE_RE.test(value);
}

/**
 * Normalize any date-like string to `YYYY-MM-DD` when possible.
 * - Accepts `YYYY-MM-DD` or ISO timestamps like `YYYY-MM-DDTHH:mm:ss...`
 */
export function normalizeIsoDate(value: string | undefined | null): string | undefined {
  if (!value) return undefined;
  const s = String(value);
  const d = s.split('T')[0];
  return isIsoDate(d) ? d : undefined;
}

/**
 * Parse `YYYY-MM-DD` as a **local** Date at midnight.
 * Avoids the JS pitfall where `new Date('YYYY-MM-DD')` is treated as UTC.
 */
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
  // ISO `YYYY-MM-DD` sorts lexicographically
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
  const dow = d.getDay(); // 0 Sun ... 6 Sat
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
    if (next === cur) break; // safety
    cur = next;
  }
  return out;
}

function lastDayOfMonth(year: number, monthIndex: number): number {
  return new Date(year, monthIndex + 1, 0).getDate();
}

export function getNextOccurrence(
  frequency: RecurringFrequency,
  startDate: string,
  lastApplied?: string
): string {
  const startIso = normalizeIsoDate(startDate);
  if (!startIso) return todayIsoLocal();
  
  try {
    const start = parseIsoDateLocal(startIso);
    if (isNaN(start.getTime())) return todayIsoLocal();

    const baseIso = normalizeIsoDate(lastApplied) || startIso;
    const base = parseIsoDateLocal(baseIso);
    if (isNaN(base.getTime())) return startIso;

    const next = new Date(base.getFullYear(), base.getMonth(), base.getDate(), 0, 0, 0, 0);

    switch (frequency) {
      case 'daily':
        next.setDate(next.getDate() + 1);
        break;
      case 'weekly':
        next.setDate(next.getDate() + 7);
        break;
      case 'fortnightly':
        next.setDate(next.getDate() + 14);
        break;
      case 'monthly': {
        const desiredDay = start.getDate();
        const y = next.getFullYear();
        const m = next.getMonth() + 1;
        const last = lastDayOfMonth(y, m);
        const dayToUse = Math.min(desiredDay, last);
        next.setFullYear(y);
        next.setMonth(m);
        next.setDate(dayToUse);
        break;
      }
      case 'yearly': {
        const desiredMonth = start.getMonth();
        const desiredDay = start.getDate();
        const y = next.getFullYear() + 1;
        const last = lastDayOfMonth(y, desiredMonth);
        next.setFullYear(y);
        next.setMonth(desiredMonth);
        next.setDate(Math.min(desiredDay, last));
        break;
      }
    }

    return formatIsoDateLocal(next);
  } catch (error) {
    console.error('Error calculating next occurrence:', error);
    return todayIsoLocal();
  }
}

export function shouldGenerateTransaction(
  frequency: RecurringFrequency,
  startDate: string,
  endDate: string | undefined,
  lastApplied: string | undefined
): boolean {
  const today = todayIsoLocal();
  const start = normalizeIsoDate(startDate);
  if (!start) return false;

  if (start > today) {
    return false; // Not started yet
  }

  const end = normalizeIsoDate(endDate);
  if (end) {
    if (end < today) {
      return false; // Already ended
    }
  }

  if (!lastApplied) {
    // Never generated, check if we should generate for start date
    return start <= today;
  }

  const next = getNextOccurrence(frequency, start, lastApplied);
  return next <= today;
}

/**
 * Returns all occurrence dates from start (or first after lastApplied) up to and including upToDate.
 * Respects endDate if provided; when no endDate, continues indefinitely (recurring never ends).
 */
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
    if (next === current) break; // safety
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
  if (start >= target) return startIso;

  if (frequency === 'daily' || frequency === 'weekly' || frequency === 'fortnightly') {
    const stepDays = frequency === 'daily' ? 1 : frequency === 'weekly' ? 7 : 14;
    const diffDays = Math.floor((target.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
    const n = Math.ceil(diffDays / stepDays);
    return formatIsoDateLocal(new Date(start.getFullYear(), start.getMonth(), start.getDate() + n * stepDays));
  }

  if (frequency === 'monthly') {
    const desiredDay = start.getDate();
    const monthsDiff =
      (target.getFullYear() - start.getFullYear()) * 12 + (target.getMonth() - start.getMonth());
    let offset = Math.max(0, monthsDiff);
    while (offset < monthsDiff + 3) {
      const y = start.getFullYear() + Math.floor((start.getMonth() + offset) / 12);
      const m = (start.getMonth() + offset) % 12;
      const day = Math.min(desiredDay, lastDayOfMonth(y, m));
      const candidate = new Date(y, m, day, 0, 0, 0, 0);
      if (candidate >= target) return formatIsoDateLocal(candidate);
      offset += 1;
    }
    // fallback to a small iteration from the last candidate
    let cur = startIso;
    while (cur < targetIso) {
      const next = getNextOccurrence('monthly', startIso, cur);
      if (next === cur) break;
      cur = next;
    }
    return cur;
  }

  // yearly
  const desiredMonth = start.getMonth();
  const desiredDay = start.getDate();
  const yearsDiff = target.getFullYear() - start.getFullYear();
  let offset = Math.max(0, yearsDiff);
  while (offset < yearsDiff + 3) {
    const y = start.getFullYear() + offset;
    const day = Math.min(desiredDay, lastDayOfMonth(y, desiredMonth));
    const candidate = new Date(y, desiredMonth, day, 0, 0, 0, 0);
    if (candidate >= target) return formatIsoDateLocal(candidate);
    offset += 1;
  }
  let cur = startIso;
  while (cur < targetIso) {
    const next = getNextOccurrence('yearly', startIso, cur);
    if (next === cur) break;
    cur = next;
  }
  return cur;
}

/**
 * Returns occurrence dates that fall within [fromDate, toDate] inclusive.
 * Respects endDate if provided.
 */
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
    if (guard > 100000) break; // safety
  }
  return results;
}

export function formatDate(dateString: string): string {
  if (!dateString) {
    return 'Invalid date';
  }
  
  try {
    const normalized = normalizeIsoDate(dateString);
    const date = normalized ? parseIsoDateLocal(normalized) : new Date(dateString);
    if (isNaN(date.getTime())) {
      return 'Invalid date';
    }
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