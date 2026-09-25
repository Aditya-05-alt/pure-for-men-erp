async function getJson(url) {
  const res = await fetch(url, { credentials: 'same-origin' });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(json.error || `Vehicle age request failed (${res.status})`);
  }
  return json;
}

export async function fetchVehicleAgeVins({ dealer, clientId, q } = {}) {
  const qs = new URLSearchParams({ mode: 'vins' });
  if (dealer) qs.set('dealer', String(dealer).trim());
  if (clientId) qs.set('clientId', String(clientId).trim());
  if (q) qs.set('q', String(q).trim());
  return getJson(`/api/dashboard/vehicle-age?${qs}`);
}

export async function fetchVehicleAgeCalendar({
  dealer,
  clientId,
  vin,
  from,
  to,
} = {}) {
  const qs = new URLSearchParams({
    mode: 'calendar',
    vin: String(vin || '').trim(),
    from: String(from || '').slice(0, 10),
    to: String(to || '').slice(0, 10),
  });
  if (dealer) qs.set('dealer', String(dealer).trim());
  if (clientId) qs.set('clientId', String(clientId).trim());
  return getJson(`/api/dashboard/vehicle-age?${qs}`);
}

/** Inclusive YYYY-MM-DD list (capped). */
export function eachDateInclusive(from, to, maxDays = 92) {
  const start = String(from || '').slice(0, 10);
  const end = String(to || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) {
    return [];
  }
  if (start > end) return [];
  const out = [];
  let cur = start;
  while (cur <= end && out.length < maxDays) {
    out.push(cur);
    const [y, m, d] = cur.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    dt.setUTCDate(dt.getUTCDate() + 1);
    cur = dt.toISOString().slice(0, 10);
  }
  return out;
}

export function formatRangeLabel(from, to) {
  const a = String(from || '').slice(0, 10);
  const b = String(to || '').slice(0, 10);
  if (!a || !b) return '—';
  return a === b ? a : `${a} → ${b}`;
}

export function dayHeaderLabel(ymd) {
  const date = String(ymd || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return date;
  return date.slice(5); // MM-DD — compact for matrix headers
}
