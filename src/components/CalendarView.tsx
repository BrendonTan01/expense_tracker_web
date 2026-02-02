import { useMemo, useState } from 'react';
import { Bucket, Budget, RecurringTransaction, Transaction } from '../types';
import { formatCurrency, getOccurrenceDatesBetween, normalizeIsoDate, parseIsoDateLocal, todayIsoLocal, startOfMonthIsoLocal, endOfMonthIsoLocal, startOfWeekIsoLocal, endOfWeekIsoLocal, startOfYearIsoLocal, endOfYearIsoLocal, enumerateIsoDaysInclusive } from '../utils/dateHelpers';

type CalendarMode = 'day' | 'week' | 'month' | 'year';

type CalendarItem =
  | {
      kind: 'posted';
      date: string; // YYYY-MM-DD
      transaction: Transaction;
    }
  | {
      kind: 'scheduled';
      date: string; // YYYY-MM-DD
      recurringId: string;
      transaction: Omit<Transaction, 'id' | 'date' | 'isRecurring'> & { isRecurring?: boolean; date?: string };
      frequency: RecurringTransaction['frequency'];
    };

type DayTypePresence = {
  expense: boolean;
  income: boolean;
  investment: boolean;
};

type HeatLevel = 0 | 1 | 2 | 3 | 4;

function dayTypePresence(items: CalendarItem[]): DayTypePresence {
  const out: DayTypePresence = { expense: false, income: false, investment: false };
  for (const item of items) {
    const tType = item.transaction.type;
    if (tType === 'expense') out.expense = true;
    else if (tType === 'income') out.income = true;
    else if (tType === 'investment') out.investment = true;
  }
  return out;
}

function DayTypeMarkers(props: { items: CalendarItem[]; className?: string }) {
  const { items, className } = props;
  const presence = dayTypePresence(items);
  const any = presence.expense || presence.income || presence.investment;
  if (!any) return null;

  const labelParts: string[] = [];
  if (presence.expense) labelParts.push('expense');
  if (presence.income) labelParts.push('income');
  if (presence.investment) labelParts.push('investment');

  return (
    <div className={['calendar-markers', className || ''].join(' ')} aria-label={`Transactions: ${labelParts.join(', ')}`}>
      {presence.expense && <span className="calendar-marker calendar-marker--expense" />}
      {presence.income && <span className="calendar-marker calendar-marker--income" />}
      {presence.investment && <span className="calendar-marker calendar-marker--investment" />}
    </div>
  );
}

function postedExpenseTotal(items: CalendarItem[]): number {
  let total = 0;
  for (const item of items) {
    if (item.kind !== 'posted') continue;
    if (item.transaction.type !== 'expense') continue;
    total += item.transaction.amount;
  }
  return total;
}

function quantileIndex(n: number, p: 0.25 | 0.5 | 0.75): number {
  if (n <= 1) return 0;
  return Math.floor((n - 1) * p);
}

function computeHeatLevelsByDate(dates: string[], itemsByDate: Map<string, CalendarItem[]>): Map<string, HeatLevel> {
  const expenseByDate = new Map<string, number>();
  const nonZero: number[] = [];

  for (const dIso of dates) {
    const total = postedExpenseTotal(itemsByDate.get(dIso) || []);
    expenseByDate.set(dIso, total);
    if (total > 0) nonZero.push(total);
  }

  const levels = new Map<string, HeatLevel>();
  if (nonZero.length === 0) {
    for (const dIso of dates) levels.set(dIso, 0);
    return levels;
  }

  nonZero.sort((a, b) => a - b);

  if (nonZero.length === 1) {
    const only = nonZero[0];
    for (const dIso of dates) {
      const v = expenseByDate.get(dIso) || 0;
      levels.set(dIso, v === only ? 4 : 0);
    }
    return levels;
  }

  const min = nonZero[0];
  const max = nonZero[nonZero.length - 1];
  if (min === max) {
    for (const dIso of dates) {
      const v = expenseByDate.get(dIso) || 0;
      levels.set(dIso, v > 0 ? 2 : 0);
    }
    return levels;
  }

  const q1 = nonZero[quantileIndex(nonZero.length, 0.25)];
  const q2 = nonZero[quantileIndex(nonZero.length, 0.5)];
  const q3 = nonZero[quantileIndex(nonZero.length, 0.75)];

  for (const dIso of dates) {
    const v = expenseByDate.get(dIso) || 0;
    if (v <= 0) {
      levels.set(dIso, 0);
      continue;
    }
    if (v <= q1) levels.set(dIso, 1);
    else if (v <= q2) levels.set(dIso, 2);
    else if (v <= q3) levels.set(dIso, 3);
    else levels.set(dIso, 4);
  }

  return levels;
}

function clampIsoDate(value: string | undefined, fallback: string): string {
  return normalizeIsoDate(value) || fallback;
}

