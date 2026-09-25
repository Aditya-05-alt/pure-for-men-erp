/** Display colors for GA4 session default channel groups. */
const KNOWN_CHANNEL_COLORS = {
  'Organic Search': '#34d399',
  Organic: '#34d399',
  'Paid Search': '#60a5fa',
  Direct: '#a3e635',
  'Organic Social': '#b89bff',
  'Paid Social': '#fb923c',
  'Paid Video': '#f97316',
  'Organic Video': '#a78bfa',
  Display: '#38bdf8',
  Email: '#f472b6',
  Referral: '#22d3ee',
  Affiliates: '#4ade80',
  'Paid Other': '#94a3b8',
  SMS: '#fcd34d',
  Audio: '#c084fc',
  'Cross-network': '#64748b',
  Unassigned: '#9ca3af',
  'Ai Assistant': '#f2be22',
  '(not set)': '#6b7280',
};

const CHANNEL_PALETTE = [
  '#34d399',
  '#60a5fa',
  '#a3e635',
  '#fb923c',
  '#8f7af6',
  '#f472b6',
  '#22d3ee',
  '#f2be22',
  '#e8806f',
  '#748ab2',
  '#4ade80',
  '#38bdf8',
];

export function colorForChannel(name, index = 0) {
  return KNOWN_CHANNEL_COLORS[name] || CHANNEL_PALETTE[index % CHANNEL_PALETTE.length];
}

/** RPC rows → donut slices sorted by views (only channels with traffic). */
export function channelRowsToDonutData(rows) {
  const sorted = [...(rows || [])].sort(
    (a, b) => (Number(b.views) || 0) - (Number(a.views) || 0)
  );

  return sorted
    .filter((row) => (Number(row.views) || 0) > 0)
    .map((row, index) => {
      const name = String(row.channel_bucket ?? '(not set)');
      return {
        name,
        color: colorForChannel(name, index),
        value: Number(row.views) || 0,
        pct: Number(row.pct) || 0,
      };
    });
}
