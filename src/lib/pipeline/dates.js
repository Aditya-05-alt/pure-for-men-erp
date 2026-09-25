const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function todayISO() {
  return new Date().toISOString().split('T')[0];
}

export function isValidISODate(s) {
  if (!ISO_DATE_RE.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return (
    dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d
  );
}

export function normalizeDateInput(v) {
  const s = String(v ?? '').trim().toLowerCase();
  if (!s || s === 'today') return todayISO();
  const slice = s.slice(0, 10);
  return isValidISODate(slice) ? slice : todayISO();
}

/** Calendar day N days before `endIso` (default today). */
export function daysAgoISO(n, endIso = todayISO()) {
  const end = normalizeDateInput(endIso);
  const d = new Date(`${end}T00:00:00`);
  if (Number.isNaN(d.getTime())) return end;
  d.setDate(d.getDate() - Math.max(0, n));
  return d.toISOString().split('T')[0];
}

function toCalendarISO(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function enumerateDates(fromIso, toIso) {
  const out = [];
  if (!fromIso || !toIso) return out;

  let startIso = fromIso;
  let endIso = toIso;
  if (startIso > endIso) {
    [startIso, endIso] = [endIso, startIso];
  }

  const start = new Date(`${startIso}T12:00:00`);
  const end = new Date(`${endIso}T12:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return out;

  const cur = new Date(start);
  while (cur <= end) {
    out.push(toCalendarISO(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}

/** Normalize, swap if needed, and list inclusive calendar days. */
export function coerceDateRange(fromRaw, toRaw) {
  const from = normalizeDateInput(fromRaw);
  const to = normalizeDateInput(toRaw ?? todayISO());
  let start = from;
  let end = to;
  if (start > end) {
    [start, end] = [end, start];
  }
  const dates = enumerateDates(start, end);
  return { from: start, to: end, dates };
}

/** Days per pipeline stats views request (avoids Supabase RPC timeout). */
export const STATS_VIEWS_CHUNK_SIZE = 5;

/** Split inclusive date list into chunks (e.g. 5 days per Step 1 API call). */
export function chunkDates(dates, chunkSize = 5) {
  if (!dates?.length || chunkSize < 1) return [];
  const out = [];
  for (let i = 0; i < dates.length; i += chunkSize) {
    out.push(dates.slice(i, i + chunkSize));
  }
  return out;
}

/** Inclusive day count for a From → To picker (min 1). */
export function daysBackFromRange(fromIso, toIso) {
  const { dates } = coerceDateRange(fromIso, toIso);
  return Math.min(Math.max(dates.length, 1), 90);
}

/**
 * Legacy cron RPC apply_vdp_filtration uses:
 *   report_date >= (CURRENT_DATE - p_days_back)
 * Admin Step 2 uses apply_vdp_filtration_range(p_from, p_to) instead.
 */
export function daysBackForVdpFiltration(fromIso, toIso) {
  const today = todayISO();
  const { from } = coerceDateRange(fromIso, toIso);
  const todayD = new Date(`${today}T12:00:00`);
  const fromD = new Date(`${from}T12:00:00`);
  if (Number.isNaN(fromD.getTime())) {
    return daysBackFromRange(fromIso, toIso);
  }
  const days = Math.round((todayD - fromD) / (24 * 60 * 60 * 1000));
  return Math.min(Math.max(days, 0), 365);
}

/** Days from `fromIso` through today — legacy RPC (CURRENT_DATE - p_days_back). */
export function daysBackFromDateToToday(fromIso) {
  const from = normalizeDateInput(fromIso);
  const today = todayISO();
  const start = new Date(`${from}T12:00:00`);
  const end = new Date(`${today}T12:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return daysBackFromRange(from, today);
  }
  const diff = Math.ceil((end - start) / (24 * 60 * 60 * 1000));
  // +1 buffer so CURRENT_DATE - p_days_back never excludes the first selected day
  return Math.min(Math.max(diff + 1, 1), 365);
}

/**
 * Fallback p_days_back when RPC has no p_date_from / p_date_to.
 * Ensures the full UI range [from, to] is covered vs Supabase CURRENT_DATE.
 */
export function daysBackForFinalSync(fromIso, toIso) {
  const today = todayISO();
  const { from, to } = coerceDateRange(fromIso, toIso);
  const todayD = new Date(`${today}T12:00:00`);
  const fromD = new Date(`${from}T12:00:00`);
  const toD = new Date(`${to}T12:00:00`);
  const endD = toD > todayD ? todayD : toD;

  if (Number.isNaN(fromD.getTime()) || Number.isNaN(endD.getTime())) {
    return daysBackFromRange(from, to);
  }

  const daysFromTodayToFrom = Math.ceil((todayD - fromD) / (24 * 60 * 60 * 1000));
  const rangeSpan = Math.ceil((endD - fromD) / (24 * 60 * 60 * 1000)) + 1;

  return Math.min(Math.max(daysFromTodayToFrom + 1, rangeSpan, 1), 365);
}
