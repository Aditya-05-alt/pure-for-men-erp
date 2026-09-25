/**
 * Lightweight New / Used / Unknown totals for All Dealers KPI.
 * Uses get_all_dealers_condition_totals_advance (not the channel matrix).
 */

function dealerClientIds(dealers) {
  return (dealers || [])
    .filter((d) => d?.name)
    .map((d) => String(d.ga4CustomerId || '').trim())
    .filter(Boolean);
}

/**
 * @returns {Promise<Array<{ client_id: string, condition_bucket: string, views: number }>>}
 */
export async function fetchAllDealersConditionTotals({
  dealers,
  from,
  to,
  channel = null,
  onCancelCheck,
}) {
  if (typeof window === 'undefined') return [];
  if (!from || !to) return [];
  if (onCancelCheck?.()) return [];

  const allowed = new Set(dealerClientIds(dealers));
  const qs = new URLSearchParams({ from, to });
  if (channel && channel !== 'all') qs.set('channel', channel);
  // Avoid huge query strings: omit clientId and filter to portfolio on the client.

  const res = await fetch(
    `/api/dashboard/all-dealers-condition-totals?${qs}`,
    { credentials: 'same-origin' }
  );
  const json = await res.json().catch(() => ({}));

  if (onCancelCheck?.()) return [];
  if (!res.ok) {
    throw new Error(
      json.error || `Condition totals request failed (${res.status})`
    );
  }

  return (json.data || [])
    .map((row) => ({
      client_id: String(row.client_id ?? '').trim(),
      condition_bucket: String(row.condition_bucket ?? '').trim(),
      views: Math.round(Number(row.views) || 0),
    }))
    .filter((row) => row.client_id && (!allowed.size || allowed.has(row.client_id)));
}
