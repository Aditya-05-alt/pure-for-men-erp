/**
 * Fetch WA| session_campaign + date-wise views for one dealer (advance).
 * Uses /api/dashboard/campaign-views_advance → get_wa_campaign_views_advance.
 */
export async function fetchCampaignViews({
  clientId,
  from,
  to,
  pageType = 'ALL',
  onCancelCheck,
}) {
  if (!clientId || !from || !to) {
    return { campaigns: [], daily: [], cells: [] };
  }
  if (typeof window === 'undefined') {
    return { campaigns: [], daily: [], cells: [] };
  }
  if (onCancelCheck?.()) return null;

  const qs = new URLSearchParams({
    clientId: String(clientId).trim(),
    from: String(from).slice(0, 10),
    to: String(to).slice(0, 10),
    pageType: String(pageType || 'ALL'),
  });

  const res = await fetch(`/api/dashboard/campaign-views_advance?${qs}`, {
    credentials: 'same-origin',
  });
  const json = await res.json().catch(() => ({}));
  if (onCancelCheck?.()) return null;

  if (!res.ok) {
    throw new Error(json.error || `Campaign views failed (${res.status})`);
  }

  return {
    campaigns: Array.isArray(json.campaigns) ? json.campaigns : [],
    daily: Array.isArray(json.daily) ? json.daily : [],
    cells: Array.isArray(json.cells) ? json.cells : [],
  };
}
