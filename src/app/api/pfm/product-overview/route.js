import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { mapPfmChannelRows } from '@/lib/pfm/channelLabel';
import { fetchPfmProductOverviewRange } from '@/lib/api/pfmProductOverviewFetch';
// import {
//   enrichChannelsWithKeyEvents,
//   enrichProductsWithItemEcommerce,
//   fetchGa4ChannelKeyEvents,
//   fetchGa4ItemEcommerce,
// } from '@/lib/pfm/ga4ItemEcommerce';
import { pctChange } from '@/lib/overview/comparePeriod';

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
    newUsers: Number(r.new_users) || 0,
    conversions: Number(r.conversions) || 0,
    revenue: Number(r.revenue) || 0,
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
      prior < 1 && r.views > 0 ? null : pctChange(r.views, prior);
    return {
      ...r,
      priorViews: prior,
      mom,
      isNew: prior < 1 && r.views > 0,
    };
  });
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
    10000
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

  let curBundle;
  let priBundle;
  try {
    // Chunked RPCs — long ranges were hitting Postgres statement_timeout.
    [curBundle, priBundle] = await Promise.all([
      fetchPfmProductOverviewRange(supabase, {
        clientId,
        from,
        to,
        limit,
      }),
      fetchPfmProductOverviewRange(supabase, {
        clientId,
        from: priorFrom,
        to: priorTo,
        limit,
      }),
    ]);
  } catch (err) {
    const message = err?.message || String(err);
    console.error('[pfm/product-overview]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }

  const dailyCurrent = mapDaily(curBundle.daily);
  const dailyPrior = mapDaily(priBundle.daily);
  const allCurrent = mapDaily(curBundle.allDaily);
  const allPrior = mapDaily(priBundle.allDaily);
  const productsCurrent = mapPages(curBundle.pages);
  const productsPrior = mapPages(priBundle.pages);

  // Conversions disabled — GA4 item/key-event attribution doesn't reconcile yet,
  // so conversions stay at the DB value (0 for product page paths).
  const itemEcommerceApplied = false;
  const itemEcommerceError = null;
  // try {
  //   const [itemCur, itemPri] = await Promise.all([
  //     fetchGa4ItemEcommerce({ from, to }),
  //     fetchGa4ItemEcommerce({ from: priorFrom, to: priorTo }),
  //   ]);
  //   productsCurrent = enrichProductsWithItemEcommerce(productsCurrent, itemCur);
  //   productsPrior = enrichProductsWithItemEcommerce(productsPrior, itemPri);
  //   itemEcommerceApplied = true;
  // } catch (err) {
  //   itemEcommerceError = err?.message || String(err);
  //   console.warn(
  //     '[pfm/product-overview] item ecommerce enrich failed:',
  //     itemEcommerceError
  //   );
  // }

  const productCurTotal = sumViews(dailyCurrent);
  const productPriTotal = sumViews(dailyPrior);
  const pageCurTotal = sumViews(allCurrent);
  const pagePriTotal = sumViews(allPrior);

  // Always use raw GA4 session channels for product pages (no source-mapping / Unmapped).
  const channelsCurrent = mapPfmChannelRows(curBundle.channels);
  const channelsPrior = mapPfmChannelRows(priBundle.channels);

  // Channel key-event conversions disabled (see note above).
  const channelKeyEventsApplied = false;
  const channelKeyEventsError = null;
  // try {
  //   const [keCur, kePri] = await Promise.all([
  //     fetchGa4ChannelKeyEvents({ from, to }),
  //     fetchGa4ChannelKeyEvents({ from: priorFrom, to: priorTo }),
  //   ]);
  //   channelsCurrent = enrichChannelsWithKeyEvents(channelsCurrent, keCur);
  //   channelsPrior = enrichChannelsWithKeyEvents(channelsPrior, kePri);
  //   channelKeyEventsApplied = true;
  // } catch (err) {
  //   channelKeyEventsError = err?.message || String(err);
  //   console.warn(
  //     '[pfm/product-overview] channel keyEvents enrich failed:',
  //     channelKeyEventsError
  //   );
  // }

  return NextResponse.json({
    clientId,
    from,
    to,
    priorFrom,
    priorTo,
    sourceMappingApplied: false,
    itemEcommerceApplied,
    itemEcommerceError,
    channelKeyEventsApplied,
    channelKeyEventsError,
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
    shapeCurrent: mapShape(curBundle.shape),
    shapePrior: mapShape(priBundle.shape),
  });
}
