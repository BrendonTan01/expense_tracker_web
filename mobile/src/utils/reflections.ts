import type { MonthlySummary, YearlySummary } from '../types';

export const reflectionKey = (year: number, month?: number) => month === undefined ? `year:${year}` : `month:${year}:${month}`;

export function reflectionText(drafts: Record<string, string>, key: string, existing?: { summary?: string | null }) {
  return drafts[key] ?? existing?.summary ?? '';
}

export function reflectionYears(transactions: { date: string }[], monthly: MonthlySummary[], yearly: YearlySummary[], currentYear: number) {
  const years = new Set([currentYear, ...monthly.map(s => s.year), ...yearly.map(s => s.year)]);
  // A stored calendar date must not shift into the previous year in western time zones.
  transactions.forEach(t => {
    const year = Number(t.date.slice(0, 4));
    if (Number.isInteger(year) && year > 0) years.add(year);
  });
  return [...years].sort((a, b) => b - a);
}
