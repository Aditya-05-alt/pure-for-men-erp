/** Merge chunked get_top_campaigns rows (full list when limit is null). */
export function mergeTopCampaignRows(rows) {
  const byKey = new Map();
  for (const row of rows || []) {
    const campaign = String(row.campaign ?? '(not set)');
    const source = String(row.source ?? '');
    const medium = String(row.medium ?? '');
    const key = `${campaign}|${source}|${medium}`;
    const prev = byKey.get(key) || {
      campaign,
      source,
      medium,
      channel: String(row.channel ?? ''),
      views: 0,
      sessions: 0,
      total_users: 0,
      new_users: 0,
    };
    prev.views += Number(row.views) || 0;
    prev.sessions += Number(row.sessions) || 0;
    prev.total_users += Number(row.total_users) || 0;
    prev.new_users += Number(row.new_users) || 0;
    byKey.set(key, prev);
  }

  const sorted = [...byKey.values()].sort((a, b) => b.views - a.views);
  const totalViews = sorted.reduce((sum, r) => sum + r.views, 0);

  return sorted.map((row, index) => ({
    ...row,
    rank: index + 1,
    pct: totalViews > 0 ? Math.round((row.views / totalViews) * 10000) / 100 : 0,
  }));
}
