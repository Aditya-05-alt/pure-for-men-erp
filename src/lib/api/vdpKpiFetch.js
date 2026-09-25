import { normalizeReportDate } from '@/lib/ga4/aggregatePageDataRows';
import { fetchFinalDataDailyChunked } from '@/lib/api/vdpFinalDataFetch';

export function buildVdpKpiRpcParams(clientId, from, to, invParams = {}) {
  return {
    p_client_id: String(clientId).trim(),
    p_from: String(from).slice(0, 10),
    p_to: String(to).slice(0, 10),
    p_types: invParams.p_types ?? null,
    p_makes: invParams.p_makes ?? null,
    p_models: invParams.p_models ?? null,
    p_locations: invParams.p_locations ?? null,
    p_years: invParams.p_years ?? null,
    p_condition: invParams.p_condition ?? 'BOTH',
  };
}

export function dailyRowsToMap(rows) {
  const daily = {};
  for (const row of rows || []) {
    const day = normalizeReportDate(row.report_date);
    const views = Number(row.views) || 0;
    if (!day || views === 0) continue;
    daily[day] = (daily[day] || 0) + views;
  }
  return daily;
}

function parseTotalRpcResult(data) {
  if (data == null) return 0;
  if (typeof data === 'number') return data;
  if (Array.isArray(data)) {
    const row = data[0];
    if (row == null) return 0;
    if (typeof row === 'number') return row;
    return Number(row.total ?? row.get_vdp_views_total ?? 0) || 0;
  }
  if (typeof data === 'object') {
    return Number(data.total ?? 0) || 0;
  }
  return Number(data) || 0;
}

function isMissingRpcError(error) {
  const msg = error?.message || '';
  return (
    error?.code === '42883'
    || /function.*does not exist|could not find the function|schema cache/i.test(msg)
  );
}

function emitProgress(onProgress, payload, meta) {
  if (onProgress) onProgress(payload, meta);
}

/**
 * VDP KPI via get_vdp_views_total + get_vdp_views_by_date (parallel).
 * Falls back to build_date_wise_final_data chunking when RPCs are not deployed yet.
 */
export async function fetchVdpKpiFiltered(
  supabase,
  {
    clientId,
    from,
    to,
    invParams = {},
    onCancelCheck,
    onProgress,
  } = {}
) {
  if (!supabase || !clientId || !from || !to) {
    return { daily: {}, total: 0 };
  }
  if (onCancelCheck?.()) return null;

  const params = buildVdpKpiRpcParams(clientId, from, to, invParams);
  let total = 0;
  let daily = {};

  try {
    const totalPromise = supabase.rpc('get_vdp_views_total', params).then(({ data, error }) => {
      if (error) throw error;
      if (onCancelCheck?.()) return null;
      total = parseTotalRpcResult(data);
      emitProgress(
        onProgress,
        { daily: { ...daily }, total },
        { completed: 1, total: 2, part: 'total' }
      );
      return total;
    });

    const dailyPromise = supabase.rpc('get_vdp_views_by_date', params).then(({ data, error }) => {
      if (error) throw error;
      if (onCancelCheck?.()) return null;
      daily = dailyRowsToMap(data);
      emitProgress(
        onProgress,
        { daily, total },
        { completed: 2, total: 2, part: 'daily' }
      );
      return daily;
    });

    await Promise.all([totalPromise, dailyPromise]);

    if (onCancelCheck?.()) return null;
    return { daily, total };
  } catch (error) {
    if (!isMissingRpcError(error)) throw error;
  }

  return fetchFinalDataDailyChunked(supabase, {
    clientId,
    from,
    to,
    invParams,
    onCancelCheck,
    onBatch: (partial, meta) => {
      if (onCancelCheck?.()) return;
      emitProgress(onProgress, partial, meta);
    },
  });
}
