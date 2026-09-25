import { createClient } from '@/lib/supabase/client';
import { sanitizeVdpLocationOptions } from '@/lib/vdp/locationFilterOptions';
import { fetchChannelBreakdownBundle } from '@/lib/api/channelBreakdownFetch';
import { fetchTopCampaignsBundle } from '@/lib/api/topCampaignsFetch';
import { aggregateLocationBuckets } from '@/lib/api/locationBreakdownAggregate';
import { rpcByDateChunks } from '@/lib/api/chunkedRpc';
import { fetchVdpKpiFiltered } from '@/lib/api/vdpKpiFetch';
import {
  getVdpDailyCache,
  setVdpDailyCache,
} from '@/lib/data/vdpDailyCache';
import {
  vdpRpcExtraParams,
  vdpFilterCacheSuffix,
  appendInvParamsToSearchParams,
  appendVdpFiltersToSearchParams,
} from '@/lib/vdp/vdpFilterParams';

const FINAL_DATA_TABLE = 'smart_final_data';
const LOCATION_PAGE_SIZE = 5000;

function isMissingRpcError(error) {
  const msg = String(error?.message ?? error ?? '');
  return /function.*does not exist|could not find the function|schema cache/i.test(msg);
}

async function rpcLocationBreakdown(supabase, params) {
  let result = await supabase.rpc('get_dealer_location_breakdown', params);
  if (result.error && isMissingRpcError(result.error)) {
    result = await supabase.rpc('get_location_breakdown', params);
  }
  return result;
}

/**
 * GA4 OVERVIEW API
 * ----------------
 * IMPORTANT: never sum total_users / sessions / new_users from smart_ga4_page_data —
 * those are session-scoped metrics that get inflated when joined with page dimensions.
 * Use smart_ga4_data for user/session totals via fetchUserTotals().
 * Use smart_ga4_page_data only for views and per-page aggregations.
 */
export async function fetchOverviewRows({ clientId, from, to, onCancelCheck }) {
  const supabase = createClient();
  if (!supabase) throw new Error('Supabase is not configured.');
  return rpcByDateChunks(supabase, 'get_ga4_overview', {
    clientId,
    from,
    to,
    onCancelCheck,
  });
}

export async function fetchUserTotals({ clientId, from, to, onCancelCheck }) {
  const supabase = createClient();
  if (!supabase) throw new Error('Supabase is not configured.');
  return rpcByDateChunks(supabase, 'get_ga4_user_totals', {
    clientId,
    from,
    to,
    onCancelCheck,
  });
}

export async function fetchChannelBreakdown({
  clientId,
  from,
  to,
  pageTypeFilter = 'VDP',
  vdpFilters,
  tab = 'all',
  onCancelCheck,
}) {
  return fetchChannelBreakdownBundle({
    clientId,
    from,
    to,
    pageTypeFilter,
    vdpFilters,
    tab,
    onCancelCheck,
  });
}

async function fetchVdpFilterOptionsViaApi({ clientId, from, to, onCancelCheck }) {
  if (typeof window === 'undefined') return null;
  if (onCancelCheck?.()) return null;

  const qs = new URLSearchParams({
    clientId: String(clientId).trim(),
    from: toDateOnly(from),
    to: toDateOnly(to),
  });
  const res = await fetch(`/api/dashboard/vdp-filter-options?${qs}`, {
    credentials: 'same-origin',
  });
  const json = await res.json().catch(() => ({}));

  if (onCancelCheck?.()) return null;
  if (!res.ok) {
    if (res.status === 503) return null;
    throw new Error(json.error || `VDP filter options request failed (${res.status})`);
  }

  return json;
}

