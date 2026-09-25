/**
 * Session cache for VDP daily totals + chart series (client + range + filters).
 */

const MAX_ENTRIES = 48;
const STALE_MS = 10 * 60 * 1000;
const store = new Map();

export function vdpDailyCacheKey(clientId, from, to, suffix = '') {
  return `${clientId}|${from}|${to}|v1${suffix}`;
}

export function getVdpDailyCache(clientId, from, to, suffix = '') {
  if (!clientId || !from || !to) return null;
  const k = vdpDailyCacheKey(clientId, from, to, suffix);
  const entry = store.get(k);
  if (!entry) return null;
  if (Date.now() - entry.at > STALE_MS) {
    store.delete(k);
    return null;
  }
  return entry.data;
}

export function setVdpDailyCache(clientId, from, to, suffix, data) {
  if (!clientId || !from || !to || !data) return;
  const k = vdpDailyCacheKey(clientId, from, to, suffix);
  if (store.has(k)) store.delete(k);
  store.set(k, { data, at: Date.now() });
  while (store.size > MAX_ENTRIES) {
    const oldest = store.keys().next().value;
    store.delete(oldest);
  }
}

export function hasVdpDailyCache(clientId, from, to, suffix = '') {
  return getVdpDailyCache(clientId, from, to, suffix) != null;
}
