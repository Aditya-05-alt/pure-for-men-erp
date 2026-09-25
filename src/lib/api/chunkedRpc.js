import { chunkDateRangesInclusive, enumerateDatesInclusive } from '@/lib/ga4/dateRange';

export const RPC_CHUNK_DAYS = 5;
export const RPC_CHUNK_CONCURRENCY = 3;

export function isStatementTimeoutError(error) {
  const msg = error?.message || '';
  return error?.code === '57014' || /timeout|canceling statement/i.test(msg);
}

function rpcParams(clientId, from, to, extra = {}) {
  return {
    p_client_id: String(clientId).trim(),
    p_from: String(from).slice(0, 10),
    p_to: String(to).slice(0, 10),
    ...extra,
  };
}

async function runRpcRange(supabase, rpcName, clientId, range, extraParams) {
  const { data, error } = await supabase.rpc(
    rpcName,
    rpcParams(clientId, range.from, range.to, extraParams)
  );
  if (error) throw error;
  return data || [];
}

/**
 * On timeout, bisect the date window and retry (handles variable load per dealer).
 */
async function runRpcRangeResilient(supabase, rpcName, clientId, range, extraParams) {
  try {
    return await runRpcRange(supabase, rpcName, clientId, range, extraParams);
  } catch (error) {
    if (!isStatementTimeoutError(error)) throw error;

    const days = enumerateDatesInclusive(range.from, range.to);
    if (days.length <= 1) throw error;

    const mid = Math.ceil(days.length / 2);
    const left = { from: days[0], to: days[mid - 1] };
    const right = { from: days[mid], to: days[days.length - 1] };

    const [leftRows, rightRows] = await Promise.all([
      runRpcRangeResilient(supabase, rpcName, clientId, left, extraParams),
      runRpcRangeResilient(supabase, rpcName, clientId, right, extraParams),
    ]);
    return [...leftRows, ...rightRows];
  }
}

/**
 * Run a date-range RPC in small windows (avoids Postgres statement_timeout).
 */
export async function rpcByDateChunks(
  supabase,
  rpcName,
  {
    clientId,
    from,
    to,
    extraParams = {},
    chunkDays = RPC_CHUNK_DAYS,
    concurrency = RPC_CHUNK_CONCURRENCY,
    onCancelCheck,
  } = {}
) {
  if (!clientId || !from || !to) return [];
  if (onCancelCheck?.()) return null;

  const ranges = chunkDateRangesInclusive(from, to, chunkDays);
  if (!ranges.length) return [];

  if (ranges.length === 1) {
    return runRpcRangeResilient(supabase, rpcName, clientId, ranges[0], extraParams);
  }

  const merged = [];
  for (let i = 0; i < ranges.length; i += concurrency) {
    if (onCancelCheck?.()) return null;
    const batch = ranges.slice(i, i + concurrency);
    const results = await Promise.all(
      batch.map((range) =>
        runRpcRangeResilient(supabase, rpcName, clientId, range, extraParams)
      )
    );
    for (const data of results) {
      if (data?.length) merged.push(...data);
    }
  }
  return merged;
}

/**
 * Run RPC in date windows; calls onBatch after each window with cumulative rows.
 */
export async function rpcByDateChunksProgressive(
  supabase,
  rpcName,
  {
    clientId,
    from,
    to,
    extraParams = {},
    chunkDays = RPC_CHUNK_DAYS,
    concurrency = 1,
    onCancelCheck,
    onBatch,
  } = {}
) {
  if (!clientId || !from || !to) return [];
  if (onCancelCheck?.()) return null;

  const ranges = chunkDateRangesInclusive(from, to, chunkDays);
  if (!ranges.length) return [];

  const merged = [];
  const total = ranges.length;
  let completed = 0;

  const emit = () => {
    if (onBatch) onBatch([...merged], { completed, total });
  };

  if (ranges.length === 1) {
    const data = await runRpcRangeResilient(
      supabase,
      rpcName,
      clientId,
      ranges[0],
      extraParams
    );
    if (onCancelCheck?.()) return null;
    if (data?.length) merged.push(...data);
    completed = 1;
    emit();
    return merged;
  }

  for (let i = 0; i < ranges.length; i += concurrency) {
    if (onCancelCheck?.()) return null;
    const batch = ranges.slice(i, i + concurrency);
    const results = await Promise.all(
      batch.map((range) =>
        runRpcRangeResilient(supabase, rpcName, clientId, range, extraParams)
      )
    );
    for (const data of results) {
      completed += 1;
      if (data?.length) merged.push(...data);
      emit();
    }
  }
  return merged;
}
