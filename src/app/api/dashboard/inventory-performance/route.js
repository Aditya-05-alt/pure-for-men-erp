import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

export const maxDuration = 60;

function trimStr(v) {
  return String(v ?? '').trim();
}

/** Display VIN: real VIN, else stock number — never blank when stock exists. */
function displayVin(row) {
  return trimStr(row.inv_vin) || trimStr(row.inv_stock_number) || null;
}

function needsVinEnrichment(rows) {
  if (!rows?.length) return false;
  const hasVinKey = Object.prototype.hasOwnProperty.call(rows[0], 'inv_vin');
  if (!hasVinKey) return true;
  // Enrich when any row is missing VIN but has a stock number we can look up
  return rows.some(
    (r) => !trimStr(r.inv_vin) && trimStr(r.inv_stock_number)
  );
}

async function lookupVinByStock(supabase, clientId, stockNumbers) {
  const vinByStock = new Map();
  const unique = [...new Set(stockNumbers.map(trimStr).filter(Boolean))];
  const chunkSize = 100;

  for (let i = 0; i < unique.length; i += chunkSize) {
    const chunk = unique.slice(i, i + chunkSize);
    const { data, error } = await supabase
      .from('smart_final_data')
      .select('inv_stock_number, inv_vin')
      .eq('client_id', clientId)
      .in('inv_stock_number', chunk)
      .not('inv_vin', 'is', null)
      .neq('inv_vin', '');

    if (error) {
      console.error('[inventory-performance-advance] VIN lookup', error.message);
      break;
    }

    for (const row of data || []) {
      const stock = trimStr(row.inv_stock_number);
      const vin = trimStr(row.inv_vin);
      if (stock && vin && !vinByStock.has(stock)) {
        vinByStock.set(stock, vin);
      }
    }
  }

  return vinByStock;
}

function normalizeOutputRow(r) {
  const stock = trimStr(r.inv_stock_number) || null;
  const vin = displayVin({
    inv_vin: r.inv_vin,
    inv_stock_number: stock,
  });
  const ageDays =
    r.age_days == null || Number.isNaN(Number(r.age_days))
      ? null
      : Number(r.age_days);
  return {
    inv_vin: vin,
    inv_stock_number: stock,
    inv_make: r.inv_make,
    inv_model: r.inv_model,
    inv_year: r.inv_year,
    inv_condition: r.inv_condition,
    inv_category: r.inv_category,
    views: r.views,
    unique_views: r.unique_views,
    age_days: ageDays,
    channel_views: r.channel_views && typeof r.channel_views === 'object'
      ? r.channel_views
      : {},
  };
}

function vehicleMatchKey(vin, stock) {
  return (trimStr(vin) || trimStr(stock)).toUpperCase();
}

/**
 * Compact map from get_inventory_channel_views_map_advance:
 * { "VIN": { "Organic Search": 10, ... }, ... }
 */
function pivotChannelViewsMap(mapObj) {
  const byKey = new Map();
  const totals = new Map();
  const raw = mapObj && typeof mapObj === 'object' ? mapObj : {};

  for (const [rawVk, channels] of Object.entries(raw)) {
    const vk = trimStr(rawVk).toUpperCase();
    if (!vk || !channels || typeof channels !== 'object') continue;
    const bucket = {};
    for (const [channel, viewsRaw] of Object.entries(channels)) {
      const channelName = trimStr(channel);
      const views = Number(viewsRaw) || 0;
      if (!channelName || views <= 0) continue;
      bucket[channelName] = (bucket[channelName] || 0) + views;
      totals.set(channelName, (totals.get(channelName) || 0) + views);
    }
    if (Object.keys(bucket).length) byKey.set(vk, bucket);
  }

  const columns = [...totals.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([name]) => name);

  return { byKey, columns };
}

async function fetchChannelViewsMap(supabase, params) {
  const { data, error } = await supabase.rpc(
    'get_inventory_channel_views_map_advance',
    params
  );
  if (error) return { byKey: new Map(), columns: [], error };
  return { ...pivotChannelViewsMap(data || {}), error: null };
}

