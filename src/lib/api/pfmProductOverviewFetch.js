import { rpcByDateChunks } from '@/lib/api/chunkedRpc';

/** Days per RPC window — keeps product-page scans under statement_timeout. */
export const PFM_OVERVIEW_CHUNK_DAYS = 14;
export const PFM_OVERVIEW_CHUNK_CONCURRENCY = 2;
/** Per-window page cap — high enough that no product page is dropped before merge. */
const PFM_PAGES_PER_CHUNK = 10000;

async function fetchRange(supabase, rpcName, clientId, from, to, extraParams = {}) {
  const rows = await rpcByDateChunks(supabase, rpcName, {
    clientId,
    from,
    to,
    extraParams,
    chunkDays: PFM_OVERVIEW_CHUNK_DAYS,
    concurrency: PFM_OVERVIEW_CHUNK_CONCURRENCY,
  });
  return rows || [];
}

function mergeDailyRows(rows) {
  const byDate = new Map();
  for (const r of rows || []) {
    const date = String(r.report_date).slice(0, 10);
    if (!date) continue;
    const prev = byDate.get(date) || {
      report_date: date,
      views: 0,
      sessions: 0,
      total_users: 0,
    };
    prev.views += Number(r.views) || 0;
    prev.sessions += Number(r.sessions) || 0;
    prev.total_users += Number(r.total_users) || 0;
    byDate.set(date, prev);
  }
  return [...byDate.values()].sort((a, b) =>
    a.report_date.localeCompare(b.report_date)
  );
}

function mergeChannelRows(rows) {
  const byBucket = new Map();
  for (const r of rows || []) {
    const bucket = String(r.channel_bucket ?? '(not set)');
    const prev = byBucket.get(bucket) || {
      channel_bucket: bucket,
      views: 0,
      conversions: 0,
      total_users: 0,
      new_users: 0,
    };
    prev.views += Number(r.views) || 0;
    prev.conversions += Number(r.conversions) || 0;
    prev.total_users += Number(r.total_users) || 0;
    prev.new_users += Number(r.new_users) || 0;
    byBucket.set(bucket, prev);
  }
  return [...byBucket.values()].sort(
    (a, b) => b.views - a.views || a.channel_bucket.localeCompare(b.channel_bucket)
  );
}

/** All-page channel breakdown, chunked by date so long ranges don't time out. */
export async function fetchPfmChannelBreakdownRange(supabase, { clientId, from, to }) {
  const rows = await fetchRange(
    supabase,
    'get_pfm_channel_breakdown',
    clientId,
    from,
    to
  );
  return mergeChannelRows(rows);
}

function mergeTopProductRows(rows, limit) {
  const byPath = new Map();
  for (const r of rows || []) {
    const path = String(r.page_path || '(not set)');
    const prev = byPath.get(path) || {
      page_path: path,
      page_title: '',
      views: 0,
      sessions: 0,
      total_users: 0,
      new_users: 0,
      conversions: 0,
      revenue: 0,
    };
    prev.views += Number(r.views) || 0;
    prev.sessions += Number(r.sessions) || 0;
    prev.total_users += Number(r.total_users) || 0;
    prev.new_users += Number(r.new_users) || 0;
    prev.conversions += Number(r.conversions) || 0;
    prev.revenue += Number(r.revenue) || 0;
    const title = String(r.page_title || '').trim();
    if (title) prev.page_title = title;
    byPath.set(path, prev);
  }
  return [...byPath.values()]
    .sort((a, b) => b.views - a.views || a.page_path.localeCompare(b.page_path))
    .slice(0, Math.max(limit, 1));
}

function mergeShapeRows(rows) {
  const byShape = new Map();
  for (const r of rows || []) {
    const key = String(r.shape_bucket || 'other').toLowerCase();
    byShape.set(key, (byShape.get(key) || 0) + (Number(r.views) || 0));
  }
  return [...byShape.entries()].map(([shape_bucket, views]) => ({
    shape_bucket,
    views,
  }));
}

/**
 * Load all product-overview RPCs for one date range, chunked to avoid timeouts.
 */
export async function fetchPfmProductOverviewRange(
  supabase,
  { clientId, from, to, limit = 50 }
) {
  const pageLimit = PFM_PAGES_PER_CHUNK;

  const [dailyRaw, allDailyRaw, pagesRaw, channelsRaw, shapeRaw] =
    await Promise.all([
      fetchRange(supabase, 'get_pfm_product_page_views_daily', clientId, from, to),
      fetchRange(supabase, 'get_pfm_page_views_daily', clientId, from, to),
      fetchRange(supabase, 'get_pfm_top_product_pages', clientId, from, to, {
        p_limit: pageLimit,
      }),
      fetchRange(
        supabase,
        'get_pfm_product_channel_breakdown',
        clientId,
        from,
        to
      ),
      fetchRange(
        supabase,
        'get_pfm_product_shape_breakdown',
        clientId,
        from,
        to
      ),
    ]);

  return {
    daily: mergeDailyRows(dailyRaw),
    allDaily: mergeDailyRows(allDailyRaw),
    pages: mergeTopProductRows(pagesRaw, limit),
    channels: mergeChannelRows(channelsRaw),
    shape: mergeShapeRows(shapeRaw),
  };
}
