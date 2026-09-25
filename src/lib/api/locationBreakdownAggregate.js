/**
 * Client-side fallback only when get_location_breakdown RPC returns [] but
 * smart_final_data has rows (PostgREST param mismatch). Mirrors RPC logic.
 */

export function aggregateLocationBuckets(rawRows) {
  const buckets = new Map();

  for (const row of rawRows) {
    const label =
      row.inv_location == null || String(row.inv_location).trim() === ''
        ? 'Unknown'
        : String(row.inv_location).trim();
    const views = Number(row.views ?? row.view_count ?? 0) || 0;
    if (views <= 0) continue;
    buckets.set(label, (buckets.get(label) || 0) + views);
  }

  const sorted = [...buckets.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const total = sorted.reduce((sum, [, v]) => sum + v, 0);
  if (total <= 0) return [];

  const top5 = sorted.slice(0, 5);
  const otherViews = sorted.slice(5).reduce((sum, [, v]) => sum + v, 0);

  const out = top5.map(([location_bucket, views], index) => ({
    location_bucket,
    views,
    pct: Math.round((views / total) * 10000) / 100,
    rank: index + 1,
  }));

  if (otherViews > 0) {
    out.push({
      location_bucket: 'Other',
      views: otherViews,
      pct: Math.round((otherViews / total) * 10000) / 100,
      rank: 999,
    });
  }

  return out;
}
