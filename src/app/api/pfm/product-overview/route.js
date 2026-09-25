import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { mapPfmChannelRows } from '@/lib/pfm/channelLabel';
import { pctChange } from '@/lib/overview/comparePeriod';
import { loadSourceMapping } from '@/lib/sourceMapping/store';
import {
  aggregateRawToChannels,
  toMappingMap,
} from '@/lib/sourceMapping/apply';

export const maxDuration = 60;

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

function mapDaily(rows) {
  return (rows || []).map((r) => ({
    date: String(r.report_date).slice(0, 10),
    views: Number(r.views) || 0,
    sessions: Number(r.sessions) || 0,
    totalUsers: Number(r.total_users) || 0,
  }));
}

function mapPages(rows) {
  return (rows || []).map((r) => ({
    pagePath: r.page_path || '(not set)',
    pageTitle: r.page_title || '',
    views: Number(r.views) || 0,
    sessions: Number(r.sessions) || 0,
    totalUsers: Number(r.total_users) || 0,
  }));
}

function sumViews(rows) {
  return (rows || []).reduce((s, r) => s + (Number(r.views) || 0), 0);
}

function mapShape(rows) {
  const out = { direct: 0, collection: 0, other: 0 };
  for (const r of rows || []) {
    const key = String(r.shape_bucket || 'other').toLowerCase();
    const views = Number(r.views) || 0;
    if (key === 'direct') out.direct += views;
    else if (key === 'collection') out.collection += views;
    else out.other += views;
  }
  return out;
}

function mergeTopProducts(cur, pri) {
  const priMap = new Map((pri || []).map((r) => [r.pagePath, r.views]));
  return (cur || []).map((r) => {
    const prior = priMap.get(r.pagePath) || 0;
    const mom =
      prior < 1 && r.views > 0
        ? null
        : pctChange(r.views, prior);
    return {
      ...r,
      priorViews: prior,
      mom,
      isNew: prior < 1 && r.views > 0,
    };
  });
}

function rawRowsFromRpc(data) {
  return (data || []).map((r) => ({
    rawSource: r.raw_source,
    rawMedium: r.raw_medium,
    pageViews: Number(r.page_views) || 0,
    vdpViews: Number(r.vdp_views) || 0,
  }));
}

/** Prefer mapped product views; fall back to GA4 default channel column. */
function channelsFromMapping(rawRpcData, mappingCfg, fallbackChannelRows) {
  const raw = rawRowsFromRpc(rawRpcData);
  if (!raw.length) return mapPfmChannelRows(fallbackChannelRows);

  const mapped = aggregateRawToChannels(
    raw,
    mappingCfg.channels,
    toMappingMap(mappingCfg.mapping)
  );
  return mapped
    .map((r) => ({
      channel_bucket: r.name,
      views: Number(r.vdpViews) || 0,
    }))
    .filter((r) => r.views > 0)
    .sort(
      (a, b) =>
        b.views - a.views || a.channel_bucket.localeCompare(b.channel_bucket)
    );
}

