function csvCell(value) {
  const text = value == null ? '' : String(value);
  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

export const INVENTORY_DOWNLOAD_HEADERS = [
  'Source',
  'Dealer Name',
  'GA4 Customer ID',
  'VIN',
  'Stock Number',
  'Year',
  'Make',
  'Model',
  'Trim',
  'Condition',
  'Type',
  'Price',
  'MSRP',
  'Location',
  'URL',
  'Advertiser',
  'Synced At',
];

export const INVENTORY_DOWNLOAD_HEADERS_DATED = [
  ...INVENTORY_DOWNLOAD_HEADERS,
  'Pull Date',
];

export function inventoryRowToCsvLine(row, { includePullDate = false } = {}) {
  const cells = [
    csvCell(row.source),
    csvCell(row.dealerName),
    csvCell(row.clientId),
    csvCell(row.vin),
    csvCell(row.stockNumber),
    csvCell(row.year),
    csvCell(row.make),
    csvCell(row.model),
    csvCell(row.trim),
    csvCell(row.condition),
    csvCell(row.type),
    csvCell(row.price),
    csvCell(row.msrp),
    csvCell(row.location),
    csvCell(row.url),
    csvCell(row.advertiser),
    csvCell(row.syncedAt),
  ];
  if (includePullDate) cells.push(csvCell(row.pullDate));
  return cells.join(',');
}

export function buildInventoryDownloadFilename({
  scopeLabel = 'inventory',
  source = 'both',
  from,
  to,
} = {}) {
  const day = new Date().toISOString().slice(0, 10);
  const src =
    source === 'hoot' ? 'hoot' : source === 'scrap' ? 'scrap' : 'hoot-scrap';
  const safe = String(scopeLabel || 'inventory')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48);
  const range =
    from && to ? `-${from}_to_${to}` : from ? `-${from}` : `-${day}`;
  return `${safe || 'inventory'}-${src}${range}.csv`;
}

/**
 * Fetch inventory CSV from the dashboard API and trigger a browser download.
 */
export async function downloadInventoryCsv({
  clientIds = [],
  allDealers = false,
  source = 'both',
  filename,
  onCancelCheck,
} = {}) {
  if (typeof window === 'undefined') return { ok: false, error: 'Not in browser' };
  if (!allDealers && (!clientIds || !clientIds.length)) {
    return { ok: false, error: 'Select at least one dealer.' };
  }

  const qs = new URLSearchParams();
  qs.set('source', source === 'hoot' || source === 'scrap' ? source : 'both');
  if (allDealers) {
    qs.set('scope', 'all');
  } else {
    qs.set('scope', 'ids');
    qs.set('clientIds', clientIds.join(','));
  }

  const res = await fetch(`/api/dashboard/inventory-download?${qs}`, {
    credentials: 'same-origin',
  });
  if (onCancelCheck?.()) return { ok: false, error: 'Cancelled' };

  if (!res.ok) {
    const json = await res.json().catch(() => ({}));
    return {
      ok: false,
      error: json.error || `Download failed (${res.status})`,
    };
  }

  const blob = await res.blob();
  if (onCancelCheck?.()) return { ok: false, error: 'Cancelled' };

  const rowCountRaw = res.headers.get('X-Row-Count');
  const rowCount = rowCountRaw != null ? Number(rowCountRaw) : null;
  const asOf = res.headers.get('X-Inventory-As-Of') || null;

  const name =
    filename ||
    res.headers
      .get('Content-Disposition')
      ?.match(/filename="?([^"]+)"?/i)?.[1] ||
    buildInventoryDownloadFilename({
      scopeLabel: allDealers ? 'all-dealers' : `dealers-${clientIds.length}`,
      source,
      from: asOf,
      to: asOf,
    });

  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  URL.revokeObjectURL(url);
  return {
    ok: true,
    filename: name,
    rowCount: Number.isFinite(rowCount) ? rowCount : null,
    asOf,
  };
}
