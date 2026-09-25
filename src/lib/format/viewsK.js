/** Format view counts as rounded-up K (e.g. 28,344 → 29K). Values under 1,000 stay as-is. */
export function formatViewsK(n) {
  const v = Number(n) || 0;
  if (v === 0) return '0';
  if (v < 1000) return v.toLocaleString();
  return `${Math.ceil(v / 1000)}K`;
}