/**
 * Pure for Men — Product overview bundle (VDP-style dashboard).
 * Query: from, to, priorFrom, priorTo, clientId?, limit?
 */
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const from = searchParams.get('from')?.slice(0, 10);
  const to = searchParams.get('to')?.slice(0, 10);
  const priorFrom = searchParams.get('priorFrom')?.slice(0, 10);
  const priorTo = searchParams.get('priorTo')?.slice(0, 10);
  const clientId = searchParams.get('clientId')?.trim() || DEFAULT_CLIENT_ID;
  const limit = Math.min(
    Math.max(Number(searchParams.get('limit')) || 50, 1),
    500
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

  const [
    prodDailyCur,
    prodDailyPri,
    allDailyCur,
    allDailyPri,
    pagesCur,
    pagesPri,
    chCur,
    chPri,
    shapeCur,
    shapePri,
    rawCur,
    rawPri,
    mappingCfg,
  ] = await Promise.all([
    supabase.rpc('get_pfm_product_page_views_daily', {
      p_from: from,
      p_to: to,
      p_client_id: clientId,
    }),
    supabase.rpc('get_pfm_product_page_views_daily', {
      p_from: priorFrom,
      p_to: priorTo,
      p_client_id: clientId,
    }),
    supabase.rpc('get_pfm_page_views_daily', {
      p_from: from,
      p_to: to,
      p_client_id: clientId,
    }),
    supabase.rpc('get_pfm_page_views_daily', {
      p_from: priorFrom,
      p_to: priorTo,
      p_client_id: clientId,
    }),
    supabase.rpc('get_pfm_top_product_pages', {
      p_from: from,
      p_to: to,
      p_client_id: clientId,
      p_limit: limit,
    }),
    supabase.rpc('get_pfm_top_product_pages', {
      p_from: priorFrom,
      p_to: priorTo,
      p_client_id: clientId,
      p_limit: limit,
    }),
    supabase.rpc('get_pfm_product_channel_breakdown', {
      p_from: from,
      p_to: to,
      p_client_id: clientId,
    }),
    supabase.rpc('get_pfm_product_channel_breakdown', {
      p_from: priorFrom,
      p_to: priorTo,
      p_client_id: clientId,
    }),
    supabase.rpc('get_pfm_product_shape_breakdown', {
      p_from: from,
      p_to: to,
      p_client_id: clientId,
    }),
    supabase.rpc('get_pfm_product_shape_breakdown', {
      p_from: priorFrom,
      p_to: priorTo,
      p_client_id: clientId,
    }),
    supabase.rpc('get_pfm_raw_source_medium_traffic', {
      p_from: from,
      p_to: to,
      p_client_id: clientId,
    }),
    supabase.rpc('get_pfm_raw_source_medium_traffic', {
      p_from: priorFrom,
      p_to: priorTo,
      p_client_id: clientId,
    }),
    loadSourceMapping(supabase),
  ]);

  const firstErr = [
    prodDailyCur,
    prodDailyPri,
    allDailyCur,
    allDailyPri,
    pagesCur,
    pagesPri,
    chCur,
    chPri,
    shapeCur,
    shapePri,
  ].find((r) => r.error);

  if (firstErr?.error) {
    console.error('[pfm/product-overview]', firstErr.error.message);
    return NextResponse.json(
      { error: firstErr.error.message },
      { status: 500 }
    );
  }

  const dailyCurrent = mapDaily(prodDailyCur.data);
  const dailyPrior = mapDaily(prodDailyPri.data);
  const allCurrent = mapDaily(allDailyCur.data);
  const allPrior = mapDaily(allDailyPri.data);
  const productsCurrent = mapPages(pagesCur.data);
  const productsPrior = mapPages(pagesPri.data);

  const productCurTotal = sumViews(dailyCurrent);
  const productPriTotal = sumViews(dailyPrior);
  const pageCurTotal = sumViews(allCurrent);
  const pagePriTotal = sumViews(allPrior);

  const useMapped =
    !rawCur.error && !rawPri.error && mappingCfg && !mappingCfg.missingTable;

  const channelsCurrent = useMapped
    ? channelsFromMapping(rawCur.data, mappingCfg, chCur.data)
    : mapPfmChannelRows(chCur.data);
  const channelsPrior = useMapped
    ? channelsFromMapping(rawPri.data, mappingCfg, chPri.data)
    : mapPfmChannelRows(chPri.data);

  return NextResponse.json({
    clientId,
    from,
    to,
    priorFrom,
    priorTo,
    sourceMappingApplied: Boolean(useMapped),
    totals: {
      productCurrent: productCurTotal,
      productPrior: productPriTotal,
      pageCurrent: pageCurTotal,
      pagePrior: pagePriTotal,
      productMom: pctChange(productCurTotal, productPriTotal),
    },
    dailyCurrent,
    dailyPrior,
    productsCurrent: mergeTopProducts(productsCurrent, productsPrior),
    productsPrior,
    channelsCurrent,
    channelsPrior,
    shapeCurrent: mapShape(shapeCur.data),
    shapePrior: mapShape(shapePri.data),
  });
}