function monthLabelFromIso(isoDate: string): string {
  const d = parseIsoDateLocal(isoDate);
  if (isNaN(d.getTime())) return isoDate;
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long' });
}

function yearLabelFromIso(isoDate: string): string {
  const d = parseIsoDateLocal(isoDate);
  if (isNaN(d.getTime())) return isoDate;
  return String(d.getFullYear());
}

function sameIsoMonth(a: string, b: string): boolean {
  const da = parseIsoDateLocal(a);
  const db = parseIsoDateLocal(b);
  if (isNaN(da.getTime()) || isNaN(db.getTime())) return false;
  return da.getFullYear() === db.getFullYear() && da.getMonth() === db.getMonth();
}

function isoFromParts(y: number, mIndex: number, day: number): string {
  return clampIsoDate(
    `${y}-${String(mIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
    todayIsoLocal()
  );
}

function buildRangeForMode(mode: CalendarMode, anchorIso: string): { start: string; end: string } {
  switch (mode) {
    case 'day':
      return { start: anchorIso, end: anchorIso };
    case 'week':
      return { start: startOfWeekIsoLocal(anchorIso, 1), end: endOfWeekIsoLocal(anchorIso, 1) };
    case 'month':
      return { start: startOfMonthIsoLocal(anchorIso), end: endOfMonthIsoLocal(anchorIso) };
    case 'year':
      return { start: startOfYearIsoLocal(anchorIso), end: endOfYearIsoLocal(anchorIso) };
  }
}

function shiftAnchor(mode: CalendarMode, anchorIso: string, dir: -1 | 1): string {
  const d = parseIsoDateLocal(anchorIso);
  if (isNaN(d.getTime())) return anchorIso;

  if (mode === 'day') {
    d.setDate(d.getDate() + dir);
    return clampIsoDate(formatIso(d), anchorIso);
  }
  if (mode === 'week') {
    d.setDate(d.getDate() + dir * 7);
    return clampIsoDate(formatIso(d), anchorIso);
  }
  if (mode === 'month') {
    d.setMonth(d.getMonth() + dir);
    d.setDate(1);
    return clampIsoDate(formatIso(d), anchorIso);
  }
  // year
  d.setFullYear(d.getFullYear() + dir);
  d.setMonth(0);
  d.setDate(1);
  return clampIsoDate(formatIso(d), anchorIso);
}

function formatIso(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function getBucketName(buckets: Bucket[], bucketId?: string): string {
  if (!bucketId) return '—';
  return buckets.find((b) => b.id === bucketId)?.name || 'Unknown';
}

function getBucketColor(buckets: Bucket[], bucketId?: string): string {
  if (!bucketId) return '#94a3b8';
  return buckets.find((b) => b.id === bucketId)?.color || '#94a3b8';
}

function computeStats(items: CalendarItem[], buckets: Bucket[], includeScheduledInStats: boolean) {
  const usable = includeScheduledInStats ? items : items.filter((i) => i.kind === 'posted');

  let income = 0;
  let expenses = 0;
  let investments = 0;
  const bucketTotals: Record<string, number> = {};

  for (const item of usable) {
    const t =
      item.kind === 'posted'
        ? item.transaction
        : ({
            ...item.transaction,
            // scheduled items mimic transaction semantics
            isRecurring: true,
          } as Transaction);

    if (t.type === 'income') income += t.amount;
    else if (t.type === 'expense') {
      expenses += t.amount;
      const key = t.bucketId || 'no-bucket';
      bucketTotals[key] = (bucketTotals[key] || 0) + t.amount;
    } else if (t.type === 'investment') investments += t.amount;
  }

  const bucketBreakdown = Object.entries(bucketTotals)
    .map(([bucketId, total]) => ({
      bucketId,
      bucketName: bucketId === 'no-bucket' ? 'No Bucket' : getBucketName(buckets, bucketId),
      bucketColor: bucketId === 'no-bucket' ? '#94a3b8' : getBucketColor(buckets, bucketId),
      total,
    }))
    .sort((a, b) => b.total - a.total);

  const balance = income - expenses - investments;

  return { income, expenses, investments, balance, bucketBreakdown };
}

function MonthGrid(props: {
  anchorIso: string;
  itemsByDate: Map<string, CalendarItem[]>;
  onSelectDate: (iso: string) => void;
  selectedDate: string;
  heatLevelsByDate: Map<string, HeatLevel>;
}) {
  const { anchorIso, itemsByDate, onSelectDate, selectedDate, heatLevelsByDate } = props;
  const start = startOfMonthIsoLocal(anchorIso);
  const end = endOfMonthIsoLocal(anchorIso);
  const monthStart = parseIsoDateLocal(start);
  const monthEnd = parseIsoDateLocal(end);
  const firstDayDow = new Date(monthStart.getFullYear(), monthStart.getMonth(), 1).getDay(); // 0 Sun
  const weekStartsOn: 0 | 1 = 1;
  const offset = (firstDayDow - weekStartsOn + 7) % 7;

  const daysInMonth = monthEnd.getDate();
  const cells = [];
  for (let i = 0; i < offset; i++) cells.push(null);
  for (let day = 1; day <= daysInMonth; day++) {
    cells.push(isoFromParts(monthStart.getFullYear(), monthStart.getMonth(), day));
  }

  // pad to full weeks
  while (cells.length % 7 !== 0) cells.push(null);

  const weekdayLabels = weekStartsOn === 1 ? ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] : ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  return (
    <div className="calendar-month">
      <div className="calendar-weekdays">
        {weekdayLabels.map((w) => (
          <div key={w} className="calendar-weekday">
            {w}
          </div>
        ))}
      </div>
      <div className="calendar-grid">
        {cells.map((iso, idx) => {
          if (!iso) return <div key={`empty-${idx}`} className="calendar-cell calendar-cell--empty" />;
          const items = itemsByDate.get(iso) || [];

          const isSelected = iso === selectedDate;
          const isToday = iso === todayIsoLocal();
          const inMonth = sameIsoMonth(iso, anchorIso);

          return (
            <button
              key={iso}
              type="button"
              className={[
                'calendar-cell',
                heatLevelsByDate.get(iso) ? `calendar-cell--heat-${heatLevelsByDate.get(iso)}` : '',
                isSelected ? 'calendar-cell--selected' : '',
                isToday ? 'calendar-cell--today' : '',
                inMonth ? '' : 'calendar-cell--muted',
              ].join(' ')}
              onClick={() => onSelectDate(iso)}
            >
              <div className="calendar-cell-top">
                <span className="calendar-day">{parseIsoDateLocal(iso).getDate()}</span>
              </div>
              <div className="calendar-cell-bottom">
                <DayTypeMarkers items={items} />
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function YearGrid(props: {
  yearIso: string;
  itemsByDate: Map<string, CalendarItem[]>;
  onSelectMonth: (monthAnchorIso: string) => void;
  onSelectDate: (dateIso: string) => void;
}) {
  const year = parseIsoDateLocal(startOfYearIsoLocal(props.yearIso)).getFullYear();
  const months = Array.from({ length: 12 }, (_, m) => isoFromParts(year, m, 1));
  return (
    <div className="calendar-year">
      {months.map((mIso) => {
        const start = startOfMonthIsoLocal(mIso);
        const end = endOfMonthIsoLocal(mIso);
        const days = enumerateIsoDaysInclusive(start, end);
        let monthExpenses = 0;
        for (const dayIso of days) {
          const items = props.itemsByDate.get(dayIso) || [];
          for (const item of items) {
            if (item.kind === 'posted' && item.transaction.type === 'expense') monthExpenses += item.transaction.amount;
          }
        }

        const label = parseIsoDateLocal(mIso).toLocaleDateString('en-US', { month: 'short' });
        const monthStart = parseIsoDateLocal(start);
        const firstDayDow = new Date(monthStart.getFullYear(), monthStart.getMonth(), 1).getDay(); // 0 Sun
        const weekStartsOn: 0 | 1 = 1;
        const offset = (firstDayDow - weekStartsOn + 7) % 7;
        const daysInMonth = parseIsoDateLocal(end).getDate();
        const cells: Array<string | null> = [];
        for (let i = 0; i < offset; i++) cells.push(null);
        for (let day = 1; day <= daysInMonth; day++) {
          cells.push(isoFromParts(monthStart.getFullYear(), monthStart.getMonth(), day));
        }
        while (cells.length % 7 !== 0) cells.push(null);

        return (
          <div key={mIso} className="calendar-year-month" title={`${label} ${year}`}>
            <button
              type="button"
              className="calendar-year-month-title"
              onClick={() => props.onSelectMonth(mIso)}
            >
              <span>{label}</span>
              <span className="calendar-year-month-expense">{monthExpenses > 0 ? formatCurrency(monthExpenses) : '—'}</span>
            </button>

            <div className="calendar-year-mini-grid">
              {cells.map((dIso, idx) => {
                if (!dIso) return <div key={`empty-${mIso}-${idx}`} className="calendar-year-mini-cell calendar-year-mini-cell--empty" />;
                const items = props.itemsByDate.get(dIso) || [];
                const hasPosted = items.some((i) => i.kind === 'posted');
                const hasScheduled = items.some((i) => i.kind === 'scheduled');
                const isToday = dIso === todayIsoLocal();

                return (
                  <button
                    key={dIso}
                    type="button"
                    className={[
                      'calendar-year-mini-cell',
                      hasPosted ? 'calendar-year-mini-cell--posted' : '',
                      hasScheduled ? 'calendar-year-mini-cell--scheduled' : '',
                      isToday ? 'calendar-year-mini-cell--today' : '',
                    ].join(' ')}
                    onClick={() => props.onSelectDate(dIso)}
                  >
                    {parseIsoDateLocal(dIso).getDate()}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Agenda(props: {
  dateIso: string;
  items: CalendarItem[];
  buckets: Bucket[];
  onEditTransaction?: (t: Transaction) => void;
  onDeleteTransaction?: (id: string) => void;
}) {
  const { dateIso, items, buckets, onEditTransaction, onDeleteTransaction } = props;
  const posted = items.filter((i) => i.kind === 'posted') as Array<Extract<CalendarItem, { kind: 'posted' }>>;
  const scheduled = items.filter((i) => i.kind === 'scheduled') as Array<Extract<CalendarItem, { kind: 'scheduled' }>>;

  return (
    <div className="calendar-agenda">
      <div className="calendar-agenda-header">
        <h3 style={{ margin: 0 }}>{parseIsoDateLocal(dateIso).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</h3>
      </div>

      {posted.length === 0 && scheduled.length === 0 ? (
        <div className="calendar-empty">No transactions on this day.</div>
      ) : (
        <>
          {posted.length > 0 && (
            <div className="calendar-agenda-section">
              <div className="calendar-agenda-section-title">Posted</div>
              <div className="calendar-agenda-list">
                {posted
                  .slice()
                  .sort((a, b) => b.transaction.amount - a.transaction.amount)
                  .map(({ transaction }) => (
                    <div key={transaction.id} className={`calendar-agenda-item calendar-agenda-item--${transaction.type}`}>
                      <div style={{ minWidth: 0 }}>
                        <div className="calendar-agenda-desc">{transaction.description}</div>
                        <div className="calendar-agenda-meta">
                          <span>{transaction.type}</span>
                          {transaction.type === 'expense' && <span>• {getBucketName(buckets, transaction.bucketId)}</span>}
                          {transaction.tags && transaction.tags.length > 0 && <span>• {transaction.tags.join(', ')}</span>}
                        </div>
                      </div>
                      <div className="calendar-agenda-right">
                        <div className="calendar-agenda-amount">
                          {transaction.type === 'income' ? '+' : '-'}
                          {formatCurrency(transaction.amount)}
                        </div>
                        <div className="calendar-agenda-actions">
                          {onEditTransaction && (
                            <button className="btn btn-sm btn-secondary" onClick={() => onEditTransaction(transaction)}>
                              Edit
                            </button>
                          )}
                          {onDeleteTransaction && (
                            <button className="btn btn-sm btn-danger" onClick={() => onDeleteTransaction(transaction.id)}>
                              Delete
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          )}

          {scheduled.length > 0 && (
            <div className="calendar-agenda-section">
              <div className="calendar-agenda-section-title">Scheduled (recurring)</div>
              <div className="calendar-agenda-list">
                {scheduled.map((item, idx) => (
                  <div key={`${item.recurringId}-${item.date}-${idx}`} className={`calendar-agenda-item calendar-agenda-item--scheduled`}>
                    <div style={{ minWidth: 0 }}>
                      <div className="calendar-agenda-desc">{item.transaction.description}</div>
                      <div className="calendar-agenda-meta">
                        <span>{item.transaction.type}</span>
                        {item.transaction.type === 'expense' && <span>• {getBucketName(buckets, item.transaction.bucketId)}</span>}
                        <span>• {item.frequency}</span>
                      </div>
                    </div>
                    <div className="calendar-agenda-right">
                      <div className="calendar-agenda-amount">
                        {item.transaction.type === 'income' ? '+' : '-'}
                        {formatCurrency(item.transaction.amount)}
                      </div>
                      <div className="calendar-agenda-note">Scheduled</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function BudgetProgress(props: {
  budgets: Budget[];
  buckets: Bucket[];
  items: CalendarItem[];
  mode: CalendarMode;
  anchorIso: string;
}) {
  const { budgets, buckets, items, mode, anchorIso } = props;
  const anchor = parseIsoDateLocal(anchorIso);
  if (isNaN(anchor.getTime())) return null;

  const year = anchor.getFullYear();
  const month = anchor.getMonth() + 1;

  const relevantBudgets =
    mode === 'month'
      ? budgets.filter((b) => b.period === 'monthly' && b.year === year && b.month === month)
      : mode === 'year'
        ? budgets.filter((b) => b.period === 'yearly' && b.year === year)
        : [];

  if (relevantBudgets.length === 0) return null;

  const postedExpenses = items
    .filter((i) => i.kind === 'posted' && i.transaction.type === 'expense' && i.transaction.bucketId)
    .map((i) => (i.kind === 'posted' ? i.transaction : null))
    .filter(Boolean) as Transaction[];

  const spentByBucket: Record<string, number> = {};
  for (const t of postedExpenses) {
    const key = t.bucketId!;
    spentByBucket[key] = (spentByBucket[key] || 0) + t.amount;
  }

  return (
    <div className="calendar-panel-section">
      <div className="calendar-panel-title">Budgets</div>
      <div className="calendar-budget-list">
        {relevantBudgets.map((b) => {
          const spent = spentByBucket[b.bucketId] || 0;
          const pct = b.amount > 0 ? (spent / b.amount) * 100 : 0;
          const bucket = buckets.find((x) => x.id === b.bucketId);
          const over = spent > b.amount;
          return (
            <div key={b.id} className="calendar-budget-item">
              <div className="calendar-budget-top">
                <div className="calendar-budget-name">
                  <span className="calendar-budget-color" style={{ backgroundColor: bucket?.color || '#94a3b8' }} />
                  <span>{bucket?.name || 'Unknown'}</span>
                </div>
                <div className={`calendar-budget-status ${over ? 'over' : ''}`}>
                  {formatCurrency(spent)} / {formatCurrency(b.amount)}
                </div>
              </div>
              <div className="calendar-budget-bar">
                <div className={`calendar-budget-bar-fill ${over ? 'over' : ''}`} style={{ width: `${Math.min(pct, 100)}%` }} />
              </div>
              <div className="calendar-budget-meta">{pct.toFixed(0)}% used</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function CalendarView(props: {
  transactions: Transaction[];
  buckets: Bucket[];
  recurringTransactions: RecurringTransaction[];
  budgets: Budget[];
  onEditTransaction?: (t: Transaction) => void;
  onDeleteTransaction?: (id: string) => void;
}) {
  const { transactions, buckets, recurringTransactions, budgets, onEditTransaction, onDeleteTransaction } = props;

  const [mode, setMode] = useState<CalendarMode>('month');
  const [anchorIso, setAnchorIso] = useState<string>(todayIsoLocal());
  const [selectedIso, setSelectedIso] = useState<string>(todayIsoLocal());
  const [includeScheduledInStats, setIncludeScheduledInStats] = useState(false);
  const [typeFilter, setTypeFilter] = useState<'all' | Transaction['type']>('all');
  const [bucketFilter, setBucketFilter] = useState<string>('all');
  const [tagFilter, setTagFilter] = useState<string>('all');

  const range = useMemo(() => buildRangeForMode(mode, anchorIso), [mode, anchorIso]);

  const allTags = useMemo(() => {
    const set = new Set<string>();
    for (const t of transactions) {
      (t.tags || []).forEach((tag) => set.add(tag));
    }
    return Array.from(set).sort();
  }, [transactions]);

  const filteredPostedTransactions = useMemo(() => {
    return transactions.filter((t) => {
      const d = normalizeIsoDate(t.date);
      if (!d) return false;
      if (d < range.start || d > range.end) return false;
      if (typeFilter !== 'all' && t.type !== typeFilter) return false;
      if (bucketFilter !== 'all') {
        if (bucketFilter === 'none' && t.bucketId) return false;
        if (bucketFilter !== 'none' && t.bucketId !== bucketFilter) return false;
      }
      if (tagFilter !== 'all') {
        if (!t.tags || !t.tags.includes(tagFilter)) return false;
      }
      return true;
    });
  }, [transactions, range.start, range.end, typeFilter, bucketFilter, tagFilter]);

  const calendarData = useMemo(() => {
    const posted: CalendarItem[] = filteredPostedTransactions
      .map((t) => {
        const date = normalizeIsoDate(t.date);
        if (!date) return null;
        return { kind: 'posted', date, transaction: t } as CalendarItem;
      })
      .filter(Boolean) as CalendarItem[];

    // Exclude scheduled occurrences that already exist as posted recurring transactions on the same date.
    const postedRecurringKey = new Set<string>();
    for (const item of posted) {
      if (item.kind !== 'posted') continue;
      const rId = item.transaction.recurringId;
      if (!rId) continue;
      postedRecurringKey.add(`${rId}:${item.date}`);
    }

    const scheduled: CalendarItem[] = [];
    let totalScheduled = 0;
    const MAX_TOTAL_SCHEDULED = 5000;
    let scheduledTruncated = false;

    for (const r of recurringTransactions) {
      if (totalScheduled >= MAX_TOTAL_SCHEDULED) {
        scheduledTruncated = true;
        break;
      }
      const start = normalizeIsoDate(r.startDate);
      if (!start) continue;

      const occurrences = getOccurrenceDatesBetween(r.frequency, start, r.endDate, range.start, range.end);
      for (const date of occurrences) {
        if (totalScheduled >= MAX_TOTAL_SCHEDULED) {
          scheduledTruncated = true;
          break;
        }
        const key = `${r.id}:${date}`;
        if (postedRecurringKey.has(key)) continue;

        // Apply filters to scheduled items too
        const t = {
          ...r.transaction,
          isRecurring: true,
        };
        if (typeFilter !== 'all' && t.type !== typeFilter) continue;
        if (bucketFilter !== 'all') {
          if (bucketFilter === 'none' && t.bucketId) continue;
          if (bucketFilter !== 'none' && t.bucketId !== bucketFilter) continue;
        }
        if (tagFilter !== 'all') {
          if (!t.tags || !t.tags.includes(tagFilter)) continue;
        }

        scheduled.push({
          kind: 'scheduled',
          date,
          recurringId: r.id,
          transaction: r.transaction,
          frequency: r.frequency,
        });
        totalScheduled += 1;
      }
    }

    return { items: [...posted, ...scheduled], scheduledTruncated };
  }, [filteredPostedTransactions, recurringTransactions, range.start, range.end, typeFilter, bucketFilter, tagFilter]);

  const itemsByDate = useMemo(() => {
    const map = new Map<string, CalendarItem[]>();
    for (const item of calendarData.items) {
      const arr = map.get(item.date) || [];
      arr.push(item);
      map.set(item.date, arr);
    }
    // stable sort per day: posted first, then scheduled; then by amount desc
    for (const [k, arr] of map.entries()) {
      arr.sort((a, b) => {
        if (a.kind !== b.kind) return a.kind === 'posted' ? -1 : 1;
        const aAmt = a.kind === 'posted' ? a.transaction.amount : a.transaction.amount;
        const bAmt = b.kind === 'posted' ? b.transaction.amount : b.transaction.amount;
        return bAmt - aAmt;
      });
      map.set(k, arr);
    }
    return map;
  }, [calendarData.items]);

  const selectedItems = useMemo(() => itemsByDate.get(selectedIso) || [], [itemsByDate, selectedIso]);

  const rangeItems = useMemo(() => {
    const days = enumerateIsoDaysInclusive(range.start, range.end);
    const out: CalendarItem[] = [];
    for (const d of days) {
      const arr = itemsByDate.get(d);
      if (arr) out.push(...arr);
    }
    return out;
  }, [itemsByDate, range.start, range.end]);

  const stats = useMemo(() => computeStats(rangeItems, buckets, includeScheduledInStats), [rangeItems, buckets, includeScheduledInStats]);

  const rangeCounts = useMemo(() => {
    let posted = 0;
    let scheduled = 0;
    for (const i of rangeItems) {
      if (i.kind === 'posted') posted += 1;
      else scheduled += 1;
    }
    return { posted, scheduled, total: posted + scheduled };
  }, [rangeItems]);

  const rangeDaysCount = useMemo(() => enumerateIsoDaysInclusive(range.start, range.end).length, [range.start, range.end]);
  const avgSpendPerDay = rangeDaysCount > 0 ? stats.expenses / rangeDaysCount : 0;

  const headerLabel =
    mode === 'month'
      ? monthLabelFromIso(anchorIso)
      : mode === 'year'
        ? yearLabelFromIso(anchorIso)
        : mode === 'week'
          ? `${monthLabelFromIso(range.start)} • Week of ${parseIsoDateLocal(range.start).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
          : parseIsoDateLocal(anchorIso).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  const monthHeatLevelsByDate = useMemo(() => {
    if (mode !== 'month') return new Map<string, HeatLevel>();
    const monthStart = startOfMonthIsoLocal(anchorIso);
    const monthEnd = endOfMonthIsoLocal(anchorIso);
    const days = enumerateIsoDaysInclusive(monthStart, monthEnd);
    return computeHeatLevelsByDate(days, itemsByDate);
  }, [mode, anchorIso, itemsByDate]);

  const weekHeatLevelsByDate = useMemo(() => {
    if (mode !== 'week') return new Map<string, HeatLevel>();
    const days = enumerateIsoDaysInclusive(range.start, range.end);
    return computeHeatLevelsByDate(days, itemsByDate);
  }, [mode, range.start, range.end, itemsByDate]);

  return (
    <div className="calendar-view">
      <div className="calendar-toolbar">
        <div className="calendar-toolbar-left">
          <h2 style={{ margin: 0 }}>Calendar</h2>
          <div className="calendar-subtitle">{headerLabel}</div>
        </div>
        <div className="calendar-toolbar-right">
          <div className="calendar-mode-toggle">
            {(['day', 'week', 'month', 'year'] as CalendarMode[]).map((m) => (
              <button
                key={m}
                type="button"
                className={`btn btn-sm ${mode === m ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => {
                  const nextAnchor = m === 'day' || m === 'week' ? selectedIso : anchorIso;
                  setMode(m);
                  setAnchorIso(nextAnchor);
                  // keep selected date inside new range
                  const nextRange = buildRangeForMode(m, nextAnchor);
                  if (selectedIso < nextRange.start || selectedIso > nextRange.end) {
                    setSelectedIso(nextAnchor);
                  }
                }}
              >
                {m}
              </button>
            ))}
          </div>
          <div className="calendar-nav">
            <button
              className="btn btn-sm btn-secondary calendar-nav-icon"
              aria-label={`Previous ${mode}`}
              title={`Previous ${mode}`}
              onClick={() => {
                const nextAnchor = shiftAnchor(mode, anchorIso, -1);
                setAnchorIso(nextAnchor);
                const nextRange = buildRangeForMode(mode, nextAnchor);
                if (selectedIso < nextRange.start || selectedIso > nextRange.end) {
                  setSelectedIso(nextAnchor);
                }
              }}
            >
              ←
            </button>
            <button
              className="btn btn-sm btn-secondary calendar-nav-icon"
              aria-label="Today"
              title="Today"
              onClick={() => {
                const t = todayIsoLocal();
                setAnchorIso(t);
                setSelectedIso(t);
              }}
            >
              ●
            </button>
            <button
              className="btn btn-sm btn-secondary calendar-nav-icon"
              aria-label={`Next ${mode}`}
              title={`Next ${mode}`}
              onClick={() => {
                const nextAnchor = shiftAnchor(mode, anchorIso, 1);
                setAnchorIso(nextAnchor);
                const nextRange = buildRangeForMode(mode, nextAnchor);
                if (selectedIso < nextRange.start || selectedIso > nextRange.end) {
                  setSelectedIso(nextAnchor);
                }
              }}
            >
              →
            </button>
          </div>
        </div>
      </div>

      <div className="calendar-filters">
        <div className="calendar-filters-row">
          <select className="input input-sm" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as any)}>
            <option value="all">All Types</option>
            <option value="expense">Expenses</option>
            <option value="income">Income</option>
            <option value="investment">Investments</option>
          </select>
          <select className="input input-sm" value={bucketFilter} onChange={(e) => setBucketFilter(e.target.value)}>
            <option value="all">All Buckets</option>
            <option value="none">No Bucket</option>
            {buckets.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
          <select className="input input-sm" value={tagFilter} onChange={(e) => setTagFilter(e.target.value)}>
            <option value="all">All Tags</option>
            {allTags.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <label className="calendar-checkbox">
            <input
              type="checkbox"
              checked={includeScheduledInStats}
              onChange={(e) => setIncludeScheduledInStats(e.target.checked)}
            />
            Include scheduled in totals
          </label>
        </div>
        {(mode === 'month' || mode === 'week') && (
          <div className="calendar-legend" aria-label="Calendar legend">
            <div className="calendar-legend-row">
              <span className="calendar-legend-label">Spending heat (expenses):</span>
              <span className="calendar-legend-heat">
                <span className="calendar-legend-heat-box calendar-cell--heat-1" aria-label="Low spend" />
                <span className="calendar-legend-heat-box calendar-cell--heat-2" aria-label="Medium-low spend" />
                <span className="calendar-legend-heat-box calendar-cell--heat-3" aria-label="Medium-high spend" />
                <span className="calendar-legend-heat-box calendar-cell--heat-4" aria-label="High spend" />
              </span>
            </div>
            <div className="calendar-legend-row">
              <span className="calendar-legend-label">Transaction types:</span>
              <span className="calendar-markers" aria-label="Expense, income, investment markers">
                <span className="calendar-marker calendar-marker--expense" />
                <span className="calendar-marker calendar-marker--income" />
                <span className="calendar-marker calendar-marker--investment" />
              </span>
            </div>
          </div>
        )}
        {calendarData.scheduledTruncated && (
          <div style={{ marginTop: '10px', fontSize: '12px', color: 'var(--text-muted)' }}>
            Scheduled occurrences were capped for performance. Zoom in (week/day) or add filters to see more.
          </div>
        )}
      </div>

      <div className="calendar-layout">
        <div className="calendar-main">
          {mode === 'month' && (
            <MonthGrid
              anchorIso={anchorIso}
              itemsByDate={itemsByDate}
              selectedDate={selectedIso}
              heatLevelsByDate={monthHeatLevelsByDate}
              onSelectDate={(iso) => setSelectedIso(iso)}
            />
          )}
          {mode === 'year' && (
            <YearGrid
              yearIso={anchorIso}
              itemsByDate={itemsByDate}
              onSelectMonth={(monthAnchorIso) => {
                setMode('month');
                setAnchorIso(monthAnchorIso);
                setSelectedIso(monthAnchorIso);
              }}
              onSelectDate={(dateIso) => {
                setMode('month');
                setAnchorIso(dateIso);
                setSelectedIso(dateIso);
              }}
            />
          )}
          {mode === 'week' && (
            <div className="calendar-week">
              <div className="calendar-week-days">
                {enumerateIsoDaysInclusive(range.start, range.end).map((dIso) => {
                  const items = itemsByDate.get(dIso) || [];
                  const isSelected = dIso === selectedIso;
                  const isToday = dIso === todayIsoLocal();

                  const topItems = items.slice(0, 3);

                  return (
                    <button
                      key={dIso}
                      type="button"
                      className={[
                        'calendar-week-day',
                        weekHeatLevelsByDate.get(dIso) ? `calendar-week-day--heat-${weekHeatLevelsByDate.get(dIso)}` : '',
                        isSelected ? 'calendar-week-day--selected' : '',
                        isToday ? 'calendar-week-day--today' : '',
                      ].join(' ')}
                      onClick={() => setSelectedIso(dIso)}
                    >
                      <div className="calendar-week-day-top">
                        <div className="calendar-week-day-label">
                          {parseIsoDateLocal(dIso).toLocaleDateString('en-US', { weekday: 'short' })}
                        </div>
                        <div className="calendar-week-day-date">{parseIsoDateLocal(dIso).getDate()}</div>
                      </div>
                      {topItems.length > 0 && (
                        <div className="calendar-week-day-list">
                          {topItems.map((it, idx) => {
                            const t =
                              it.kind === 'posted'
                                ? it.transaction
                                : ({
                                    ...it.transaction,
                                    isRecurring: true,
                                  } as Transaction);
                            const prefix = it.kind === 'scheduled' ? 'S' : '';
                            const sign = t.type === 'income' ? '+' : '-';
                            return (
                              <div key={`${dIso}-${idx}`} className="calendar-week-day-line">
                                <span className="calendar-week-day-line-left">
                                  {prefix && <span className="calendar-week-day-badge">{prefix}</span>}
                                  <span className="calendar-week-day-desc">{t.description}</span>
                                </span>
                                <span className={`calendar-week-day-amt calendar-week-day-amt--${t.type}`}>
                                  {sign}
                                  {formatCurrency(t.amount)}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      )}
                      <div className="calendar-week-day-bottom">
                        <DayTypeMarkers items={items} />
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          {mode === 'day' && (
            <div className="calendar-day">
              <div className="calendar-day-picker">
                <input
                  type="date"
                  value={anchorIso}
                  onChange={(e) => {
                    const next = clampIsoDate(e.target.value, anchorIso);
                    setAnchorIso(next);
                    setSelectedIso(next);
                  }}
                />
              </div>
              <div style={{ marginTop: '12px' }}>
                <Agenda
                  dateIso={anchorIso}
                  items={itemsByDate.get(anchorIso) || []}
                  buckets={buckets}
                  onEditTransaction={onEditTransaction}
                  onDeleteTransaction={onDeleteTransaction}
                />
              </div>
            </div>
          )}
        </div>

        <div className="calendar-panel">
          <div className="calendar-panel-section">
            <div className="calendar-panel-title">Range summary</div>
            <div style={{ marginBottom: '10px', fontSize: '12px', color: 'var(--text-muted)' }}>
              {rangeCounts.posted} posted • {rangeCounts.scheduled} scheduled
              {includeScheduledInStats ? ' • totals include scheduled' : ' • totals exclude scheduled'}
            </div>
            <div className="calendar-summary-cards">
              <div className="calendar-summary-card">
                <div className="label">Income</div>
                <div className="value income">{formatCurrency(stats.income)}</div>
              </div>
              <div className="calendar-summary-card">
                <div className="label">Expenses</div>
                <div className="value expense">{formatCurrency(stats.expenses)}</div>
              </div>
              <div className="calendar-summary-card">
                <div className="label">Investments</div>
                <div className="value investment">{formatCurrency(stats.investments)}</div>
              </div>
              <div className="calendar-summary-card">
                <div className="label">Net</div>
                <div className={`value ${stats.balance >= 0 ? 'income' : 'expense'}`}>{formatCurrency(stats.balance)}</div>
              </div>
              {mode === 'month' && (
                <div className="calendar-summary-card">
                  <div className="label">Avg spend/day</div>
                  <div className="value">{formatCurrency(avgSpendPerDay)}</div>
                </div>
              )}
            </div>
          </div>

          {stats.bucketBreakdown.length > 0 && (
            <div className="calendar-panel-section">
              <div className="calendar-panel-title">Top buckets (expenses)</div>
              <div className="calendar-bucket-list">
                {stats.bucketBreakdown.slice(0, 6).map((b) => (
                  <div key={b.bucketId} className="calendar-bucket-row">
                    <div className="calendar-bucket-left">
                      <span className="calendar-bucket-color" style={{ backgroundColor: b.bucketColor }} />
                      <span className="calendar-bucket-name">{b.bucketName}</span>
                    </div>
                    <div className="calendar-bucket-total">{formatCurrency(b.total)}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <BudgetProgress budgets={budgets} buckets={buckets} items={rangeItems} mode={mode} anchorIso={anchorIso} />

          <div className="calendar-panel-section">
            <div className="calendar-panel-title">Selected day</div>
            <Agenda
              dateIso={selectedIso}
              items={selectedItems}
              buckets={buckets}
              onEditTransaction={onEditTransaction}
              onDeleteTransaction={onDeleteTransaction}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

