import { toCalendarISO } from '@/lib/ga4/dateRange';

function parseISO(iso) {
  if (!iso) return null;
  const d = new Date(`${String(iso).slice(0, 10)}T00:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Shift an ISO date back N calendar months, keeping the day when possible. */
export function subtractMonthsAligned(iso, monthsBack = 1) {
  const d = parseISO(iso);
  if (!d) return null;
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() - monthsBack);
  const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, lastDay));
  return toCalendarISO(d);
}

/**
 * Same day span, previous month.
 * e.g. 2026-08-01 → 2026-08-13 compares to 2026-07-01 → 2026-07-13
 */
export function previousMonthAlignedRange(from, to) {
  if (!from || !to) return { compareFrom: null, compareTo: null };
  return {
    compareFrom: subtractMonthsAligned(from, 1),
    compareTo: subtractMonthsAligned(to, 1),
  };
}

/**
 * Full previous calendar month relative to the current range's start month.
 * e.g. 2026-08-01 → 2026-08-13 compares to 2026-07-01 → 2026-07-31
 */
export function previousFullMonthRange(from, _to) {
  const start = parseISO(from);
  if (!start) return { compareFrom: null, compareTo: null };
  const y = start.getFullYear();
  const m = start.getMonth(); // 0-based current month
  const prevStart = new Date(y, m - 1, 1);
  const prevEnd = new Date(y, m, 0); // last day of previous month
  return {
    compareFrom: toCalendarISO(prevStart),
    compareTo: toCalendarISO(prevEnd),
  };
}

/**
 * Immediately previous equal-length window (prior period).
 * e.g. 2026-08-01 → 2026-08-13 (13 days) compares to 2026-07-19 → 2026-07-31
 */
export function previousPeriodRange(from, to) {
  const start = parseISO(from);
  const end = parseISO(to);
  if (!start || !end) return { compareFrom: null, compareTo: null };
  const dayMs = 24 * 60 * 60 * 1000;
  const spanDays = Math.max(
    0,
    Math.round((end.getTime() - start.getTime()) / dayMs)
  );
  const compareTo = new Date(start.getTime() - dayMs);
  const compareFrom = new Date(compareTo.getTime() - spanDays * dayMs);
  return {
    compareFrom: toCalendarISO(compareFrom),
    compareTo: toCalendarISO(compareTo),
  };
}

export function monthKeyFromISO(iso) {
  if (!iso) return null;
  return String(iso).slice(0, 7);
}

export function formatMonthKey(yyyyMm) {
  if (!yyyyMm) return '';
  const [y, m] = yyyyMm.split('-').map(Number);
  const d = new Date(y, m - 1, 1);
  return d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

/** Month name heading for a period column (e.g. "February 2026"). */
export function periodMonthLabel(from, to) {
  const a = parseISO(from);
  const b = parseISO(to);
  if (!a) return '';
  if (
    !b
    || (a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear())
  ) {
    return a.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  }
  return formatRangeLabel(from, to);
}

export function formatRangeLabel(from, to) {
  if (!from || !to) return '';
  const a = parseISO(from);
  const b = parseISO(to);
  if (!a || !b) return `${from} – ${to}`;
  const fmt = (d) =>
    d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  if (from === to) return fmt(a);
  if (a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth()) {
    return `${a.toLocaleDateString(undefined, { month: 'short' })} ${a.getDate()}–${b.getDate()}, ${b.getFullYear()}`;
  }
  return `${fmt(a)} – ${fmt(b)}`;
}

export function pctChange(current, previous) {
  const c = Number(current) || 0;
  const p = Number(previous) || 0;
  if (p === 0) return c > 0 ? 100 : 0;
  return Math.round(((c - p) / p) * 100);
}

/** Same calendar span, one year earlier (for column labels). */
export function sameMonthLastYearRange(from, to) {
  return {
    lyFrom: subtractMonthsAligned(from, 12),
    lyTo: subtractMonthsAligned(to, 12),
  };
}

export function sameMonthLastYearLabel(from, to) {
  const { lyFrom, lyTo } = sameMonthLastYearRange(from, to);
  return periodMonthLabel(lyFrom, lyTo);
}

/** Attach MoM-style % delta to donut list rows vs a baseline period. */
export function buildDonutCompareDeltas(currentItems, compareItems) {
  const cmpMap = new Map();
  for (const item of compareItems || []) {
    const key = item.fullName || item.name;
    cmpMap.set(key, Number(item.value) || 0);
  }

  const items = (currentItems || []).map((item) => {
    const key = item.fullName || item.name;
    const cmpVal = cmpMap.get(key) || 0;
    return {
      ...item,
      delta: pctChange(Number(item.value) || 0, cmpVal),
    };
  });

  const curTotal = (currentItems || []).reduce(
    (s, r) => s + (Number(r.value) || 0),
    0
  );
  const cmpTotal = (compareItems || []).reduce(
    (s, r) => s + (Number(r.value) || 0),
    0
  );

  return {
    items,
    totalDelta: pctChange(curTotal, cmpTotal),
  };
}

/**
 * Merge channel breakdown rows for the comparison table.
 * YoY is only current period vs same calendar span one year earlier (ly).
 * MoM is current vs previous compare range (cmp).
 */
export function mergeChannelComparison(currentRows, compareRows, lyCurrentRows) {
  const curMap = new Map();
  const cmpMap = new Map();
  const lyCurMap = new Map();
  const yoyActive = lyCurrentRows != null;

  for (const row of currentRows || []) {
    const key = String(row.channel_bucket ?? '(not set)');
    curMap.set(key, Number(row.views) || 0);
  }
  for (const row of compareRows || []) {
    const key = String(row.channel_bucket ?? '(not set)');
    cmpMap.set(key, Number(row.views) || 0);
  }
  for (const row of lyCurrentRows || []) {
    const key = String(row.channel_bucket ?? '(not set)');
    lyCurMap.set(key, Number(row.views) || 0);
  }

  const keys = new Set([...curMap.keys(), ...cmpMap.keys(), ...lyCurMap.keys()]);

  const rows = [...keys].map((ch) => {
    const cur = curMap.get(ch) || 0;
    const cmp = cmpMap.get(ch) || 0;
    const ly = lyCurMap.get(ch) || 0;
    return {
      ch,
      cur,
      cmp,
      ly,
      delta: pctChange(cur, cmp),
      curYoyDelta: yoyActive ? pctChange(cur, ly) : 0,
    };
  });

  rows.sort((a, b) => b.cur - a.cur || b.cmp - a.cmp || a.ch.localeCompare(b.ch));

  const curTotal = rows.reduce((s, r) => s + r.cur, 0);
  const cmpTotal = rows.reduce((s, r) => s + r.cmp, 0);
  const lyTotal = rows.reduce((s, r) => s + r.ly, 0);

  return {
    rows,
    totals: {
      cur: curTotal,
      cmp: cmpTotal,
      ly: lyTotal,
      delta: pctChange(curTotal, cmpTotal),
      curYoyDelta: yoyActive ? pctChange(curTotal, lyTotal) : 0,
    },
  };
}
