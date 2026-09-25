/**
 * In-memory LRU cache for overview GA4 row payloads.
 * Keys: `${clientId}|${from}|${to}` — survives tab/date toggles within a session.
 */

const MAX_ENTRIES = 12;
const STALE_MS = 5 * 60 * 1000;
const store = new Map();

function key(clientId, from, to) {
  return `${clientId}|${from}|${to}`;
}

export function getOverviewCache(clientId, from, to) {
  if (!clientId || !from || !to) return null;
  const k = key(clientId, from, to);
  const entry = store.get(k);
  if (!entry) return null;
  if (Date.now() - entry.at > STALE_MS) {
    store.delete(k);
    return null;
  }
  return entry;
}

export function setOverviewCache(clientId, from, to, payload) {
  if (!clientId || !from || !to) return;
  const k = key(clientId, from, to);
  if (store.has(k)) store.delete(k);
  store.set(k, { ...payload, at: Date.now() });
  while (store.size > MAX_ENTRIES) {
    const oldest = store.keys().next().value;
    store.delete(oldest);
  }
}

export function clearOverviewCacheForClient(clientId) {
  if (!clientId) return;
  const prefix = `${clientId}|`;
  for (const k of [...store.keys()]) {
    if (k.startsWith(prefix)) store.delete(k);
  }
}
