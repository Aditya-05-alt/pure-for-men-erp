import { coerceDateRange } from '@/lib/pipeline/dates';
import { missingDatesInRange } from '@/lib/admin/pipelineDates';

const COMPLETE_TABLE = 'smart_ga4_day_complete';
const PAGE_TABLE = 'smart_ga4_page_data';
const FINAL_TABLE = 'smart_final_data';
const PAGE_SIZE = 1000;

function dayKey(value) {
  return String(value ?? '').split('T')[0].slice(0, 10);
}

async function fetchAllRows(supabase, table, select, filters) {
  const rows = [];
  let offset = 0;

  while (true) {
    let q = supabase.from(table).select(select).range(offset, offset + PAGE_SIZE - 1);
    for (const [key, val] of Object.entries(filters)) {
      if (key === 'gte') q = q.gte(val.col, val.value);
      else if (key === 'lte') q = q.lte(val.col, val.value);
      else if (key === 'is') q = q.is(val.col, val.value);
    }

    const { data, error } = await q;
    if (error) throw new Error(error.message);
    if (!data?.length) break;
    rows.push(...data);
    if (data.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  return rows;
}

/** client_id → Set of YYYY-MM-DD with a completion marker (GA4 raw edge sync). */
export async function fetchRawCompleteByClient(supabase, from, to) {
  const rows = await fetchAllRows(supabase, COMPLETE_TABLE, 'client_id, report_date', {
    gte: { col: 'report_date', value: from },
    lte: { col: 'report_date', value: to },
  });

  const byClient = new Map();
  for (const row of rows) {
    const clientId = String(row.client_id ?? '').trim();
    const day = dayKey(row.report_date);
    if (!clientId || !day) continue;
    if (!byClient.has(clientId)) byClient.set(clientId, new Set());
    byClient.get(clientId).add(day);
  }
  return byClient;
}

/** client_id → Set of days that still have unfiltered page rows (vdp_conditions IS NULL). */
export async function fetchUnfilteredDaysByClient(supabase, from, to) {
  const rows = await fetchAllRows(
    supabase,
    PAGE_TABLE,
    'client_id, report_date',
    {
      gte: { col: 'report_date', value: from },
      lte: { col: 'report_date', value: to },
      is: { col: 'vdp_conditions', value: null },
    }
  );

  const byClient = new Map();
  for (const row of rows) {
    const clientId = String(row.client_id ?? '').trim();
    const day = dayKey(row.report_date);
    if (!clientId || !day) continue;
    if (!byClient.has(clientId)) byClient.set(clientId, new Set());
    byClient.get(clientId).add(day);
  }
  return byClient;
}

/** client_id → Set of YYYY-MM-DD present in smart_final_data (final edge / Step 3). */
export async function fetchFinalDaysByClient(supabase, from, to) {
  const rows = await fetchAllRows(supabase, FINAL_TABLE, 'client_id, report_date', {
    gte: { col: 'report_date', value: from },
    lte: { col: 'report_date', value: to },
  });

  const byClient = new Map();
  for (const row of rows) {
    const clientId = String(row.client_id ?? '').trim();
    const day = dayKey(row.report_date);
    if (!clientId || !day) continue;
    if (!byClient.has(clientId)) byClient.set(clientId, new Set());
    byClient.get(clientId).add(day);
  }
  return byClient;
}

export function rawSyncStatus(rangeDays, completeDays) {
  const filled = completeDays || new Set();
  const missing = missingDatesInRange(
    rangeDays[0],
    rangeDays[rangeDays.length - 1],
    filled
  ).filter((d) => rangeDays.includes(d));

  return {
    synced: rangeDays.length > 0 && missing.length === 0,
    filled: filled.size,
    total: rangeDays.length,
    missingDates: missing,
  };
}

/** Filtration = every day in range that has raw completion has no NULL vdp_conditions rows. */
export function filtrationSyncStatus(rangeDays, completeDays, unfilteredDays) {
  const complete = completeDays || new Set();
  const unfiltered = unfilteredDays || new Set();

  const requiredDays = rangeDays.filter((d) => complete.has(d));
  if (requiredDays.length === 0) {
    return {
      synced: false,
      filled: 0,
      total: rangeDays.length,
      missingDates: [...rangeDays],
      note: 'Complete GA4 raw sync first',
    };
  }

  const missing = requiredDays.filter((d) => unfiltered.has(d));
  return {
    synced: missing.length === 0,
    filled: requiredDays.length - missing.length,
    total: requiredDays.length,
    missingDates: missing,
  };
}

/** Final = every day in range with raw completion has rows in smart_final_data. */
export function finalSyncStatus(rangeDays, completeDays, finalDays) {
  const complete = completeDays || new Set();
  const final = finalDays || new Set();

  const requiredDays = rangeDays.filter((d) => complete.has(d));
  if (requiredDays.length === 0) {
    return {
      synced: false,
      filled: 0,
      total: rangeDays.length,
      missingDates: [...rangeDays],
      note: 'Complete GA4 raw sync first',
    };
  }

  const missing = requiredDays.filter((d) => !final.has(d));
  return {
    synced: missing.length === 0,
    filled: requiredDays.length - missing.length,
    total: requiredDays.length,
    missingDates: missing,
  };
}

export function buildDealerSyncRow({
  dealer,
  rangeDays,
  rawCompleteByClient,
  unfilteredByClient,
  finalByClient,
}) {
  const clientId = dealer.ga4CustomerId;
  if (!clientId) {
    return {
      dealerId: dealer.id,
      name: dealer.name,
      clientId: null,
      ga4Raw: { synced: false, missingDates: rangeDays, note: 'No GA4 client ID' },
      filtration: { synced: false, missingDates: rangeDays, note: 'No GA4 client ID' },
      finalData: { synced: false, missingDates: rangeDays, note: 'No GA4 client ID' },
    };
  }

  const completeDays = rawCompleteByClient.get(clientId) || new Set();
  const unfilteredDays = unfilteredByClient.get(clientId) || new Set();
  const finalDays = finalByClient.get(clientId) || new Set();

  return {
    dealerId: dealer.id,
    name: dealer.name,
    clientId,
    ga4Raw: rawSyncStatus(rangeDays, completeDays),
    filtration: filtrationSyncStatus(rangeDays, completeDays, unfilteredDays),
    finalData: finalSyncStatus(rangeDays, completeDays, finalDays),
  };
}

export async function loadDailySyncMatrix(supabase, dealers, fromRaw, toRaw) {
  const { from, to, dates: rangeDays } = coerceDateRange(fromRaw, toRaw);
  if (!rangeDays.length) {
    throw new Error('Invalid date range');
  }

  const [rawCompleteByClient, unfilteredByClient, finalByClient] = await Promise.all([
    fetchRawCompleteByClient(supabase, from, to),
    fetchUnfilteredDaysByClient(supabase, from, to),
    fetchFinalDaysByClient(supabase, from, to),
  ]);

  const rows = dealers.map((dealer) =>
    buildDealerSyncRow({
      dealer,
      rangeDays,
      rawCompleteByClient,
      unfilteredByClient,
      finalByClient,
    })
  );

  return { from, to, rangeDays, rows };
}
