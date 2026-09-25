import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

export const maxDuration = 60;

function normalizeCells(rows) {
  return (rows || []).map((r) => ({
    report_date: String(r.report_date).split('T')[0],
    campaign: String(r.campaign || r.session_campaign || '(not set)').trim(),
    views: Number(r.views) || 0,
  }));
}

function ymd(d) {
  if (!d) return null;
  const s = String(d).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

function daysInclusive(from, to) {
  const a = ymd(from);
  const b = ymd(to);
  if (!a || !b || a > b) return 0;
  const ms =
    Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`);
  return Math.floor(ms / 86400000) + 1;
}

function maxYmd(a, b) {
  return a >= b ? a : b;
}

function minYmd(a, b) {
  return a <= b ? a : b;
}

/** Match GA4 session_campaign to Ads campaign.name (spacing around |). */
function normalizeCampaignKey(name) {
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/\s*\|\s*/g, '|')
    .replace(/\s+/g, ' ');
}

function emptyCostMaps() {
  return { byName: new Map(), byNorm: new Map(), source: 'none' };
}

function addCostRow(maps, name, cost) {
  const n = String(name || '').trim();
  if (!n) return;
  const c = Number(cost) || 0;
  maps.byName.set(n, (maps.byName.get(n) || 0) + c);
  const key = normalizeCampaignKey(n);
  maps.byNorm.set(key, (maps.byNorm.get(key) || 0) + c);
}

function lookupCampaignCost(maps, campaignName) {
  const name = String(campaignName || '').trim();
  if (!name || !maps) return 0;
  if (maps.byName.has(name)) return maps.byName.get(name) || 0;
  return maps.byNorm.get(normalizeCampaignKey(name)) || 0;
}

/**
 * Attach Ads costs to GA4 campaigns, then append WA Ads campaigns that have
 * spend in-range but no GA4 views (so table total matches Google Ads).
 */
function mergeCampaignsWithCosts(ga4Campaigns, costMaps) {
  const seen = new Set();
  const rows = [];

  for (const r of ga4Campaigns || []) {
    const campaign = String(r.campaign || '(not set)').trim();
    if (!campaign) continue;
    seen.add(campaign);
    seen.add(normalizeCampaignKey(campaign));
    const cost = lookupCampaignCost(costMaps, campaign);
    rows.push({
      campaign,
      views: Number(r.views) || 0,
      cost: Math.round(cost * 100) / 100,
      sessions: Number(r.sessions) || 0,
      total_users: Number(r.total_users) || 0,
      new_users: Number(r.new_users) || 0,
    });
  }

  for (const [name, cost] of costMaps?.byName || []) {
    const campaign = String(name || '').trim();
    if (!campaign) continue;
    if (!campaign.startsWith('WA|') && !campaign.startsWith('WA |')) continue;
    const c = Number(cost) || 0;
    if (c <= 0) continue;
    if (seen.has(campaign) || seen.has(normalizeCampaignKey(campaign))) continue;
    seen.add(campaign);
    seen.add(normalizeCampaignKey(campaign));
    rows.push({
      campaign,
      views: 0,
      cost: Math.round(c * 100) / 100,
      sessions: 0,
      total_users: 0,
      new_users: 0,
    });
  }

  rows.sort((a, b) => b.views - a.views || b.cost - a.cost);
  const totalViews = rows.reduce((s, r) => s + r.views, 0);
  return rows.map((r, i) => ({
    ...r,
    pct: totalViews > 0 ? Math.round((r.views / totalViews) * 10000) / 100 : 0,
    rank: i + 1,
  }));
}

/**
 * Resolve Ads customer_id from dealer ga4CustomerId / smart_ga4_config.client_id.
 */
async function resolveAdsCustomerId(supabase, clientId) {
  const cid = String(clientId || '').trim();
  if (!cid) return null;

  const asNum = Number(cid);
  if (Number.isFinite(asNum) && asNum > 0) {
    const byCustomer = await supabase
      .from('google_ads_accounts')
      .select('customer_id')
      .eq('customer_id', asNum)
      .maybeSingle();
    if (byCustomer.data?.customer_id != null) {
      return Number(byCustomer.data.customer_id);
    }
  }

  const byClientField = await supabase
    .from('google_ads_accounts')
    .select('customer_id')
    .eq('client_id', cid)
    .maybeSingle();
  if (byClientField.data?.customer_id != null) {
    return Number(byClientField.data.customer_id);
  }

  const { data: ga4 } = await supabase
    .from('smart_ga4_config')
    .select('ga4_property_id')
    .eq('client_id', cid)
    .maybeSingle();
  const propertyId = String(ga4?.ga4_property_id || '').trim();
  if (!propertyId) {
    return Number.isFinite(asNum) && asNum > 0 ? asNum : null;
  }

  const byProp = await supabase
    .from('google_ads_accounts')
    .select('customer_id')
    .eq('ga4_property_id', propertyId)
    .maybeSingle();
  if (byProp.data?.customer_id != null) {
    return Number(byProp.data.customer_id);
  }

  return Number.isFinite(asNum) && asNum > 0 ? asNum : null;
}

/**
 * Cost from day-wise smart_campaign_history only.
 * Each history row is one campaign × one calendar day (report_from = report_to).
 * Selected UI from/to → SUM(cost) of those days. Single-day range works the same.
 */
async function fetchCampaignCosts(supabase, clientId, from, to) {
  const cid = String(clientId || '').trim();
  if (!cid || !from || !to) return emptyCostMaps();

  const customerId = await resolveAdsCustomerId(supabase, cid);
  if (!customerId) return emptyCostMaps();

  const maps = emptyCostMaps();
  maps.source = 'smart_campaign_history:daily';

  // Prefer RPC so multi-day legacy range rows can never leak into the sum.
  const { data: rpcRows, error: rpcError } = await supabase.rpc(
    'get_campaign_costs_daily',
    {
      p_customer_id: customerId,
      p_from: from,
      p_to: to,
    }
  );

  if (!rpcError && Array.isArray(rpcRows)) {
    for (const row of rpcRows) {
      addCostRow(maps, row.name, Number(row.cost) || 0);
    }
    if (maps.byName.size > 0) return maps;
  } else if (rpcError) {
    console.warn(
      '[campaign-views_advance] get_campaign_costs_daily:',
      rpcError.message
    );
  }

  // Fallback: page history but keep only report_from = report_to days.
  const pageSize = 1000;
  let fromIdx = 0;
  let dailyRows = 0;

  for (;;) {
    const { data, error } = await supabase
      .from('smart_campaign_history')
      .select('name, cost, report_from, report_to')
      .eq('customer_id', customerId)
      .eq('platform', 'google')
      .gte('report_from', from)
      .lte('report_from', to)
      .gte('report_to', from)
      .lte('report_to', to)
      .order('report_from', { ascending: true })
      .order('campaign_id', { ascending: true })
      .range(fromIdx, fromIdx + pageSize - 1);

    if (error) {
      console.warn(
        '[campaign-views_advance] smart_campaign_history daily:',
        error.message
      );
      break;
    }
    if (!data?.length) break;

    for (const row of data) {
      const day = ymd(row.report_from);
      const dayTo = ymd(row.report_to);
      if (!day || day !== dayTo || day < from || day > to) continue;
      dailyRows += 1;
      addCostRow(maps, row.name, Number(row.cost) || 0);
    }

    if (data.length < pageSize) break;
    fromIdx += pageSize;
    if (fromIdx > 100000) break;
  }

  if (dailyRows > 0) return maps;

  // Temporary fallback until day-wise backfill lands for an account.
  const { data: legacy, error: legacyErr } = await supabase
    .from('smart_campaign')
    .select('name, cost, report_from, report_to')
    .eq('customer_id', customerId)
    .lte('report_from', to)
    .gte('report_to', from)
    .limit(5000);
  if (legacyErr || !legacy?.length) return emptyCostMaps();

  maps.source = 'smart_campaign:prorated';
  for (const row of legacy) {
    const name = String(row.name || '').trim();
    if (!name) continue;
    const reportFrom = ymd(row.report_from);
    const reportTo = ymd(row.report_to);
    const fullCost = Number(row.cost) || 0;
    if (!reportFrom || !reportTo) {
      addCostRow(maps, name, fullCost);
      continue;
    }
    const overlapFrom = maxYmd(from, reportFrom);
    const overlapTo = minYmd(to, reportTo);
    const reportDays = daysInclusive(reportFrom, reportTo);
    const overlapDays = daysInclusive(overlapFrom, overlapTo);
    const share =
      reportDays > 0 && overlapDays > 0
        ? fullCost * (overlapDays / reportDays)
        : 0;
    addCostRow(maps, name, share);
  }
  return maps;
}

/** Fallback when cells RPC / jsonb cells are missing — aggregate page rows in Node. */
async function fetchCellsFallback(supabase, clientId, from, to, pageType) {
  const pageSize = 1000;
  let fromIdx = 0;
  const agg = new Map();

  for (;;) {
    let q = supabase
      .from('smart_ga4_page_data')
      .select('report_date, session_campaign, views, ga4_page_type')
      .eq('client_id', clientId)
      .gte('report_date', from)
      .lte('report_date', to)
      .not('session_campaign', 'is', null)
      .or('session_campaign.like.WA|%,session_campaign.like.WA |%')
      .range(fromIdx, fromIdx + pageSize - 1);

    if (String(pageType).toUpperCase() === 'VDP') {
      q = q.ilike('ga4_page_type', 'VDP%');
    }

    const { data, error } = await q;
    if (error) throw error;
    if (!data?.length) break;

    for (const row of data) {
      const campaign = String(row.session_campaign || '').trim();
      if (!campaign.startsWith('WA|') && !campaign.startsWith('WA |')) continue;
      const report_date = String(row.report_date).split('T')[0];
      const key = `${report_date}||${campaign}`;
      agg.set(key, (agg.get(key) || 0) + (Number(row.views) || 0));
    }

    if (data.length < pageSize) break;
    fromIdx += pageSize;
    if (fromIdx > 200000) break;
  }

  return [...agg.entries()]
    .map(([key, views]) => {
      const [report_date, campaign] = key.split('||');
      return { report_date, campaign, views };
    })
    .filter((r) => r.views > 0);
}

/**
 * Dealer Campaign Views — WA| / WA | campaigns only via get_wa_campaign_views_advance.
 * GET /api/dashboard/campaign-views_advance?clientId=&from=&to=&pageType=ALL|VDP
 */
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const clientId = searchParams.get('clientId')?.trim();
  const from = searchParams.get('from')?.slice(0, 10);
  const to = searchParams.get('to')?.slice(0, 10);
  const pageType = searchParams.get('pageType')?.trim() || 'ALL';

  if (!clientId || !from || !to) {
    return NextResponse.json(
      { error: 'Missing clientId, from, or to' },
      { status: 400 }
    );
  }

  if (
    clientId === '__all_dealer__' ||
    clientId.toLowerCase() === 'all' ||
    clientId.includes(',')
  ) {
    return NextResponse.json(
      { error: 'Pick one dealer. Campaign views are per client_id only.' },
      { status: 400 }
    );
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    return NextResponse.json(
      { error: 'SUPABASE_SERVICE_ROLE_KEY is not configured on the server' },
      { status: 503 }
    );
  }

  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    const [mainRes, cellsRes, costSettled] = await Promise.all([
      supabase.rpc('get_wa_campaign_views_advance', {
        p_client_id: clientId,
        p_from: from,
        p_to: to,
        p_page_type: pageType,
      }),
      supabase.rpc('get_wa_campaign_cells_advance', {
        p_client_id: clientId,
        p_from: from,
        p_to: to,
        p_page_type: pageType,
      }),
      fetchCampaignCosts(supabase, clientId, from, to).catch((err) => {
        console.warn(
          '[campaign-views_advance] cost fetch failed:',
          err?.message || err
        );
        return emptyCostMaps();
      }),
    ]);
    const costMaps = costSettled || emptyCostMaps();

    if (mainRes.error) {
      const message = mainRes.error.message || 'get_wa_campaign_views_advance failed';
      const hint = /could not find|does not exist|PGRST202/i.test(message)
        ? ' Deploy supabase/rpc/get_wa_campaign_views_advance.sql in the Supabase SQL editor.'
        : /timeout|canceling statement/i.test(message)
          ? ' Try a shorter date range, or create idx_ga4_wa_campaign_client_date.'
          : '';
      return NextResponse.json({ error: message + hint }, { status: 500 });
    }

    const payload = mainRes.data && typeof mainRes.data === 'object' ? mainRes.data : {};
    const campaigns = Array.isArray(payload.campaigns) ? payload.campaigns : [];
    const daily = Array.isArray(payload.daily)
      ? payload.daily.map((r) => ({
          report_date: String(r.report_date).split('T')[0],
          views: Number(r.views) || 0,
        }))
      : [];

    let cells = [];
    let cellsSource = 'none';

    if (!cellsRes.error && Array.isArray(cellsRes.data) && cellsRes.data.length) {
      cells = normalizeCells(cellsRes.data);
      cellsSource = 'get_wa_campaign_cells_advance';
    } else if (Array.isArray(payload.cells) && payload.cells.length) {
      cells = normalizeCells(payload.cells);
      cellsSource = 'get_wa_campaign_views_advance.cells';
    } else {
      try {
        cells = await fetchCellsFallback(supabase, clientId, from, to, pageType);
        cellsSource = 'table-fallback';
      } catch (fallbackErr) {
        console.warn(
          '[campaign-views_advance] cells fallback failed:',
          fallbackErr?.message || fallbackErr
        );
      }
    }

    return NextResponse.json({
      campaigns: mergeCampaignsWithCosts(campaigns, costMaps),
      daily,
      cells,
      meta: {
        ...(payload.meta && typeof payload.meta === 'object' ? payload.meta : {}),
        source: 'get_wa_campaign_views_advance',
        costSource: costMaps?.source || 'none',
        cellsSource,
        pageType,
        clientId,
        dealerScoped: true,
        prefix: 'WA| / WA |',
        costIncludesAdsOnly: true,
      },
    });
  } catch (err) {
    const message = err?.message || 'Failed to load campaign views';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