/** Distinct VDP filter dropdown values for dealer + date range. */
export async function fetchVdpFilterOptions({ clientId, from, to, onCancelCheck }) {
  if (!clientId || !from || !to) return null;
  if (onCancelCheck?.()) return null;

  try {
    const viaApi = await fetchVdpFilterOptionsViaApi({ clientId, from, to, onCancelCheck });
    if (viaApi) {
      return {
        ...viaApi,
        locations: sanitizeVdpLocationOptions(viaApi.locations),
      };
    }
  } catch {
    // fall through to direct RPC
  }

  const supabase = createClient();
  if (!supabase) throw new Error('Supabase is not configured.');
  if (onCancelCheck?.()) return null;

  const { data, error } = await supabase.rpc('get_vdp_filter_options', {
    p_client_id: String(clientId).trim(),
    p_from: toDateOnly(from),
    p_to: toDateOnly(to),
  });

  if (error) throw new Error(error.message || 'Failed to load VDP filter options.');

  const row = Array.isArray(data) ? data[0] : data;
  const asList = (key) => {
    const raw = row?.[key];
    return Array.isArray(raw) ? raw.filter(Boolean) : [];
  };

  return {
    years: ['All', ...asList('years')],
    makes: ['All', ...asList('makes')],
    models: ['All', ...asList('models')],
    locations: sanitizeVdpLocationOptions(['All', ...asList('locations')]),
    types: ['All', ...asList('types')],
  };
}

async function fetchVdpDailyFilteredViaApi({
  clientId,
  from,
  to,
  vdpFilters,
  tab,
  onCancelCheck,
}) {
  if (typeof window === 'undefined') return null;
  if (onCancelCheck?.()) return null;

  const qs = new URLSearchParams({
    clientId: String(clientId).trim(),
    from: toDateOnly(from),
    to: toDateOnly(to),
  });
  appendVdpFiltersToSearchParams(qs, vdpFilters, tab);

  const res = await fetch(`/api/dashboard/vdp-daily?${qs}`, { credentials: 'same-origin' });
  const json = await res.json().catch(() => ({}));

  if (onCancelCheck?.()) return null;
  if (!res.ok) {
    if (res.status === 503) return null;
    throw new Error(json.error || `VDP daily request failed (${res.status})`);
  }

  return {
    daily: json.daily || {},
    total: Number(json.total) || 0,
  };
}

/** Daily VDP views from smart_final_data (combined inventory filters). */
export async function fetchVdpDailyFiltered({
  clientId,
  from,
  to,
  vdpFilters,
  tab = 'vdp',
  onCancelCheck,
  onProgress,
  skipCache = false,
}) {
  if (!clientId || !from || !to) return null;
  if (onCancelCheck?.()) return null;

  const cacheSuffix = vdpFilterCacheSuffix(vdpFilters, tab);

  if (!skipCache) {
    const cached = getVdpDailyCache(clientId, from, to, cacheSuffix);
    if (cached) {
      onProgress?.(cached, { completed: 1, total: 1, fromCache: true });
      return cached;
    }
  }

  const inv = vdpRpcExtraParams(vdpFilters, tab);

  const supabase = createClient();
  if (supabase) {
    try {
      const result = await fetchVdpKpiFiltered(supabase, {
        clientId,
        from,
        to,
        invParams: inv,
        onCancelCheck,
        onProgress,
      });

      if (onCancelCheck?.()) return null;
      if (result) {
        if (!skipCache) {
          setVdpDailyCache(clientId, from, to, cacheSuffix, result);
        }
        return result;
      }
    } catch {
      // fall through to server API
    }
  }

  try {
    const viaApi = await fetchVdpDailyFilteredViaApi({
      clientId,
      from,
      to,
      vdpFilters,
      tab,
      onCancelCheck,
    });
    if (viaApi) {
      onProgress?.(viaApi, { completed: 1, total: 1, fromServer: true });
      if (!skipCache) {
        setVdpDailyCache(clientId, from, to, cacheSuffix, viaApi);
      }
      return viaApi;
    }
  } catch {
    // exhausted fallbacks
  }

  throw new Error('Failed to load VDP daily views.');
}

/** @deprecated use fetchVdpDailyFiltered */
export async function fetchVdpDailyByYear(opts) {
  return fetchVdpDailyFiltered(opts);
}

