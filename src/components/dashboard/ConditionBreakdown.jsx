'use client';

import VdpInventoryDonut from '@/components/dashboard/VdpInventoryDonut';
import { fetchConditionBreakdown } from '@/lib/api/dashboardApi';

const CONDITION_COLOR_MAP = {
  New: '#34d399',
  Used: '#60a5fa',
  Unknown: '#9ca3af',
};
const FALLBACK_COLORS = ['#fb923c', '#f472b6', '#a78bfa', '#facc15', '#22d3ee'];
const OTHER_COLOR = '#9ca3af';

function colorForRow(row, index) {
  if (Number(row.rank) === 999) return OTHER_COLOR;
  if (CONDITION_COLOR_MAP[row.condition_bucket]) {
    return CONDITION_COLOR_MAP[row.condition_bucket];
  }
  return FALLBACK_COLORS[index % FALLBACK_COLORS.length];
}

function normalizeRows(data) {
  const list = Array.isArray(data) ? data : data ? [data] : [];
  return list.map((row) => ({
    condition_bucket:
      String(row.condition_bucket ?? row.inv_condition ?? 'Unknown').trim() || 'Unknown',
    views: Number(row.views ?? 0) || 0,
    pct: Number(row.pct ?? row.percentage ?? 0) || 0,
    rank: Number(row.rank ?? 999) || 999,
  }));
}

function toDonutRow(row, index) {
  const name = row.condition_bucket;
  return {
    name,
    fullName: name,
    color: colorForRow(row, index),
    value: row.views,
    pct: row.pct,
  };
}

export default function ConditionBreakdown(props) {
  return (
    <VdpInventoryDonut
      title="Condition Breakdown"
      fetchFn={fetchConditionBreakdown}
      normalize={normalizeRows}
      errorMessage="Failed to load condition breakdown."
      toDonutRow={toDonutRow}
      emptyMessage="No condition data for this period."
      {...props}
    />
  );
}
