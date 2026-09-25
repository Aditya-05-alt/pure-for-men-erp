import { isVdpPageRow } from '@/lib/ga4/classifyPage';

const PAGE_TABLE = 'smart_ga4_page_data';
const FINAL_TABLE = 'smart_final_data';
/** PostgREST / Supabase default max rows per request */
const FETCH_SIZE = 1000;
const DAY_CONCURRENCY = 6;

const GA4_DATE_WISE_RPC = 'build_date_wise_ga4_data';
const FINAL_DATE_WISE_RPC = 'build_date_wise_final_data';
const HOOT_MATCH_RPC = 'build_date_wise_hoot_match';
/** Admin pipeline — all 4 bottom-table metrics in one DB round trip */
export const PIPELINE_RANGE_VIEWS_RPC = 'build_pipeline_range_views';

function dayKey(reportDate) {
  return String(reportDate).split('T')[0];
}

/**
 * Same aggregation as Date-wise Views (/api/reports/date-wise-views):
 * SUM(views) GROUP BY report_date in Postgres — not row-by-row pagination.
 */
async function sumGa4PageViewsViaRpc(supabase, clientId, days, { vdpOnly = false } = {}) {
  if (!clientId || !days?.length) return {};

  const from = days[0];
  const to = days[days.length - 1];
  // Always pass p_vdp_only so PostgREST picks the 4-arg function (not the legacy 3-arg overload).
  const { data, error } = await supabase.rpc(GA4_DATE_WISE_RPC, {
    p_date_from: from,
    p_date_to: to,
    p_client_id: clientId,
    p_vdp_only: vdpOnly === true,
  });

  if (error) {
    const msg = error.message || '';
    if (
      vdpOnly &&
      (/p_vdp_only|schema cache|arguments/i.test(msg) ||
        /could not choose the best candidate/i.test(msg))
    ) {
      return null;
    }
    if (/could not choose the best candidate/i.test(msg)) {
      throw new Error(
        `${msg} Run in Supabase SQL: DROP FUNCTION IF EXISTS public.build_date_wise_ga4_data(date, date, text);`
      );
    }
    throw new Error(error.message);
  }

  const daily = {};
  for (const row of data || []) {
    const day = dayKey(row.report_date);
    const views = Number(row.views) || 0;
    if (views > 0) daily[day] = views;
  }
  return daily;
}

async function sumFinalViewsViaRpc(supabase, clientId, days) {
  if (!clientId || !days?.length) return null;

  const { data, error } = await supabase.rpc(FINAL_DATE_WISE_RPC, {
    p_date_from: days[0],
    p_date_to: days[days.length - 1],
    p_client_id: clientId,
  });

  if (error) {
    const msg = error.message || '';
    if (/function.*does not exist|schema cache|Could not find/i.test(msg)) {
      return null;
    }
    throw new Error(error.message);
  }

  const daily = {};
  for (const row of data || []) {
    const day = dayKey(row.report_date);
    const views = Number(row.views) || 0;
    if (views > 0) daily[day] = views;
  }
  return daily;
}

async function sumHootMatchViaRpc(supabase, clientId, days) {
  if (!clientId || !days?.length) return null;

  const { data, error } = await supabase.rpc(HOOT_MATCH_RPC, {
    p_date_from: days[0],
    p_date_to: days[days.length - 1],
    p_client_id: clientId,
  });

  if (error) {
    const msg = error.message || '';
    if (/function.*does not exist|schema cache|Could not find/i.test(msg)) {
      return null;
    }
    throw new Error(error.message);
  }

  const daily = {};
  for (const row of data || []) {
    const matched = Number(row.matched) || 0;
    const nonMatched = Number(row.non_matched) || 0;
    if (matched > 0 || nonMatched > 0) {
      daily[dayKey(row.report_date)] = { matched, nonMatched };
    }
  }
  return daily;
}