export async function fetchMakeBreakdown({
  clientId,
  from,
  to,
  limit = null,
  vdpFilters,
  tab = 'vdp',
  onCancelCheck,
}) {
  const supabase = createClient();
  if (!supabase) throw new Error('Supabase is not configured.');
  if (onCancelCheck?.()) return null;

  const params = {
    p_client_id: String(clientId).trim(),
    p_from: toDateOnly(from),
    p_to: toDateOnly(to),
    p_limit: limit,
    ...vdpRpcExtraParams(vdpFilters, tab),
  };

  const { data, error } = await supabase.rpc('get_make_breakdown', params);

  if (error) throw new Error(error.message || 'Failed to fetch make breakdown.');
  return data || [];
}

/** Type breakdown from smart_final_data (VDP tab only). */
export async function fetchTypeBreakdown({
  clientId,
  from,
  to,
  limit = null,
  vdpFilters,
  tab = 'vdp',
  onCancelCheck,
}) {
  const supabase = createClient();
  if (!supabase) throw new Error('Supabase is not configured.');
  if (onCancelCheck?.()) return null;

  const { data, error } = await supabase.rpc('get_type_breakdown', {
    p_client_id: String(clientId).trim(),
    p_from: toDateOnly(from),
    p_to: toDateOnly(to),
    p_limit: limit,
    ...vdpRpcExtraParams(vdpFilters, tab),
  });

  if (error) throw new Error(error.message || 'Failed to fetch type breakdown.');
  return data || [];
}

/** Model breakdown from smart_final_data (VDP tab only). */
export async function fetchModelBreakdown({
  clientId,
  from,
  to,
  limit = null,
  vdpFilters,
  tab = 'vdp',
  onCancelCheck,
}) {
  const supabase = createClient();
  if (!supabase) throw new Error('Supabase is not configured.');
  if (onCancelCheck?.()) return null;

  const { data, error } = await supabase.rpc('get_model_breakdown', {
    p_client_id: String(clientId).trim(),
    p_from: toDateOnly(from),
    p_to: toDateOnly(to),
    p_limit: limit,
    ...vdpRpcExtraParams(vdpFilters, tab),
  });

  if (error) throw new Error(error.message || 'Failed to fetch model breakdown.');
  return data || [];
}

/** Year breakdown from smart_final_data (VDP tab only). */
export async function fetchYearBreakdown({
  clientId,
  from,
  to,
  limit = null,
  vdpFilters,
  tab = 'vdp',
  onCancelCheck,
}) {
  const supabase = createClient();
  if (!supabase) throw new Error('Supabase is not configured.');
  if (onCancelCheck?.()) return null;

  const { data, error } = await supabase.rpc('get_year_breakdown', {
    p_client_id: String(clientId).trim(),
    p_from: toDateOnly(from),
    p_to: toDateOnly(to),
    p_limit: limit,
    ...vdpRpcExtraParams(vdpFilters, tab),
  });

  if (error) throw new Error(error.message || 'Failed to fetch year breakdown.');
  return data || [];
}

/** Condition breakdown from smart_final_data (VDP tab only). */
export async function fetchConditionBreakdown({
  clientId,
  from,
  to,
  limit = null,
  vdpFilters,
  tab = 'vdp',
  onCancelCheck,
}) {
  const supabase = createClient();
  if (!supabase) throw new Error('Supabase is not configured.');
  if (onCancelCheck?.()) return null;

  const { data, error } = await supabase.rpc('get_condition_breakdown', {
    p_client_id: String(clientId).trim(),
    p_from: toDateOnly(from),
    p_to: toDateOnly(to),
    p_limit: limit,
    ...vdpRpcExtraParams(vdpFilters, tab),
  });

  if (error) throw new Error(error.message || 'Failed to fetch condition breakdown.');
  return data || [];
}

/** All campaigns by views from smart_ga4_page_data (merged across date chunks). */
export async function fetchTopCampaigns({
  clientId,
  from,
  to,
  pageTypeFilter = 'ALL',
  vdpFilters,
  tab = 'all',
  onCancelCheck,
}) {
  return fetchTopCampaignsBundle({
    clientId,
    from,
    to,
    pageTypeFilter,
    vdpFilters,
    tab,
    onCancelCheck,
  });
}

function toDateOnly(value) {
  if (!value) return value;
  return String(value).slice(0, 10);
}

