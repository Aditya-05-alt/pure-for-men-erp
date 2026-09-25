import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

export const maxDuration = 60;

const HOOT_TABLE = 'smart_hoot_inventory';
const SCRAP_TABLE = 'smart_scrap_inventory';
const VIN_SELECT =
  'vin, make, model, year, condition, stock_number, first_seen, last_seen';

function trimStr(v) {
  return String(v ?? '').trim();
}

function ymd(d) {
  if (!d) return null;
  const s = String(d).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

function weekdayLabel(ymdStr) {
  const [y, m, d] = ymdStr.split('-').map(Number);
  const names = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return names[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
}

function addDaysYmd(ymdStr, days) {
  const [y, m, d] = ymdStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

function eachDateInclusive(from, to, maxDays = 92) {
  const start = ymd(from);
  const end = ymd(to);
  if (!start || !end || start > end) return [];
  const out = [];
  let cur = start;
  while (cur <= end && out.length < maxDays) {
    out.push(cur);
    cur = addDaysYmd(cur, 1);
  }
  return out;
}

function buildDayRows(firstSeen, lastSeen, rangeFrom, rangeTo) {
  const first = ymd(firstSeen);
  const last = ymd(lastSeen);
  const dates = eachDateInclusive(rangeFrom, rangeTo);
  const rows = [];
  let available = 0;
  let absent = 0;

  for (const date of dates) {
    const day = Number(date.slice(8, 10));
    const inWindow =
      Boolean(first && last) && date >= first && date <= last;
    if (inWindow) available += 1;
    else absent += 1;
    rows.push({
      day,
      date,
      weekday: weekdayLabel(date),
      status: inWindow ? 'available' : 'absent',
    });
  }

  return { days: rows, availableDays: available, absentDays: absent };
}

function supabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return null;
  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function mergeVinRow(byVin, row, source) {
  const vin = trimStr(row.vin);
  if (!vin) return;
  const first = ymd(row.first_seen);
  const last = ymd(row.last_seen);
  const prev = byVin.get(vin);
  if (!prev) {
    byVin.set(vin, {
      vin,
      make: trimStr(row.make) || null,
      model: trimStr(row.model) || null,
      year: trimStr(row.year) || null,
      condition: trimStr(row.condition) || null,
      stock_number: trimStr(row.stock_number) || null,
      first_seen: first,
      last_seen: last,
      sources: [source],
    });
    return;
  }
  if (first && (!prev.first_seen || first < prev.first_seen)) {
    prev.first_seen = first;
  }
  if (last && (!prev.last_seen || last > prev.last_seen)) {
    prev.last_seen = last;
  }
  if (!prev.make && row.make) prev.make = trimStr(row.make);
  if (!prev.model && row.model) prev.model = trimStr(row.model);
  if (!prev.year && row.year) prev.year = trimStr(row.year);
  if (!prev.condition && row.condition) prev.condition = trimStr(row.condition);
  if (!prev.stock_number && row.stock_number) {
    prev.stock_number = trimStr(row.stock_number);
  }
  if (!prev.sources.includes(source)) prev.sources.push(source);
}

function applySearchFilter(query, q) {
  if (!q) return query;
  return query.or(
    `vin.ilike.%${q}%,stock_number.ilike.%${q}%,make.ilike.%${q}%,model.ilike.%${q}%`
  );
}

/** Hoot inventory is keyed by customer_name. */
async function fetchHootRows(supabase, dealerName, q) {
  if (!dealerName) return [];
  let query = supabase
    .from(HOOT_TABLE)
    .select(VIN_SELECT)
    .ilike('customer_name', dealerName)
    .not('vin', 'is', null)
    .neq('vin', '')
    .limit(5000);
  query = applySearchFilter(query, q);
  const { data, error } = await query;
  if (error) throw new Error(`${HOOT_TABLE}: ${error.message}`);
  return data || [];
}

/**
 * Scrap inventory is keyed by customer_id (= ga4_customer_id).
 * Name often differs from smart_hoot_config.customer_name, so id match is required.
 * Falls back to customer_name when clientId is missing.
 */
async function fetchScrapRows(supabase, dealerName, clientId, q) {
  let query = supabase
    .from(SCRAP_TABLE)
    .select(VIN_SELECT)
    .not('vin', 'is', null)
    .neq('vin', '')
    .limit(5000);

  if (clientId) {
    query = query.eq('customer_id', clientId);
  } else if (dealerName) {
    query = query.ilike('customer_name', dealerName);
  } else {
    return [];
  }

  query = applySearchFilter(query, q);
  const { data, error } = await query;
  if (error) throw new Error(`${SCRAP_TABLE}: ${error.message}`);
  return data || [];
}

/** UTC today YYYY-MM-DD. */
function todayYmd() {
  return new Date().toISOString().slice(0, 10);
}

/** VINs currently on lot (live feed) for this GA4 client. */
async function fetchLiveVinSet(supabase, clientId) {
  const set = new Set();
  const cid = trimStr(clientId);
  if (!cid) return set;
  const { data, error } = await supabase
    .from('smart_hoot_inventory_live')
    .select('vin')
    .eq('ga4_customer_id', cid)
    .not('vin', 'is', null)
    .neq('vin', '')
    .limit(8000);
  if (error) {
    console.warn('[vehicle-age] live vins:', error.message);
    return set;
  }
  for (const row of data || []) {
    const vin = trimStr(row.vin);
    if (vin) set.add(vin);
  }
  return set;
}

/**
 * Still-on-lot: extend last_seen → today so age / calendar are not stuck
 * on a stale history sync day.
 */
function applyLiveLastSeen(vehicles, liveVins) {
  const asOf = todayYmd();
  if (!asOf) return vehicles;
  let maxLast = null;
  for (const v of vehicles) {
    const last = ymd(v.last_seen);
    if (last && (!maxLast || last > maxLast)) maxLast = last;
  }
  return vehicles.map((v) => {
    const first = ymd(v.first_seen);
    let last = ymd(v.last_seen);
    const stillPresent =
      liveVins.has(trimStr(v.vin)) ||
      (liveVins.size === 0 && maxLast && last === maxLast);
    if (stillPresent && (!last || asOf > last)) last = asOf;
    const age_days =
      first && last
        ? Math.max(
            0,
            Math.round(
              (Date.parse(`${last}T00:00:00Z`) -
                Date.parse(`${first}T00:00:00Z`)) /
                86400000
            ) + 1
          )
        : 0;
    return { ...v, last_seen: last, age_days };
  });
}

/** List VINs for a dealer from hoot (by name) + scrap (by client id). */
async function listVins(supabase, dealerName, clientId, q) {
  const [hootRows, scrapRows, liveVins] = await Promise.all([
    fetchHootRows(supabase, dealerName, q),
    fetchScrapRows(supabase, dealerName, clientId, q),
    fetchLiveVinSet(supabase, clientId),
  ]);

  const byVin = new Map();
  for (const row of hootRows) mergeVinRow(byVin, row, 'hoot');
  for (const row of scrapRows) mergeVinRow(byVin, row, 'scrap');

  return applyLiveLastSeen(
    [...byVin.values()].sort((a, b) => a.vin.localeCompare(b.vin)),
    liveVins
  );
}

async function fetchHootVinRows(supabase, dealerName, vin) {
  if (!dealerName) return [];
  const { data, error } = await supabase
    .from(HOOT_TABLE)
    .select(
      'vin, make, model, year, condition, stock_number, location, first_seen, last_seen, url'
    )
    .ilike('customer_name', dealerName)
    .eq('vin', vin)
    .limit(200);
  if (error) throw new Error(`${HOOT_TABLE}: ${error.message}`);
  return data || [];
}

async function fetchScrapVinRows(supabase, dealerName, clientId, vin) {
  let query = supabase
    .from(SCRAP_TABLE)
    .select(
      'vin, make, model, year, condition, stock_number, location, first_seen, last_seen, url'
    )
    .eq('vin', vin)
    .limit(200);

  if (clientId) {
    query = query.eq('customer_id', clientId);
  } else if (dealerName) {
    query = query.ilike('customer_name', dealerName);
  } else {
    return [];
  }

  const { data, error } = await query;
  if (error) throw new Error(`${SCRAP_TABLE}: ${error.message}`);
  return data || [];
}

/** Calendar for one VIN from first_seen → last_seen (hoot+scrap). */
async function calendarForVin(
  supabase,
  dealerName,
  clientId,
  vin,
  rangeFrom,
  rangeTo
) {
  const [hootRows, scrapRows] = await Promise.all([
    fetchHootVinRows(supabase, dealerName, vin),
    fetchScrapVinRows(supabase, dealerName, clientId, vin),
  ]);
  const data = [...hootRows, ...scrapRows];
  if (!data.length) {
    return { vehicle: null, days: [], availableDays: 0, absentDays: 0 };
  }

  const sources = [];
  if (hootRows.length) sources.push('hoot');
  if (scrapRows.length) sources.push('scrap');

  let firstSeen = null;
  let lastSeen = null;
  const vehicle = {
    vin,
    dealer: dealerName,
    client_id: clientId || null,
    make: null,
    model: null,
    year: null,
    condition: null,
    stock_number: null,
    location: null,
    url: null,
    sources,
  };

  for (const row of data) {
    const first = ymd(row.first_seen);
    const last = ymd(row.last_seen);
    if (first && (!firstSeen || first < firstSeen)) firstSeen = first;
    if (last && (!lastSeen || last > lastSeen)) lastSeen = last;
    if (!vehicle.make && row.make) vehicle.make = trimStr(row.make);
    if (!vehicle.model && row.model) vehicle.model = trimStr(row.model);
    if (!vehicle.year && row.year) vehicle.year = trimStr(row.year);
    if (!vehicle.condition && row.condition) {
      vehicle.condition = trimStr(row.condition);
    }
    if (!vehicle.stock_number && row.stock_number) {
      vehicle.stock_number = trimStr(row.stock_number);
    }
    if (!vehicle.location && row.location) vehicle.location = trimStr(row.location);
    if (!vehicle.url && row.url) vehicle.url = trimStr(row.url);
  }

  // Extend last_seen to today when this VIN is still on the live lot feed.
  if (clientId && firstSeen) {
    const liveVins = await fetchLiveVinSet(supabase, clientId);
    const asOf = todayYmd();
    const stillPresent = liveVins.has(vin);
    if (stillPresent && asOf && (!lastSeen || asOf > lastSeen)) {
      lastSeen = asOf;
    }
  }

  vehicle.first_seen = firstSeen;
  vehicle.last_seen = lastSeen;
  vehicle.age_days =
    firstSeen && lastSeen
      ? Math.max(
          0,
          Math.round(
            (Date.parse(`${lastSeen}T00:00:00Z`) -
              Date.parse(`${firstSeen}T00:00:00Z`)) /
              86400000
          ) + 1
        )
      : 0;

  const built = buildDayRows(firstSeen, lastSeen, rangeFrom, rangeTo);

  return {
    vehicle,
    from: rangeFrom,
    to: rangeTo,
    ...built,
  };
}

/**
 * Vehicle Age — smart_hoot_inventory + smart_scrap_inventory.
 * ?mode=vins&dealer=Name&clientId=GA4&q=
 * ?mode=calendar&dealer=Name&clientId=GA4&vin=&from=&to=
 */
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const mode = trimStr(searchParams.get('mode') || 'calendar');
  const dealer = trimStr(searchParams.get('dealer'));
  const clientId = trimStr(
    searchParams.get('clientId') || searchParams.get('client_id')
  );
  const vin = trimStr(searchParams.get('vin'));
  const q = trimStr(searchParams.get('q'));
  const rangeFrom = ymd(searchParams.get('from'));
  const rangeTo = ymd(searchParams.get('to'));

  const supabase = supabaseAdmin();
  if (!supabase) {
    return NextResponse.json(
      { error: 'SUPABASE_SERVICE_ROLE_KEY is not configured on the server' },
      { status: 503 }
    );
  }

  try {
    if (!dealer && !clientId) {
      return NextResponse.json(
        { error: 'Missing dealer or clientId' },
        { status: 400 }
      );
    }

    if (mode === 'vins') {
      const vins = await listVins(supabase, dealer, clientId || null, q || null);
      return NextResponse.json({
        dealer,
        clientId: clientId || null,
        vins,
      });
    }

    if (!vin) {
      return NextResponse.json({ error: 'Missing vin' }, { status: 400 });
    }
    if (!rangeFrom || !rangeTo) {
      return NextResponse.json(
        { error: 'Missing or invalid from/to (YYYY-MM-DD)' },
        { status: 400 }
      );
    }
    if (rangeFrom > rangeTo) {
      return NextResponse.json(
        { error: `Invalid range: from (${rangeFrom}) > to (${rangeTo})` },
        { status: 400 }
      );
    }

    const result = await calendarForVin(
      supabase,
      dealer,
      clientId || null,
      vin,
      rangeFrom,
      rangeTo
    );
    if (!result.vehicle) {
      return NextResponse.json(
        {
          error: `No inventory row for VIN ${vin} at ${dealer || clientId}`,
        },
        { status: 404 }
      );
    }
    return NextResponse.json(result);
  } catch (err) {
    console.error('[vehicle-age]', err);
    return NextResponse.json(
      { error: err?.message || 'Vehicle age query failed' },
      { status: 500 }
    );
  }
}
