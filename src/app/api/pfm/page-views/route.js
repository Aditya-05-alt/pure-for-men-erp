import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { fetchPfmChannelBreakdownRange } from '@/lib/api/pfmProductOverviewFetch';
import { mapPfmChannelRows } from '@/lib/pfm/channelLabel';

export const maxDuration = 120;

const DEFAULT_CLIENT_ID = '001';

function supabasePublic() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const key = serviceKey || anonKey;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

const POSTGREST_MAX_ROWS = 1000;
const PAGE_FETCH_CONCURRENCY = 4;

/** PostgREST caps each response at 1000 rows; page through with .range(). */
async function rpcAllRows(supabase, rpcName, params, maxRows) {
  if (maxRows <= POSTGREST_MAX_ROWS) {
    return supabase.rpc(rpcName, params);
  }
  const out = [];
  let offset = 0;
  while (offset < maxRows) {
    const batch = await Promise.all(
      Array.from({ length: PAGE_FETCH_CONCURRENCY }, (_, i) => {
        const start = offset + i * POSTGREST_MAX_ROWS;
        if (start >= maxRows) return Promise.resolve({ data: [], error: null });
        const end = Math.min(start + POSTGREST_MAX_ROWS, maxRows) - 1;
        return supabase.rpc(rpcName, params).range(start, end);
      })
    );
    let done = false;
    for (const res of batch) {
      if (res.error) return { data: null, error: res.error };
      out.push(...(res.data || []));
      if ((res.data || []).length < POSTGREST_MAX_ROWS) done = true;
    }
    if (done) break;
    offset += PAGE_FETCH_CONCURRENCY * POSTGREST_MAX_ROWS;
  }
  return { data: out, error: null };
}

/**
 * Pure for Men — page views from chipper_pfm_ga4_data.
 * Query: from, to, priorFrom, priorTo, clientId?, scope=all|product, limit?
 */
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const from = searchParams.get('from')?.slice(0, 10);
  const to = searchParams.get('to')?.slice(0, 10);
  const priorFrom = searchParams.get('priorFrom')?.slice(0, 10);
  const priorTo = searchParams.get('priorTo')?.slice(0, 10);
  const clientId = searchParams.get('clientId')?.trim() || DEFAULT_CLIENT_ID;
  const scope =
    searchParams.get('scope')?.trim().toLowerCase() === 'product'
      ? 'product'
      : 'all';
  const limit = Math.min(
    Math.max(Number(searchParams.get('limit')) || 50, 1),
    20000
  );

  if (!from || !to || !priorFrom || !priorTo) {
    return NextResponse.json(
      { error: 'Missing from, to, priorFrom, or priorTo' },
      { status: 400 }
    );
  }

  const supabase = supabasePublic();
  if (!supabase) {
    return NextResponse.json(
      { error: 'Supabase is not configured on the server' },
      { status: 503 }
    );
  }

  const dailyRpc =
    scope === 'product'
      ? 'get_pfm_product_page_views_daily'
      : 'get_pfm_page_views_daily';
  const pagesRpc =
    scope === 'product' ? 'get_pfm_top_product_pages' : 'get_pfm_top_pages';

  const pagesRequest = (p_from, p_to) =>
    rpcAllRows(
      supabase,
      pagesRpc,
      { p_from, p_to, p_client_id: clientId, p_limit: limit },
      limit
    );

  const [dailyCur, dailyPri, pagesCur, pagesPri] = await Promise.all([
    supabase.rpc(dailyRpc, {
      p_from: from,
      p_to: to,
      p_client_id: clientId,
    }),
    supabase.rpc(dailyRpc, {
      p_from: priorFrom,
      p_to: priorTo,
      p_client_id: clientId,
    }),
    pagesRequest(from, to),
    pagesRequest(priorFrom, priorTo),
  ]);

  const firstErr =
    dailyCur.error || dailyPri.error || pagesCur.error || pagesPri.error;
  if (firstErr) {
    console.error('[pfm/page-views]', firstErr.message);
    return NextResponse.json({ error: firstErr.message }, { status: 500 });
  }

  let pagesPriorByPath = [];
  let channelsCurrent = [];
  let channelsPrior = [];
  if (scope === 'all') {
    const curPaths = (pagesCur.data || []).map((r) => r.page_path || '(not set)');
    // When every page was requested, the prior list is already complete.
    const priorIsComplete = (pagesPri.data || []).length < limit;
    try {
      const [byPaths, chCur, chPri] = await Promise.all([
        priorIsComplete
          ? Promise.resolve({ data: pagesPri.data || [], error: null })
          : curPaths.length
          ? supabase.rpc('get_pfm_pages_by_paths', {
              p_from: priorFrom,
              p_to: priorTo,
              p_client_id: clientId,
              p_paths: curPaths,
            })
          : Promise.resolve({ data: [], error: null }),
        fetchPfmChannelBreakdownRange(supabase, { clientId, from, to }),
        fetchPfmChannelBreakdownRange(supabase, {
          clientId,
          from: priorFrom,
          to: priorTo,
        }),
      ]);
      if (byPaths.error) throw byPaths.error;
      pagesPriorByPath = byPaths.data || [];
      channelsCurrent = mapPfmChannelRows(chCur);
      channelsPrior = mapPfmChannelRows(chPri);
    } catch (err) {
      console.error('[pfm/page-views] compare', err?.message || err);
      return NextResponse.json(
        { error: err?.message || 'Failed to load page comparison' },
        { status: 500 }
      );
    }
  }

  const mapDaily = (rows) =>
    (rows || []).map((r) => ({
      date: String(r.report_date).slice(0, 10),
      views: Number(r.views) || 0,
      sessions: Number(r.sessions) || 0,
      totalUsers: Number(r.total_users) || 0,
    }));

  const mapPages = (rows) =>
    (rows || []).map((r) => ({
      pagePath: r.page_path || '(not set)',
      pageTitle: r.page_title || '',
      views: Number(r.views) || 0,
      sessions: Number(r.sessions) || 0,
      totalUsers: Number(r.total_users) || 0,
      newUsers: Number(r.new_users) || 0,
    }));

  const dailyCurrent = mapDaily(dailyCur.data);
  const dailyPrior = mapDaily(dailyPri.data);
  const sumViews = (rows) => rows.reduce((s, r) => s + r.views, 0);

  return NextResponse.json({
    clientId,
    scope,
    from,
    to,
    priorFrom,
    priorTo,
    totals: {
      current: sumViews(dailyCurrent),
      prior: sumViews(dailyPrior),
    },
    dailyCurrent,
    dailyPrior,
    pagesCurrent: mapPages(pagesCur.data),
    pagesPrior: mapPages(pagesPri.data),
    pagesPriorByPath: mapPages(pagesPriorByPath),
    channelsCurrent,
    channelsPrior,
  });
}
