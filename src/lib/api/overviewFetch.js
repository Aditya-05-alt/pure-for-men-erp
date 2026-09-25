import { createClient } from '@/lib/supabase/client';
import { rpcByDateChunks } from '@/lib/api/chunkedRpc';

async function fetchOverviewViaApi({ clientId, from, to, onCancelCheck }) {
  if (typeof window === 'undefined') return null;
  if (onCancelCheck?.()) return null;

  const qs = new URLSearchParams({ clientId, from, to });
  const res = await fetch(`/api/dashboard/overview?${qs}`, { credentials: 'same-origin' });
  const json = await res.json().catch(() => ({}));

  if (onCancelCheck?.()) return null;
  if (!res.ok) {
    if (res.status === 503) return null;
    throw new Error(json.error || `Overview request failed (${res.status})`);
  }

  return {
    rows: json.rows || [],
    userTotalsRows: json.userTotalsRows || [],
  };
}

async function fetchOverviewViaClient({ clientId, from, to, onCancelCheck }) {
  const supabase = createClient();
  if (!supabase) throw new Error('Supabase is not configured.');

  const chunkOpts = { clientId, from, to, onCancelCheck };

  const rows = await rpcByDateChunks(supabase, 'get_ga4_overview', chunkOpts);
  if (onCancelCheck?.()) return null;

  let userTotalsRows = [];
  try {
    userTotalsRows = await rpcByDateChunks(supabase, 'get_ga4_user_totals', chunkOpts);
  } catch {
    userTotalsRows = [];
  }

  if (onCancelCheck?.()) return null;

  return {
    rows: rows || [],
    userTotalsRows: userTotalsRows || [],
  };
}

/** Overview bundle — chunked 5-day RPC windows (All tab + KPI chart). */
export async function fetchOverviewBundle({ clientId, from, to, onCancelCheck }) {
  if (!clientId || !from || !to) {
    return { rows: [], userTotalsRows: [] };
  }

  try {
    const viaApi = await fetchOverviewViaApi({ clientId, from, to, onCancelCheck });
    if (viaApi) return viaApi;
  } catch (err) {
    if (onCancelCheck?.()) return null;
    const viaClient = await fetchOverviewViaClient({ clientId, from, to, onCancelCheck });
    if (viaClient) return viaClient;
    throw err;
  }

  return fetchOverviewViaClient({ clientId, from, to, onCancelCheck });
}
