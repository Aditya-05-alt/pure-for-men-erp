import { dayCountInclusive } from '@/lib/ga4/dateRange';

/** Client-side chunk size for progressive Channel / Campaign breakdown UI. */
export const BREAKDOWN_UI_CHUNK_DAYS = 5;

/**
 * Pick RPC window size for server-side / non-progressive fallback.
 * VDP page type uses smaller windows — heavy dealers (page-grain rows) can timeout on full-month RPC.
 */
export function resolveRpcChunkPlan(from, to, { invFilters = false, pageType = 'ALL' } = {}) {
  const days = dayCountInclusive(from, to);
  if (days <= 0) return { chunkDays: 7, concurrency: 1 };

  const isVdp = String(pageType).toUpperCase() === 'VDP';
  const vdpChunkDays = Math.min(BREAKDOWN_UI_CHUNK_DAYS, days || BREAKDOWN_UI_CHUNK_DAYS);

  if (days <= 31) {
    if (isVdp) {
      return { chunkDays: vdpChunkDays, concurrency: 2 };
    }
    return { chunkDays: days, concurrency: 1 };
  }
  if (days <= 90) {
    return {
      chunkDays: invFilters ? 7 : 14,
      concurrency: invFilters ? 2 : 3,
    };
  }
  if (days <= 180) {
    return {
      chunkDays: invFilters ? 5 : 10,
      concurrency: 2,
    };
  }
  return {
    chunkDays: invFilters ? 3 : 7,
    concurrency: 2,
  };
}
