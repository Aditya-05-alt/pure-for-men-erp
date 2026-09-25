/**
 * Fetch Page Views report for Pure for Men (chipper_pfm_ga4_data).
 * @param {'all'|'product'} [scope='all']
 */
export async function fetchPfmPageViews({
  from,
  to,
  priorFrom,
  priorTo,
  clientId = '001',
  limit = 50,
  scope = 'all',
  signal,
}) {
  const qs = new URLSearchParams({
    from,
    to,
    priorFrom,
    priorTo,
    clientId,
    limit: String(limit),
    scope: scope === 'product' ? 'product' : 'all',
  });
  const res = await fetch(`/api/pfm/page-views?${qs}`, { signal });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(json?.error || `Page views request failed (${res.status})`);
  }
  return json;
}