function normalizeLocationRows(data) {
  const list = Array.isArray(data) ? data : data ? [data] : [];
  return list.map((row) => ({
    location_bucket: String(
      row.location_bucket ?? row.location ?? row.inv_location ?? ''
    ),
    views: Number(row.views ?? row.view_count ?? 0) || 0,
    pct: Number(row.pct ?? row.percentage ?? 0) || 0,
    rank: Number(row.rank ?? row.rn ?? 999) || 999,
  }));
}

async function fetchLocationFromTable(supabase, params, onCancelCheck) {
  let offset = 0;
  const buffer = [];

  while (true) { // eslint-disable-line no-constant-condition
    if (onCancelCheck?.()) return undefined;

    const { data, error } = await supabase
      .from(FINAL_DATA_TABLE)
      .select('inv_location, views')
      .eq('client_id', params.p_client_id)
      .gte('report_date', params.p_from)
      .lte('report_date', params.p_to)
      .range(offset, offset + LOCATION_PAGE_SIZE - 1);

    if (error) return null;
    if (!data?.length) break;

    buffer.push(...data);
    if (data.length < LOCATION_PAGE_SIZE) break;
    offset += LOCATION_PAGE_SIZE;
  }

  return aggregateLocationBuckets(buffer);
}

/** Server route using service role when anon RPC returns [] (RLS). */
async function fetchLocationBreakdownViaApi(params, onCancelCheck) {
  if (onCancelCheck?.()) return undefined;
  if (typeof window === 'undefined') return null;

  const qs = new URLSearchParams({
    clientId: params.p_client_id,
    from: params.p_from,
    to: params.p_to,
  });
  appendInvParamsToSearchParams(qs, params);

  try {
    const res = await fetch(`/api/dashboard/location-breakdown?${qs}`);
    if (!res.ok) return null;
    const json = await res.json();
    if (onCancelCheck?.()) return undefined;
    return normalizeLocationRows(json.data);
  } catch {
    return null;
  }
}

/**
 * Location breakdown — get_dealer_location_breakdown RPC (configured locations table).
 * Falls back to get_location_breakdown, server API, then direct table read if needed.
 */
export async function fetchLocationBreakdown({
  clientId,
  from,
  to,
  limit = null,
  vdpFilters,
  tab = 'vdp',
  onCancelCheck,
}) {
  const supabase = createClient();
  if (!supabase) throw new Error('Supabase is not configured.');
  if (onCancelCheck?.()) return undefined;

  const params = {
    p_client_id: String(clientId).trim(),
    p_from: toDateOnly(from),
    p_to: toDateOnly(to),
    p_limit: limit,
    ...vdpRpcExtraParams(vdpFilters, tab),
  };

  const { data, error } = await rpcLocationBreakdown(supabase, params);

  if (error) throw new Error(error.message || 'Failed to fetch location breakdown.');
  if (onCancelCheck?.()) return undefined;

  const rpcRows = normalizeLocationRows(data);
  if (rpcRows.length > 0) return rpcRows;

  const apiRows = await fetchLocationBreakdownViaApi(params, onCancelCheck);
  if (onCancelCheck?.()) return undefined;
  if (apiRows?.length) return apiRows;

  const tableRows = await fetchLocationFromTable(supabase, params, onCancelCheck);
  if (onCancelCheck?.()) return undefined;
  if (tableRows?.length) return tableRows;

  return rpcRows;
}

/** Active dealers from smart_hoot_config (same source as ClientContext). */
export async function fetchActiveDealers() {
  const supabase = createClient();
  if (!supabase) throw new Error('Supabase is not configured.');

  const { data, error } = await supabase
    .from('smart_hoot_config')
    .select(
      'id, customer_name, hoot_id, hoot_url, ga4_customer_id, website_platform, is_active'
    )
    .eq('is_active', true)
    .order('customer_name', { ascending: true });

  if (error) throw new Error(error.message || 'Failed to load dealers.');

  return (data || [])
    .filter((r) => r && r.customer_name)
    .map((row) => ({
      id: row.id,
      name: row.customer_name || 'Unnamed dealer',
      ga4CustomerId: row.ga4_customer_id || null,
      hootId: row.hoot_id || null,
      websitePlatform: row.website_platform || null,
    }));
}
