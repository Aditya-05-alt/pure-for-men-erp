'use client';

import VdpInventoryDonut from '@/components/dashboard/VdpInventoryDonut';
import { fetchTypeBreakdown } from '@/lib/api/dashboardApi';

const TYPE_COLORS = [
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
  return TYPE_COLORS[Math.min(Math.max(r - 1, 0), TYPE_COLORS.length - 1)];
}

function normalizeRows(data) {
  const list = Array.isArray(data) ? data : data ? [data] : [];
  return list.map((row) => ({
    type_bucket: String(row.type_bucket ?? row.type ?? row.inv_type ?? 'Unknown'),
    views: Number(row.views ?? 0) || 0,
    pct: Number(row.pct ?? row.percentage ?? 0) || 0,
    rank: Number(row.rank ?? 999) || 999,
  }));
}

function toDonutRow(row) {
  const name = row.type_bucket;
  return {
    name,
    fullName: name,
    color: colorForRank(row.rank),
    value: row.views,
    pct: row.pct,
  };
}

export default function TypeBreakdown(props) {
  return (
    <VdpInventoryDonut
      title="Type Breakdown"
      fetchFn={fetchTypeBreakdown}
      normalize={normalizeRows}
      errorMessage="Failed to load type breakdown."
      toDonutRow={toDonutRow}
      emptyMessage="No type data for this period."
      {...props}
    />
  );
}
