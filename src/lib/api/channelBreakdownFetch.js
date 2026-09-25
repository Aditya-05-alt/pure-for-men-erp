import { createClient } from '@/lib/supabase/client';
import { rpcByDateChunksProgressive } from '@/lib/api/chunkedRpc';
import { mergeChannelBreakdownRows } from '@/lib/ga4/channelBreakdownMerge';
import {
  BREAKDOWN_UI_CHUNK_DAYS,
  resolveRpcChunkPlan,
} from '@/lib/api/rpcChunkPlan';
import {
  getChannelBreakdownCache,
  setChannelBreakdownCache,
} from '@/lib/data/channelBreakdownCache';
import {
  appendVdpFiltersToSearchParams,
  channelBreakdownVdpFilters,
  channelFilterCacheSuffix,
  channelFiltersActive,
  vdpRpcExtraParams,
} from '@/lib/vdp/vdpFilterParams';

async function fetchChannelBreakdownViaApi({
  clientId,
  from,
  to,
  pageTypeFilter,
  vdpFilters,
  tab,
  onCancelCheck,
}) {
  if (typeof window === 'undefined') return null;
  if (onCancelCheck?.()) return null;

  // Same filters as VDP except location (location blanks channel join).
  const channelFilters = channelBreakdownVdpFilters(vdpFilters);

  const qs = new URLSearchParams({
    clientId,
    from,
    to,
    pageType: pageTypeFilter,
  });
  appendVdpFiltersToSearchParams(qs, channelFilters, tab);

  const res = await fetch(`/api/dashboard/channel-breakdown?${qs}`, {
    credentials: 'same-origin',
  });
  const json = await res.json().catch(() => ({}));

  if (onCancelCheck?.()) return null;
  if (!res.ok) {
    if (res.status === 503) return null;
    throw new Error(json.error || `Channel breakdown request failed (${res.status})`);
  }

  return json.rows || [];
}

async function fetchViaClientProgressive({
  clientId,
  from,
  to,
  pageTypeFilter,
  vdpFilters,
  tab,
  onCancelCheck,
  onProgress,
  chunkDays,
  concurrency,
  adaptiveChunks = false,
}) {
  const supabase = createClient();
  if (!supabase) throw new Error('Supabase is not configured.');

  const channelFilters = channelBreakdownVdpFilters(vdpFilters);
  const extraParams = {
    p_page_type: pageTypeFilter,
    ...vdpRpcExtraParams(channelFilters, tab),
  };

  const invFilters = channelFiltersActive(vdpFilters, tab);
  let resolvedChunkDays = chunkDays ?? BREAKDOWN_UI_CHUNK_DAYS;
  let resolvedConcurrency = concurrency ?? 1;
  if (adaptiveChunks) {
    const plan = resolveRpcChunkPlan(from, to, {
      invFilters,
      pageType: pageTypeFilter,
    });
    resolvedChunkDays = chunkDays ?? plan.chunkDays;
    resolvedConcurrency = concurrency ?? plan.concurrency;
  }

  const raw = await rpcByDateChunksProgressive(
    supabase,
    'get_ga4_channel_breakdown',
    {
      clientId,
      from,
      to,
      extraParams,
      chunkDays: resolvedChunkDays,
      concurrency: resolvedConcurrency,
      onCancelCheck,
      onBatch: (batchRows, meta) => {
        if (onCancelCheck?.()) return;
        const merged = mergeChannelBreakdownRows(batchRows);
        onProgress?.(merged, meta);
      },
    }
  );

  if (onCancelCheck?.()) return null;
  return mergeChannelBreakdownRows(raw || []);
}

/**
 * Fetch channel breakdown for ONE page type only (ALL | VDP | SRP | Home | Other).
 * Streams partial results every BREAKDOWN_UI_CHUNK_DAYS as chunks complete.
 * Applies make/model/type/year/condition filters; location is ignored for channel.
 */
export async function fetchChannelBreakdownBundle({
  clientId,
  from,
  to,
  pageTypeFilter = 'ALL',
  vdpFilters,
  tab = 'all',
  onCancelCheck,
  onProgress,
  skipCache = false,
  preferServer = false,
  adaptiveChunks = false,
  chunkDays,
  concurrency,
}) {
  if (!clientId || !from || !to) return [];

  const cacheSuffix = channelFilterCacheSuffix(vdpFilters, tab);

  if (!skipCache) {
    const cached = getChannelBreakdownCache(
      clientId,
      from,
      to,
      pageTypeFilter,
      cacheSuffix
    );
    if (cached) {
      onProgress?.(cached, { completed: 1, total: 1, fromCache: true });
      return cached;
    }
  }

  if (preferServer) {
    try {
      const viaApi = await fetchChannelBreakdownViaApi({
        clientId,
        from,
        to,
        pageTypeFilter,
        vdpFilters,
        tab,
        onCancelCheck,
      });
      if (viaApi) {
        onProgress?.(viaApi, { completed: 1, total: 1, fromServer: true });
        if (!skipCache) {
          setChannelBreakdownCache(
            clientId,
            from,
            to,
            pageTypeFilter,
            viaApi,
            cacheSuffix
          );
        }
        return viaApi;
      }
    } catch (err) {
      if (onCancelCheck?.()) return null;
      // Fall through to client-side chunked fetch.
    }
  }

  const result = await fetchViaClientProgressive({
    clientId,
    from,
    to,
    pageTypeFilter,
    vdpFilters,
    tab,
    onCancelCheck,
    onProgress,
    chunkDays,
    concurrency,
    adaptiveChunks,
  });

  if (onCancelCheck?.()) return null;
  const rows = result || [];
  setChannelBreakdownCache(
    clientId,
    from,
    to,
    pageTypeFilter,
    rows,
    cacheSuffix
  );
  return rows;
}
