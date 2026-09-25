/** Local calendar YYYY-MM-DD (avoids UTC shift from toISOString). */
export function toCalendarISO(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function toDateOnly(d) {
  return toCalendarISO(d);
}

/** Date column headers between from and to (inclusive), newest first. */
export function getGa4DateColumnsInRange(fromIso, toIso) {
  const from = new Date(`${fromIso}T00:00:00`);
  const to = new Date(`${toIso}T00:00:00`);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return [];

  const start = from <= to ? from : to;
  const end = from <= to ? to : from;
  const cols = [];
  const cur = new Date(end);
  while (cur >= start) {
    cols.push(toDateOnly(cur));
    cur.setDate(cur.getDate() - 1);
  }
  return cols;
}

/** Default last N calendar days including today. */
export function getDefaultGa4DateRange(dayCount = GA4_DEFAULT_DAYS) {
  const to = new Date();
  to.setHours(0, 0, 0, 0);
  const from = new Date(to);
  from.setDate(from.getDate() - (dayCount - 1));
  return { from: toDateOnly(from), to: toDateOnly(to) };
}

export const GA4_DEALERS_PAGE_SIZE = 20;
export const GA4_DEFAULT_DAYS = 10;

/** Every ISO date from `from` through `to` inclusive (ascending). */
export function enumerateDatesInclusive(fromIso, toIso) {
  const out = [];
  if (!fromIso || !toIso) return out;
  const start = new Date(`${fromIso}T00:00:00`);
  const end = new Date(`${toIso}T00:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return out;
  const cur = new Date(start);
  while (cur <= end) {
    out.push(toDateOnly(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}

export function dayCountInclusive(fromIso, toIso) {
  return enumerateDatesInclusive(fromIso, toIso).length;
}

/** Split inclusive range into { from, to } chunks (e.g. 5 days per RPC). */
export function chunkDateRangesInclusive(fromIso, toIso, chunkSize = 5) {
  const days = enumerateDatesInclusive(fromIso, toIso);
  if (!days.length || chunkSize < 1) return [];
  const ranges = [];
  for (let i = 0; i < days.length; i += chunkSize) {
    const slice = days.slice(i, i + chunkSize);
    ranges.push({ from: slice[0], to: slice[slice.length - 1] });
  }
  return ranges;
}
