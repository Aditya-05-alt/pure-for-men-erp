const MAX_ENTRIES = 32;
const STALE_MS = 10 * 60 * 1000;
const store = new Map();

export function topCampaignsCacheKey(clientId, from, to, pageTypeFilter, suffix = '') {
  return `${clientId}|${from}|${to}|${pageTypeFilter}|campaigns-v1${suffix}`;
}

export function getTopCampaignsCache(
  clientId,
  from,
  to,
  pageTypeFilter,
  suffix = ''
) {
  if (!clientId || !from || !to || !pageTypeFilter) return null;
  const entry = store.get(topCampaignsCacheKey(clientId, from, to, pageTypeFilter, suffix));
  if (!entry) return null;
  if (Date.now() - entry.at > STALE_MS) {
    store.delete(topCampaignsCacheKey(clientId, from, to, pageTypeFilter, suffix));
    return null;
  }
  return entry.rows;
}

export function setTopCampaignsCache(
  clientId,
  from,
  to,
  pageTypeFilter,
  rows,
  suffix = ''
) {
  if (!clientId || !from || !to || !pageTypeFilter) return;
  const k = topCampaignsCacheKey(clientId, from, to, pageTypeFilter, suffix);
  if (store.has(k)) store.delete(k);
  store.set(k, { rows: rows || [], at: Date.now() });
  while (store.size > MAX_ENTRIES) {
    store.delete(store.keys().next().value);
  }
}

export function hasTopCampaignsCache(
  clientId,
  from,
  to,
  pageTypeFilter,
  suffix = ''
) {
  return getTopCampaignsCache(clientId, from, to, pageTypeFilter, suffix) != null;
}
