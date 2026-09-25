'use client';

import VdpInventoryDonut from '@/components/dashboard/VdpInventoryDonut';
import { fetchLocationBreakdown } from '@/lib/api/dashboardApi';

const LOCATION_COLORS = [
  '#34d399',
  '#60a5fa',
  '#a3e635',
  '#fb923c',
  '#a78bfa',
  '#f472b6',
  '#facc15',
  '#22d3ee',
  '#9ca3af',
];

function truncateLabel(label, max = 22) {
  if (!label || label.length <= max) return label;
  return `${label.slice(0, max - 1)}…`;
}

function colorForRank(rank) {
  const r = Number(rank) || 999;
  if (r === 999) return LOCATION_COLORS[LOCATION_COLORS.length - 1];
  return LOCATION_COLORS[Math.min(Math.max(r - 1, 0), LOCATION_COLORS.length - 1)];
}

function normalizeRows(data) {
  const list = Array.isArray(data) ? data : data ? [data] : [];
  return list.map((row) => ({
    location_bucket: String(
      row.location_bucket ?? row.location ?? row.inv_location ?? 'Unknown'
    ),
    views: Number(row.views ?? 0) || 0,
    pct: Number(row.pct ?? row.percentage ?? 0) || 0,
    rank: Number(row.rank ?? 999) || 999,
  }));
}

function toDonutRow(row) {
  const fullName = row.location_bucket;
  return {
    name: truncateLabel(fullName),
    fullName,
    color: colorForRank(row.rank),
    value: row.views,
    pct: row.pct,
  };
}

export default function LocationBreakdown(props) {
  return (
    <VdpInventoryDonut
      title="Location Breakdown"
      centerLabel="VDP VIEWS"
      fetchFn={fetchLocationBreakdown}
      normalize={normalizeRows}
      errorMessage="Failed to load location breakdown."
      toDonutRow={toDonutRow}
      emptyMessage="No location data for this period."
      {...props}
    />
  );
}
