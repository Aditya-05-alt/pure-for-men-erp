'use client';

import VdpInventoryDonut from '@/components/dashboard/VdpInventoryDonut';
import { fetchMakeBreakdown } from '@/lib/api/dashboardApi';

const MAKE_COLORS = [
  '#34d399',
  '#60a5fa',
  '#a3e635',
  '#fb923c',
  '#f472b6',
  '#a78bfa',
  '#facc15',
  '#22d3ee',
  '#fb7185',
  '#94a3b8',
];
const OTHER_COLOR = '#9ca3af';

function colorForRank(rank) {
  const r = Number(rank) || 999;
  if (r === 999) return OTHER_COLOR;
  return MAKE_COLORS[Math.min(Math.max(r - 1, 0), MAKE_COLORS.length - 1)];
}

function normalizeRows(data) {
  const list = Array.isArray(data) ? data : data ? [data] : [];
  return list.map((row) => ({
    make_bucket: String(row.make_bucket ?? row.make ?? row.inv_make ?? 'Unknown'),
    views: Number(row.views ?? 0) || 0,
    pct: Number(row.pct ?? row.percentage ?? 0) || 0,
    rank: Number(row.rank ?? 999) || 999,
  }));
}

function toDonutRow(row) {
  const name = row.make_bucket;
  return {
    name,
    fullName: name,
    color: colorForRank(row.rank),
    value: row.views,
    pct: row.pct,
  };
}

export default function MakeBreakdown(props) {
  return (
    <VdpInventoryDonut
      title="Make Breakdown"
      fetchFn={fetchMakeBreakdown}
      normalize={normalizeRows}
      errorMessage="Failed to load make breakdown."
      toDonutRow={toDonutRow}
      emptyMessage="No make data for this period."
      {...props}
    />
  );
}
