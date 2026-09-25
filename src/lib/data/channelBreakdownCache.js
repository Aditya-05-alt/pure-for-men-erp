/**
 * Session cache for channel breakdown by client + range + page type tab.
 */

const MAX_ENTRIES = 32;
const STALE_MS = 10 * 60 * 1000;
const store = new Map();

export function channelCacheKey(clientId, from, to, pageTypeFilter, suffix = '') {
  return `${clientId}|${from}|${to}|${pageTypeFilter}|v2${suffix}`;
}

export function getChannelBreakdownCache(
  clientId,
  from,
  to,
  pageTypeFilter,
  suffix = ''
) {
  if (!clientId || !from || !to || !pageTypeFilter) return null;
  const k = channelCacheKey(clientId, from, to, pageTypeFilter, suffix);
  const entry = store.get(k);
  if (!entry) return null;
  if (Date.now() - entry.at > STALE_MS) {
    store.delete(k);
    return null;
  }
  return entry.rows;
}

export function setChannelBreakdownCache(
  clientId,
  from,
  to,
  pageTypeFilter,
  rows,
  suffix = ''
) {
  if (!clientId || !from || !to || !pageTypeFilter) return;
  // Skip caching empty results so pipeline/DB backfills show up without waiting 10 min.
  if (!rows?.length) return;
  const k = channelCacheKey(clientId, from, to, pageTypeFilter, suffix);
  if (store.has(k)) store.delete(k);
  store.set(k, { rows: rows || [], at: Date.now() });
  while (store.size > MAX_ENTRIES) {
    const oldest = store.keys().next().value;
    store.delete(oldest);
  }
}

export function hasChannelBreakdownCache(
  clientId,
  from,
  to,
  pageTypeFilter,
  suffix = ''
) {
  return getChannelBreakdownCache(clientId, from, to, pageTypeFilter, suffix) != null;
}
