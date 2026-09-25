import {
  RPC_CHUNK_CONCURRENCY,
  RPC_CHUNK_DAYS,
  isStatementTimeoutError,
} from '@/lib/api/chunkedRpc';
import { chunkDateRangesInclusive, enumerateDatesInclusive } from '@/lib/ga4/dateRange';
import { normalizeReportDate } from '@/lib/ga4/aggregatePageDataRows';

async function runFinalDataRange(supabase, clientId, range, invParams) {
  const { data, error } = await supabase.rpc('build_date_wise_final_data', {
    p_date_from: String(range.from).slice(0, 10),
    p_date_to: String(range.to).slice(0, 10),
    p_client_id: String(clientId).trim(),
    p_condition: 'BOTH',
    ...invParams,
  });
  if (error) throw error;
  return data || [];
}

async function runFinalDataRangeResilient(supabase, clientId, range, invParams) {
  try {
    return await runFinalDataRange(supabase, clientId, range, invParams);
  } catch (error) {
    if (!isStatementTimeoutError(error)) throw error;

    const days = enumerateDatesInclusive(range.from, range.to);
    if (days.length <= 1) throw error;

    const mid = Math.ceil(days.length / 2);
    const left = { from: days[0], to: days[mid - 1] };
    const right = { from: days[mid], to: days[days.length - 1] };

    const [leftRows, rightRows] = await Promise.all([
      runFinalDataRangeResilient(supabase, clientId, left, invParams),
      runFinalDataRangeResilient(supabase, clientId, right, invParams),
    ]);
    return [...leftRows, ...rightRows];
  }
}

export function aggregateFinalDataDailyRows(rows) {
  const daily = {};
  let total = 0;
  for (const row of rows || []) {
    const day = normalizeReportDate(row.report_date);
    const views = Number(row.views) || 0;
    if (!day || views === 0) continue;
    daily[day] = (daily[day] || 0) + views;
    total += views;
  }
  return { daily, total };
}

/**
 * Daily VDP views from smart_final_data in small date windows (avoids statement_timeout).
 */
export async function fetchFinalDataDailyChunked(
  supabase,
  {
    clientId,
    from,
    to,
    invParams = {},
    chunkDays = RPC_CHUNK_DAYS,
    concurrency = RPC_CHUNK_CONCURRENCY,
    onCancelCheck,
    onBatch,
  } = {}
) {
  if (!clientId || !from || !to) return { daily: {}, total: 0 };
  if (onCancelCheck?.()) return null;

  const ranges = chunkDateRangesInclusive(from, to, chunkDays);
  if (!ranges.length) return { daily: {}, total: 0 };

  const merged = [];
  const total = ranges.length;
  let completed = 0;

  const emit = () => {
    if (onBatch) onBatch(aggregateFinalDataDailyRows(merged), { completed, total });
  };

  if (ranges.length === 1) {
    const rows = await runFinalDataRangeResilient(
      supabase,
      clientId,
      ranges[0],
      invParams
    );
    if (onCancelCheck?.()) return null;
    if (rows?.length) merged.push(...rows);
    completed = 1;
    emit();
    return aggregateFinalDataDailyRows(merged);
  }

  for (let i = 0; i < ranges.length; i += concurrency) {
    if (onCancelCheck?.()) return null;
    const batch = ranges.slice(i, i + concurrency);
    const results = await Promise.all(
      batch.map((range) =>
        runFinalDataRangeResilient(supabase, clientId, range, invParams)
      )
    );
    for (const rows of results) {
      completed += 1;
      if (rows?.length) merged.push(...rows);
      emit();
    }
  }

  if (onCancelCheck?.()) return null;
  return aggregateFinalDataDailyRows(merged);
}
