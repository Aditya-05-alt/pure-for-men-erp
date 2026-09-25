/**
 * Admin GA4 matrix — server route (service role preferred; anon cannot read dealer list under RLS).
 */
export async function fetchAdminGa4Matrix({ from, to, signal }) {
  const qs = new URLSearchParams({ from, to });
  const res = await fetch(`/api/admin/ga4-matrix?${qs}`, { signal, credentials: 'same-origin' });

  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(json.error || `Request failed (${res.status})`);
  }

  return {
    dealers: json.dealers || [],
    viewsByDealerId: json.viewsByDealerId || {},
  };
}
