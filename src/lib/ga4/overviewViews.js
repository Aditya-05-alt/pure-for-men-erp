/**
 * Sum page views by report_date — same rules as Overview "All" tab:
 * every overview row contributes its `views` to that date (page-grain from get_ga4_overview).
 */
export function sumAllTabViewsByDate(rows) {
  const daily = {};
  for (const r of rows || []) {
    const views = Number(r.views) || 0;
    if (views === 0) continue;
    const date = r.report_date;
    if (!date) continue;
    daily[date] = (daily[date] || 0) + views;
  }
  return daily;
}