function mapsFromPipelineRangeRows(data) {
  const allPageViews = {};
  const vdpPageViews = {};
  const finalViews = {};
  const hootMatch = {};

  for (const row of data || []) {
    const day = dayKey(row.report_date);
    const ga4 = Number(row.ga4_page_views) || 0;
    const filter = Number(row.ga4_filter_views) || 0;
    const final = Number(row.final_vdp_views) || 0;
    const matched = Number(row.hoot_matched) || 0;
    const nonMatched = Number(row.hoot_non_matched) || 0;

    if (ga4 > 0) allPageViews[day] = ga4;
    if (filter > 0) vdpPageViews[day] = filter;
    if (final > 0) finalViews[day] = final;
    if (matched > 0 || nonMatched > 0) {
      hootMatch[day] = { matched, nonMatched };
    }
  }

  return { allPageViews, vdpPageViews, finalViews, hootMatch };
}

/**
 * Single RPC for admin pipeline tables (page, filter, final, hoot) per day.
 * Scans smart_ga4_page_data once and smart_final_data once.
 */
async function sumPipelineRangeViewsViaRpc(supabase, clientId, days) {
  if (!clientId || !days?.length) return null;

  const from = days[0];
  const to = days[days.length - 1];
  const { data, error } = await supabase.rpc(PIPELINE_RANGE_VIEWS_RPC, {
    p_date_from: from,
    p_date_to: to,
    p_client_id: clientId,
  });

  if (error) {
    const msg = error.message || '';
    if (/function.*does not exist|schema cache|Could not find/i.test(msg)) {
      return null;
    }
    throw new Error(error.message);
  }

  return mapsFromPipelineRangeRows(data);
}

/**
 * All four admin pipeline table metrics for the given days.
 * Prefers build_pipeline_range_views (1 RPC); falls back to legacy 4-call path.
 */
export async function sumPipelineRangeViewsByDate(supabase, clientId, days) {
  const viaRpc = await sumPipelineRangeViewsViaRpc(supabase, clientId, days);
  if (viaRpc != null) return viaRpc;

  const [allPageViews, vdpPageViews, finalViews, hootMatch] = await Promise.all([
    sumPageTableViewsByDate(supabase, clientId, days, { vdpOnly: false }),
    sumPageTableViewsByDate(supabase, clientId, days, { vdpOnly: true }),
    sumFinalTableViewsByDate(supabase, clientId, days),
    sumHootUrlMatchByDate(supabase, clientId, days),
  ]);

  return { allPageViews, vdpPageViews, finalViews, hootMatch };
}

