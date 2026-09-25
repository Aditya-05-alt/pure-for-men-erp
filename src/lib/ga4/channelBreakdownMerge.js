/** Merge chunked get_ga4_channel_breakdown rows (per-channel, not "Other" rollup). */
export function mergeChannelBreakdownRows(rows) {
  const byBucket = new Map();
  for (const row of rows || []) {
    const bucket = String(row.channel_bucket ?? '(not set)');
    const prev = byBucket.get(bucket) || {
      channel_bucket: bucket,
      views: 0,
    };
    prev.views += Number(row.views) || 0;
    byBucket.set(bucket, prev);
  }
  const total = [...byBucket.values()].reduce((sum, r) => sum + r.views, 0);
  return [...byBucket.values()]
    .map((r) => ({
      ...r,
      pct: total > 0 ? Math.round((r.views / total) * 10000) / 100 : 0,
    }))
    .sort((a, b) => b.views - a.views || a.channel_bucket.localeCompare(b.channel_bucket));
}
