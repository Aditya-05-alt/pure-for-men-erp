export async function fetchDailySyncStatus({ from, to }) {
  const qs = new URLSearchParams({ from, to });
  const res = await fetch(`/api/admin/daily-sync?${qs}`, {
    credentials: 'same-origin',
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || 'Failed to load daily sync status.');
  return json;
}
