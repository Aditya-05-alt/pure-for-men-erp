import { createClient } from '@/lib/supabase/client';
import {
  chunkDateRangesInclusive,
  dayCountInclusive,
} from '@/lib/ga4/dateRange';

const MAX_DAYS_CLIENT = 31;
const RANGE_CHUNK_DAYS = 5;
const RANGE_CONCURRENCY = 2;

function normalizeRow(r) {
  return {
    ...r,
    report_date: String(r.report_date).split('T')[0],
    views: Number(r.views || 0),
  };
}

function isTimeoutError(error) {
  const msg = error?.message || '';
  return error?.code === '57014' || /timeout/i.test(msg);
}

async function rpcDateRange(supabase, rangeFrom, rangeTo, clientId, onCancelCheck) {
  if (onCancelCheck?.()) return null;

  const { data, error } = await supabase.rpc('build_date_wise_ga4_data', {
    p_date_from: rangeFrom,
    p_date_to: rangeTo,
    p_client_id: clientId,
    p_vdp_only: false,
  });

  if (error) throw error;
  return (data || []).map(normalizeRow);
}

/** Fetch in 5-day RPC windows (fewer round trips than one day at a time). */
export async function fetchDateWiseViewsChunked({
  from,
  to,
  clientId = null,
  onCancelCheck,
  onProgress,
}) {
  const supabase = createClient();
  if (!supabase) throw new Error('Supabase is not configured.');

  const ranges = chunkDateRangesInclusive(from, to, RANGE_CHUNK_DAYS);
  if (ranges.length === 0) return [];

  const dayCount = dayCountInclusive(from, to);
  if (dayCount > MAX_DAYS_CLIENT) {
    throw new Error(
      `Date range is ${dayCount} days. Please use at most ${MAX_DAYS_CLIENT} days (try 10d preset).`
    );
  }

  const merged = [];
  let completed = 0;

  for (let i = 0; i < ranges.length; i += RANGE_CONCURRENCY) {
    if (onCancelCheck?.()) return null;

    const batch = ranges.slice(i, i + RANGE_CONCURRENCY);
    const label = batch.map((r) => `${r.from}→${r.to}`).join(', ');
    onProgress?.({ completed, total: ranges.length, label, daysTotal: dayCount });

    const results = await Promise.all(
      batch.map(async (range) => {
        try {
          return await rpcDateRange(
            supabase,
            range.from,
            range.to,
            clientId,
            onCancelCheck
          );
        } catch (err) {
          if (isTimeoutError(err)) {
            throw new Error(
              `Timed out loading ${range.from} → ${range.to}. Try a shorter range or add the database index in supabase/rpc/build_date_wise_ga4_data.sql.`
            );
          }
          throw err;
        }
      })
    );

    for (const part of results) {
      if (part?.length) merged.push(...part);
    }
    completed += batch.length;
    onProgress?.({ completed, total: ranges.length, daysTotal: dayCount });
  }

  return merged;
}

/** Prefer server route (service role, 5-day chunks); fallback to client chunks. */
export async function fetchDateWiseViews({
  from,
  to,
  clientId = null,
  onCancelCheck,
  onProgress,
}) {
  if (onCancelCheck?.()) return null;

  const qs = new URLSearchParams({ from, to });
  if (clientId) qs.set('clientId', clientId);

  try {
    const res = await fetch(`/api/reports/date-wise-views?${qs}`, {
      credentials: 'same-origin',
    });
    const json = await res.json().catch(() => ({}));

    if (res.ok && Array.isArray(json.rows)) {
      return json.rows.map(normalizeRow);
    }

    if (res.status !== 503 && res.status !== 500) {
      throw new Error(json.error || `Request failed (${res.status})`);
    }
  } catch (err) {
    if (!isTimeoutError(err) && !/fetch/i.test(err?.message || '')) {
      throw err;
    }
  }

  return fetchDateWiseViewsChunked({
    from,
    to,
    clientId,
    onCancelCheck,
    onProgress,
  });
}