async function mapPool(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;

  async function worker() {
    while (next < items.length) {
      const i = next;
      next += 1;
      results[i] = await fn(items[i], i);
    }
  }

  const workers = Array.from({ length: Math.min(limit, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

/**
 * Paginate and sum views for one report_date (fallback when RPC not deployed).
 * Order by page_location for stable pages past 1000 rows/day.
 */
async function sumViewsForSingleDay(supabase, clientId, day, table, opts = {}) {
  const vdpOnly = opts.vdpOnly === true;
  let offset = 0;
  let total = 0;

  while (true) {
    let query = supabase
      .from(table)
      .select('views')
      .eq('client_id', clientId)
      .eq('report_date', day)
      .order('page_location', { ascending: true, nullsFirst: false })
      .range(offset, offset + FETCH_SIZE - 1);

    if (vdpOnly && table === PAGE_TABLE) {
      query = query.eq('vdp_conditions', true);
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);
    if (!data?.length) break;

    for (const row of data) {
      total += Number(row.views) || 0;
    }

    if (data.length < FETCH_SIZE) break;
    offset += FETCH_SIZE;
  }

  return total;
}

/**
 * Sum views by report_date for each day in `days` (parallel batches).
 * Days with no rows are omitted (UI shows empty).
 */
async function sumViewsByDays(supabase, clientId, days, table, opts = {}) {
  const daily = {};
  if (!clientId || !days?.length) return daily;

  await mapPool(days, DAY_CONCURRENCY, async (day) => {
    const total = await sumViewsForSingleDay(supabase, clientId, day, table, opts);
    if (total > 0) daily[day] = total;
  });

  return daily;
}

/** All page views from smart_ga4_page_data for each report_date in range. */
export async function sumPageTableViewsByDate(supabase, clientId, days, opts = {}) {
  const vdpOnly = opts.vdpOnly === true;
  const viaRpc = await sumGa4PageViewsViaRpc(supabase, clientId, days, { vdpOnly });
  if (viaRpc != null) return viaRpc;
  return sumViewsByDays(supabase, clientId, days, PAGE_TABLE, opts);
}

/** VDP views from smart_final_data for each report_date in range. */
export async function sumFinalTableViewsByDate(supabase, clientId, days) {
  const viaRpc = await sumFinalViewsViaRpc(supabase, clientId, days);
  if (viaRpc != null) return viaRpc;
  return sumViewsByDays(supabase, clientId, days, FINAL_TABLE, {});
}

/**
 * Hoot URL match split by vdp_conditions (views) per report_date.
 * Prefers smart_final_data; falls back to VDP rows in smart_ga4_page_data.
 */
async function sumHootMatchForSingleDay(supabase, clientId, day, table) {
  let matched = 0;
  let nonMatched = 0;
  let offset = 0;
  const filterVdpOnly = table === PAGE_TABLE;

  while (true) {
    const { data, error } = await supabase
      .from(table)
      .select('views, vdp_conditions, ga4_page_type')
      .eq('client_id', clientId)
      .eq('report_date', day)
      .order('page_location', { ascending: true, nullsFirst: false })
      .range(offset, offset + FETCH_SIZE - 1);

    if (error) throw new Error(error.message);
    if (!data?.length) break;

    for (const row of data) {
      if (filterVdpOnly && !isVdpPageRow(row)) continue;
      const views = Number(row.views) || 0;
      if (views === 0) continue;
      if (row.vdp_conditions === true) matched += views;
      else nonMatched += views;
    }

    if (data.length < FETCH_SIZE) break;
    offset += FETCH_SIZE;
  }

  return { matched, nonMatched };
}

export async function sumHootUrlMatchByDate(supabase, clientId, days) {
  const daily = {};
  if (!clientId || !days?.length) return daily;

  const viaRpc = await sumHootMatchViaRpc(supabase, clientId, days);
  if (viaRpc != null) {
    for (const day of days) {
      const v = viaRpc[day];
      if (v && (v.matched > 0 || v.nonMatched > 0)) daily[day] = v;
    }
    const hasAny = Object.keys(daily).length > 0;
    if (hasAny) return daily;
  }

  await mapPool(days, DAY_CONCURRENCY, async (day) => {
    let { matched, nonMatched } = await sumHootMatchForSingleDay(
      supabase,
      clientId,
      day,
      FINAL_TABLE
    );

    if (matched === 0 && nonMatched === 0) {
      ({ matched, nonMatched } = await sumHootMatchForSingleDay(
        supabase,
        clientId,
        day,
        PAGE_TABLE
      ));
    }

    if (matched > 0 || nonMatched > 0) {
      daily[day] = { matched, nonMatched };
    }
  });

  return daily;
}

export async function countPageRowsInRange(
  supabase,
  clientId,
  from,
  to,
  { vdpOnly = false } = {}
) {
  let query = supabase
    .from(PAGE_TABLE)
    .select('*', { count: 'exact', head: true })
    .eq('client_id', clientId)
    .gte('report_date', from)
    .lte('report_date', to);

  if (vdpOnly) query = query.eq('vdp_conditions', true);

  const { count, error } = await query;
  if (error) return { count: 0, error: error.message };
  return { count: count ?? 0 };
}

export async function countVdpPageRowsAny(supabase, clientId) {
  const { count, error } = await supabase
    .from(PAGE_TABLE)
    .select('*', { count: 'exact', head: true })
    .eq('client_id', clientId)
    .eq('vdp_conditions', true);

  if (error) return { count: 0, error: error.message };
  return { count: count ?? 0 };
}