/** Inclusive YYYY-MM-DD days between from/to (UTC). */
function eachYmd(from, to) {
  const out = [];
  const start = ymd(from);
  const end = ymd(to);
  if (!start || !end || end < start) return out;
  let t = Date.parse(`${start}T00:00:00Z`);
  const endT = Date.parse(`${end}T00:00:00Z`);
  while (t <= endT) {
    out.push(new Date(t).toISOString().slice(0, 10));
    t += 86400000;
  }
  return out;
}

/**
 * Large dealers (A&L): full-range channel join is I/O heavy.
 * Day chunks hit the covering VDP index (~0.4s/day) and merge in parallel.
 */
async function fetchChannelViewsMapChunked(supabase, params) {
  const days = eachYmd(params.p_from, params.p_to);
  if (days.length <= 3) {
    return fetchChannelViewsMap(supabase, params);
  }

  const byKey = new Map();
  const totals = new Map();
  let firstError = null;
  const concurrency = 5;

  for (let i = 0; i < days.length; i += concurrency) {
    const batch = days.slice(i, i + concurrency);
    const parts = await Promise.all(
      batch.map((day) =>
        fetchChannelViewsMap(supabase, {
          ...params,
          p_from: day,
          p_to: day,
        })
      )
    );
    for (const part of parts) {
      if (part.error && !firstError) firstError = part.error;
      for (const [vk, channels] of part.byKey || []) {
        const bucket = byKey.get(vk) || {};
        for (const [channel, viewsRaw] of Object.entries(channels || {})) {
          const views = Number(viewsRaw) || 0;
          if (!channel || views <= 0) continue;
          bucket[channel] = (bucket[channel] || 0) + views;
          totals.set(channel, (totals.get(channel) || 0) + views);
        }
        byKey.set(vk, bucket);
      }
    }
  }

  if (!byKey.size && firstError) {
    return { byKey, columns: [], error: firstError };
  }

  const columns = [...totals.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([name]) => name);

  return { byKey, columns, error: null };
}

function attachChannelViews(rows, channelByKey) {
  return (rows || []).map((r) => {
    const vk = vehicleMatchKey(r.inv_vin, r.inv_stock_number);
    let channel_views = { ...(channelByKey.get(vk) || {}) };
    const target = Number(r.views) || 0;
    const keys = Object.keys(channel_views);
    const chSum = keys.reduce((s, k) => s + (Number(channel_views[k]) || 0), 0);

    // Keep channel columns consistent with VDP (Current) — fix rounding drift.
    if (keys.length && target > 0 && chSum > 0 && chSum !== target) {
      const scale = target / chSum;
      let allocated = 0;
      const scaled = {};
      keys.forEach((k, i) => {
        if (i === keys.length - 1) {
          scaled[k] = Math.max(0, target - allocated);
        } else {
          const n = Math.round((Number(channel_views[k]) || 0) * scale);
          scaled[k] = n;
          allocated += n;
        }
      });
      channel_views = scaled;
    }

    return { ...r, channel_views };
  });
}

