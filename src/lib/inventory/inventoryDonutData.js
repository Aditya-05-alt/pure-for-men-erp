const FALLBACK_COLORS = [
  '#34d399',
  '#60a5fa',
  '#fb923c',
  '#a78bfa',
  '#f472b6',
  '#22d3ee',
  '#facc15',
  '#fb7185',
];

export function colorForInventoryRow(_label, index = 0) {
  return FALLBACK_COLORS[index % FALLBACK_COLORS.length];
}

export function inventoryRowLabel(row) {
  return (
    row.label
    ?? row.condition
    ?? row.location
    ?? row.make
    ?? row.type
    ?? row.name
    ?? 'Unknown'
  );
}

export function rowsToInventoryDonutData(rows = []) {
  return rows.map((row, index) => {
    const name = inventoryRowLabel(row);
    return {
      name,
      fullName: name,
      color: row.color ?? colorForInventoryRow(name, index),
      value: Number(row.units ?? row.value) || 0,
      pct: Number(row.pct) || 0,
    };
  });
}
