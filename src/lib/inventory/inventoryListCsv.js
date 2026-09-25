function csvCell(value) {
  const text = value == null ? '' : String(value);
  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function rowAveragePrice(row) {
  const units = Number(row.units) || 0;
  const totalValue = Number(row.totalValue) || 0;
  if (units <= 0) return 0;
  return Math.round(totalValue / units);
}

/**
 * @param {{ rows?: object[], totalUnits?: number, averagePrice?: number, totalValue?: number }} list
 */
export function buildInventoryListCsv(list) {
  const rows = list?.rows ?? [];
  const header = [
    'Manufacturer',
    'Brand / Model',
    'Condition',
    'Units',
    'Average Price',
    'Total Value',
  ];

  const lines = [
    header.join(','),
    ...rows.map((row) =>
      [
        csvCell(row.manufacturer),
        csvCell(row.brandModel),
        csvCell(row.condition),
        csvCell(row.units),
        csvCell(rowAveragePrice(row)),
        csvCell(row.totalValue),
      ].join(','),
    ),
    [
      'Grand Total',
      '',
      '',
      csvCell(list?.totalUnits ?? 0),
      csvCell(Math.round(list?.averagePrice ?? 0)),
      csvCell(list?.totalValue ?? 0),
    ].join(','),
  ];

  return lines.join('\n');
}

export function downloadInventoryListCsv(list, filename = 'inventory-list.csv') {
  const csv = buildInventoryListCsv(list);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