function ymd(d) {
  if (!d) return null;
  const s = String(d).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

/** UTC today YYYY-MM-DD — used to extend age for vehicles still on lot. */
function todayYmd() {
  return new Date().toISOString().slice(0, 10);
}

/** Same formula as Vehicle Age: inclusive days first_seen → last_seen. */
function ageDaysFromSeen(firstSeen, lastSeen) {
  const first = ymd(firstSeen);
  const last = ymd(lastSeen);
  if (!first || !last || last < first) return null;
  const days =
    Math.round(
      (Date.parse(`${last}T00:00:00Z`) - Date.parse(`${first}T00:00:00Z`)) /
        86400000
    ) + 1;
  return days > 0 ? days : null;
}

function ageLookupKeys(vin, stock) {
  const keys = [];
  const v = trimStr(vin).toLowerCase();
  const s = trimStr(stock).toLowerCase();
  if (v) keys.push(`vin:${v}`);
  if (s) keys.push(`s:${s}`);
  return keys;
}

/**
 * Age map via single SQL RPC (replaces multi-page PostgREST scans).
 * Same rules: live extends last_seen → today; updated today → min 2d.
 */
async function fetchAgeDaysMap(supabase, clientId, from, to) {
  const ageByKey = new Map();
  const updatedTodayKeys = new Set();
  const cid = trimStr(clientId);
  if (!cid) return ageByKey;

  const { data, error } = await supabase.rpc('get_inventory_age_map_advance', {
    p_client_id: cid,
    p_from: from,
    p_to: to,
  });

  if (error) {
    console.warn(
      '[inventory-performance-advance] age map rpc:',
      error.message
    );
    ageByKey._updatedTodayKeys = updatedTodayKeys;
    return ageByKey;
  }

  for (const row of data || []) {
    const keys = ageLookupKeys(row.inv_vin, row.inv_stock_number);
    if (!keys.length) continue;
    let days = ageDaysFromSeen(row.first_seen, row.last_seen);
    const updatedToday = Boolean(row.updated_today) || Boolean(row.is_live);
    if (days == null && row.is_live) days = updatedToday ? 2 : 1;
    if (days == null) continue;
    if (updatedToday && days <= 1) days = 2;
    for (const key of keys) {
      if (updatedToday) updatedTodayKeys.add(key);
      const prev = ageByKey.get(key);
      if (prev == null || days > prev) ageByKey.set(key, days);
    }
  }

  ageByKey._updatedTodayKeys = updatedTodayKeys;
  return ageByKey;
}

function attachAgeDays(rows, ageByKey) {
  const updatedTodayKeys = ageByKey?._updatedTodayKeys || new Set();
  return (rows || []).map((r) => {
    const vin = trimStr(r.inv_vin);
    if (vin.toLowerCase() === 'unassigned') {
      return { ...r, age_days: null };
    }
    const keys = ageLookupKeys(r.inv_vin, r.inv_stock_number);
    let age = null;
    let updatedToday = false;
    for (const key of keys) {
      if (updatedTodayKeys.has(key)) updatedToday = true;
      if (!ageByKey.has(key)) continue;
      const days = ageByKey.get(key);
      if (age == null || days > age) age = days;
    }
    if (age == null && keys.length) age = updatedToday ? 2 : 1;
    else if (updatedToday && age != null && age <= 1) age = 2;
    return { ...r, age_days: age };
  });
}

/** Normalize GA4 channel labels (Paid Search / paid_search → Paid Search). */
function displayChannelName(raw) {
  const key = trimStr(raw)
    .toLowerCase()
    .replace(/[_]+/g, ' ')
    .replace(/\s+/g, ' ');
  if (!key) return null;
  return key
    .split(' ')
    .map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1) : w))
    .join(' ');
}

function listParam(raw) {
  if (!raw) return null;
  const parts = String(raw)
    .split(',')
    .map((v) => trimStr(v))
    .filter((v) => v && v.toLowerCase() !== 'all');
  return parts.length ? parts.join(',') : null;
}

function channelListParam(raw) {
  if (!raw) return null;
  const parts = String(raw)
    .split(',')
    .map((v) => displayChannelName(v) || trimStr(v))
    .filter((v) => v && v.toLowerCase() !== 'all');
  return parts.length ? parts.join(',') : null;
}

