'use client';

import VdpInventoryDonut from '@/components/dashboard/VdpInventoryDonut';
import { fetchModelBreakdown } from '@/lib/api/dashboardApi';

const MODEL_COLORS = [
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
  return MODEL_COLORS[Math.min(Math.max(r - 1, 0), MODEL_COLORS.length - 1)];
}

function truncateLabel(label, max = 22) {
  if (!label || label.length <= max) return label;
  return `${label.slice(0, max - 1)}…`;
}

function normalizeRows(data) {
  const list = Array.isArray(data) ? data : data ? [data] : [];
  return list.map((row) => ({
    model_bucket: String(row.model_bucket ?? row.inv_model ?? 'Unknown'),
    make_bucket: String(row.make_bucket ?? row.inv_make ?? '').trim(),
    views: Number(row.views ?? 0) || 0,
    pct: Number(row.pct ?? row.percentage ?? 0) || 0,
    rank: Number(row.rank ?? 999) || 999,
  }));
}

function rowTooltip(row) {
  const make = row.make_bucket && row.rank !== 999 ? ` (${row.make_bucket})` : '';
  return `${row.model_bucket}${make}`;
}

function toDonutRow(row) {
  const fullName = rowTooltip(row);
  return {
    name: truncateLabel(row.model_bucket),
    fullName,
    color: colorForRank(row.rank),
    value: row.views,
    pct: row.pct,
  };
}

export default function ModelBreakdown(props) {
  return (
    <VdpInventoryDonut
      title="Model Breakdown"
      fetchFn={fetchModelBreakdown}
      normalize={normalizeRows}
      errorMessage="Failed to load model breakdown."
      toDonutRow={toDonutRow}
      emptyMessage="No model data for this period."
      {...props}
    />
  );
}
