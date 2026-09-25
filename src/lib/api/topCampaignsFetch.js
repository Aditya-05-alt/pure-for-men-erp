import { createClient } from '@/lib/supabase/client';
import { rpcByDateChunksProgressive } from '@/lib/api/chunkedRpc';
import { mergeTopCampaignRows } from '@/lib/ga4/topCampaignsMerge';
import { BREAKDOWN_UI_CHUNK_DAYS } from '@/lib/api/rpcChunkPlan';
import {
  getTopCampaignsCache,
  setTopCampaignsCache,
} from '@/lib/data/topCampaignsCache';
import {
  vdpRpcExtraParams,
  vdpFilterCacheSuffix,
} from '@/lib/vdp/vdpFilterParams';

async function fetchViaClientProgressive({
  clientId,
  from,
  to,
  pageTypeFilter,
  vdpFilters,
  tab,
  onCancelCheck,
  onProgress,
}) {
  const supabase = createClient();
  if (!supabase) throw new Error('Supabase is not configured.');

  const extraParams = {
    p_page_type: pageTypeFilter,
    p_limit: null,
    ...vdpRpcExtraParams(vdpFilters, tab),
  };

  const raw = await rpcByDateChunksProgressive(supabase, 'get_top_campaigns', {
    clientId,
    from,
    to,
    extraParams,
    chunkDays: BREAKDOWN_UI_CHUNK_DAYS,
    concurrency: 1,
    onCancelCheck,
    onBatch: (batchRows, meta) => {
      if (onCancelCheck?.()) return;
      const merged = mergeTopCampaignRows(batchRows);
      onProgress?.(merged, meta);
    },
  });

  if (onCancelCheck?.()) return null;
  return mergeTopCampaignRows(raw || []);
}

/**
 * Fetch top campaigns for ONE page type only (ALL | VDP | SRP | Home | Other).
 * Streams partial results every BREAKDOWN_UI_CHUNK_DAYS as chunks complete.
 */
export async function fetchTopCampaignsBundle({
  clientId,
  from,
  to,
  pageTypeFilter = 'ALL',
  vdpFilters,
  tab = 'all',
  onCancelCheck,
  onProgress,
  skipCache = false,
}) {
  if (!clientId || !from || !to) return [];

  const cacheSuffix = vdpFilterCacheSuffix(vdpFilters, tab);

  if (!skipCache) {
    const cached = getTopCampaignsCache(
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

  const result = await fetchViaClientProgressive({
    clientId,
    from,
    to,
    pageTypeFilter,
    vdpFilters,
    tab,
    onCancelCheck,
    onProgress,
  });

  if (onCancelCheck?.()) return null;
  const rows = result || [];
  setTopCampaignsCache(
    clientId,
    from,
    to,
    pageTypeFilter,
    rows,
    cacheSuffix
  );
  return rows;
}