/** Inventory performance vehicles — get_inventory_performance_advance (+ VIN enrich). */
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const clientId = searchParams.get('clientId')?.trim();
  const from = searchParams.get('from')?.slice(0, 10);
  const to = searchParams.get('to')?.slice(0, 10);
  const make = listParam(searchParams.get('make'));
  const condition = listParam(searchParams.get('condition'));
  const category = listParam(searchParams.get('category'));
  const search = searchParams.get('search')?.trim() || null;
  const channel = channelListParam(searchParams.get('channel'));
  // lite = views only (prior period / filter option lists) — skip age + channels.
  const lite =
    searchParams.get('lite') === '1' ||
    searchParams.get('lite') === 'true';
  // channels=1 loads the heavy channel matrix (background fill for big dealers).
  const wantChannels =
    searchParams.get('channels') === '1' ||
    searchParams.get('channels') === 'true';
  // channelsOnly = only matrix (merge into already-loaded core rows).
  const channelsOnly =
    searchParams.get('channelsOnly') === '1' ||
    searchParams.get('channelsOnly') === 'true';

  if (!clientId || !from || !to) {
    return NextResponse.json(
      { error: 'Missing clientId, from, or to' },
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

  if (channelsOnly) {
    const channelParams = {
      p_client_id: clientId,
      p_from: from,
      p_to: to,
      p_make: make,
      p_condition: condition,
      p_category: category,
      p_search: search || null,
    };
    const { byKey, columns: channelColumns, error } =
      await fetchChannelViewsMapChunked(supabase, channelParams);
    if (error) {
      console.warn(
        '[inventory-performance-advance] channel views map:',
        error.message
      );
      return NextResponse.json({
        rows: [],
        channels: [],
        channelColumns: [],
        channelMatrix: [],
      });
    }
    const channels = channelColumns.slice().sort((a, b) => a.localeCompare(b));
    // Compact payload: vin/stock → channel views
    const channelMatrix = [...byKey.entries()].map(([vk, channel_views]) => ({
      vk,
      channel_views,
    }));
    return NextResponse.json({ channels, channelColumns, channelMatrix });
  }

  const rpcPromise = supabase.rpc('get_inventory_performance_advance', {
    p_client_id: clientId,
    p_from: from,
    p_to: to,
    p_make: make,
    p_condition: condition,
    p_category: category,
    p_search: search || null,
    p_channel: channel,
  });

  if (lite) {
    const { data, error } = await rpcPromise;
    if (error) {
      console.error('[inventory-performance-advance]', error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    let rows = data ?? [];
    if (needsVinEnrichment(rows)) {
      const vinByStock = await lookupVinByStock(
        supabase,
        clientId,
        rows.map((r) => r.inv_stock_number)
      );
      rows = rows.map((r) => {
        const stock = trimStr(r.inv_stock_number);
        const vin =
          trimStr(r.inv_vin) || vinByStock.get(stock) || stock || '';
        return {
          ...r,
          inv_vin: vin || null,
          inv_stock_number: stock || null,
        };
      });
    }
    rows = rows.map((r) =>
      normalizeOutputRow({
        ...r,
        age_days: null,
        channel_views: {},
      })
    );
    return NextResponse.json({ rows, channels: [], channelColumns: [] });
  }

  // Core path (fast): inventory rows + age. Channel matrix is optional —
  // big dealers load it in a follow-up request so the page can paint ASAP.
  const tasks = [
    rpcPromise,
    fetchAgeDaysMap(supabase, clientId, from, to),
  ];
  if (wantChannels) {
    tasks.push(
      fetchChannelViewsMapChunked(supabase, {
        p_client_id: clientId,
        p_from: from,
        p_to: to,
        p_make: make,
        p_condition: condition,
        p_category: category,
        p_search: search || null,
      })
    );
  }

  const [rpcRes, ageByKey, channelMapRes] = await Promise.all(tasks);

  if (rpcRes.error) {
    console.error('[inventory-performance-advance]', rpcRes.error.message);
    return NextResponse.json({ error: rpcRes.error.message }, { status: 500 });
  }

  if (channelMapRes?.error) {
    console.warn(
      '[inventory-performance-advance] channel views map:',
      channelMapRes.error.message
    );
  }

  let rows = rpcRes.data ?? [];
  const channelByKey = channelMapRes?.byKey || new Map();
  const channelColumns = channelMapRes?.columns || [];

  if (needsVinEnrichment(rows)) {
    const vinByStock = await lookupVinByStock(
      supabase,
      clientId,
      rows.map((r) => r.inv_stock_number)
    );
    rows = rows.map((r) => {
      const stock = trimStr(r.inv_stock_number);
      const vin =
        trimStr(r.inv_vin) || vinByStock.get(stock) || stock || '';
      return {
        ...r,
        inv_vin: vin || null,
        inv_stock_number: stock || null,
      };
    });
  }

  if (wantChannels) {
    rows = attachChannelViews(rows, channelByKey);
  }
  rows = attachAgeDays(rows, ageByKey).map(normalizeOutputRow);

  const channels = channelColumns.slice().sort((a, b) => a.localeCompare(b));

  return NextResponse.json({ rows, channels, channelColumns });
}
