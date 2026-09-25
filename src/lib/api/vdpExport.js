import { appendVdpFiltersToSearchParams } from '@/lib/vdp/vdpFilterParams';
import { enumerateDatesInclusive } from '@/lib/ga4/dateRange';

function slugPart(value) {
  return String(value || 'export')
    .replace(/[^\w.-]+/g, '_')
    .slice(0, 48);
}

function toExcelDate(value) {
  if (!value) return null;
  const iso = String(value).slice(0, 10);
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  return new Date(y, m - 1, d);
}

async function fetchVdpExportPayload({ clientId, from, to, vdpFilters, tab }) {
  const qs = new URLSearchParams({
    clientId: String(clientId).trim(),
    from: String(from).slice(0, 10),
    to: String(to).slice(0, 10),
  });
  appendVdpFiltersToSearchParams(qs, vdpFilters, tab);

  const res = await fetch(`/api/dashboard/vdp-export?${qs}`, {
    credentials: 'same-origin',
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(json.error || `Export failed (${res.status})`);
  }
  return json;
}

const HEADER_FILL = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FFC8E87A' },
};
const DATE_FILL = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FFE8F4D9' },
};
const TOTAL_FILL = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FFD4E8A8' },
};

function mapRows(rows, dimKey, dimLabel) {
  return (rows || []).map((row) => ({
    Date: toExcelDate(row.report_date),
    URL: String(row.url || '').trim(),
    Views: Number(row.views) || 0,
    [dimLabel]: row[dimKey] || '',
  }));
}

function rowDateIso(value) {
  if (value instanceof Date) {
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, '0');
    const d = String(value.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  return String(value || '').slice(0, 10);
}

/** Expand each URL+dimension row across every day in the selected range (0 views when missing). */
function fillDateRange(rows, fromIso, toIso, dimLabel) {
  const dates = enumerateDatesInclusive(fromIso, toIso);
  if (!dates.length) return rows;

  const combos = new Map();
  const viewsByKey = new Map();

  for (const row of rows) {
    const iso = rowDateIso(row.Date);
    const url = row.URL;
    const dim = row[dimLabel] ?? '';
    const comboKey = `${url}\0${dim}`;
    combos.set(comboKey, { URL: url, [dimLabel]: dim });
    viewsByKey.set(`${iso}\0${comboKey}`, row.Views);
  }

  if (combos.size === 0) {
    return dates.map((iso) => ({
      Date: toExcelDate(iso),
      URL: '',
      Views: 0,
      [dimLabel]: '',
    }));
  }

  const filled = [];
  for (const iso of dates) {
    for (const [comboKey, combo] of combos) {
      filled.push({
        Date: toExcelDate(iso),
        URL: combo.URL,
        Views: viewsByKey.get(`${iso}\0${comboKey}`) ?? 0,
        [dimLabel]: combo[dimLabel],
      });
    }
  }

  filled.sort((a, b) => {
    const dateCmp = rowDateIso(b.Date).localeCompare(rowDateIso(a.Date));
    if (dateCmp !== 0) return dateCmp;
    if (b.Views !== a.Views) return b.Views - a.Views;
    const urlCmp = a.URL.localeCompare(b.URL);
    if (urlCmp !== 0) return urlCmp;
    return String(a[dimLabel]).localeCompare(String(b[dimLabel]));
  });

  return filled;
}

function addStyledSheet(workbook, sheetName, rows, dimLabel) {
  const sheet = workbook.addWorksheet(sheetName);
  const headers = ['Date', 'URL', 'Views', dimLabel];
  sheet.addRow(headers);

  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true };
  headers.forEach((_, colIdx) => {
    headerRow.getCell(colIdx + 1).fill = HEADER_FILL;
  });

  let totalViews = 0;
  rows.forEach((row) => {
    totalViews += row.Views;
    const dataRow = sheet.addRow([row.Date, row.URL, row.Views, row[dimLabel]]);
    dataRow.getCell(1).fill = DATE_FILL;
  });

  const totalRow = sheet.addRow(['Total', '', totalViews, '']);
  totalRow.font = { bold: true };
  totalRow.eachCell((cell) => {
    cell.fill = TOTAL_FILL;
  });

  sheet.getColumn(1).width = 14;
  sheet.getColumn(1).numFmt = 'yyyy-mm-dd';
  sheet.getColumn(2).width = 52;
  sheet.getColumn(3).width = 12;
  sheet.getColumn(4).width = 22;
  sheet.getColumn(3).numFmt = '#,##0';

  return rows.length;
}

/** Build and download VDP XLSX with five breakdown sheets. */
export async function downloadVdpXlsx({
  clientId,
  from,
  to,
  vdpFilters,
  tab = 'vdp',
  dealerName,
}) {
  if (!clientId || !from || !to) {
    throw new Error('Select a dealer and date range first.');
  }

  const fromIso = String(from).slice(0, 10);
  const toIso = String(to).slice(0, 10);

  const payload = await fetchVdpExportPayload({
    clientId,
    from: fromIso,
    to: toIso,
    vdpFilters,
    tab,
  });

  const ExcelJS = await import('exceljs');
  const workbook = new ExcelJS.Workbook();

  const sheets = [
    {
      name: 'By Channel',
      rows: fillDateRange(
        mapRows(payload.byChannel, 'channel', 'Channel'),
        fromIso,
        toIso,
        'Channel'
      ),
      label: 'Channel',
    },
    {
      name: 'By Location',
      rows: fillDateRange(
        mapRows(payload.byLocation, 'location', 'Location'),
        fromIso,
        toIso,
        'Location'
      ),
      label: 'Location',
    },
    {
      name: 'By Make',
      rows: fillDateRange(
        mapRows(payload.byMake, 'make', 'Make'),
        fromIso,
        toIso,
        'Make'
      ),
      label: 'Make',
    },
    {
      name: 'By Model',
      rows: fillDateRange(
        mapRows(payload.byModel, 'model', 'Model'),
        fromIso,
        toIso,
        'Model'
      ),
      label: 'Model',
    },
    {
      name: 'By Condition',
      rows: fillDateRange(
        mapRows(payload.byCondition, 'condition', 'Condition'),
        fromIso,
        toIso,
        'Condition'
      ),
      label: 'Condition',
    },
  ];

  const counts = {};
  for (const { name, rows, label } of sheets) {
    counts[name] = addStyledSheet(workbook, name, rows, label);
  }

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const dealerSlug = slugPart(dealerName);
  const filename = `vdp-export_${dealerSlug}_${fromIso}_to_${toIso}.xlsx`;

  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);

  return { filename, counts };
}
