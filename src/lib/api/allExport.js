import { enumerateDatesInclusive } from '@/lib/ga4/dateRange';

function slugPart(value) {
  return String(value || 'export')
    .replace(/[^\w.-]+/g, '_')
    .slice(0, 48);
}

function formatReportDateIso(value) {
  if (!value) return '';
  if (value instanceof Date) return rowDateIso(value);
  return String(value).slice(0, 10);
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

const METRIC_KEYS = new Set(['views', 'total_users', 'sessions', 'new_users']);
const EPHEMERAL_KEYS = new Set(['created_at', 'report_date', ...METRIC_KEYS]);

/** All smart_ga4_page_data columns except id, client_id, and ga4_property_id. */
export const ALL_EXPORT_COLUMNS = [
  { key: 'account_name', header: 'account_name', width: 28 },
  { key: 'report_date', header: 'report_date', width: 14, highlight: true },
  { key: 'page_location', header: 'page_location', width: 52, highlight: true },
  { key: 'page_path', header: 'page_path', width: 36 },
  { key: 'page_title', header: 'page_title', width: 40 },
  { key: 'session_campaign', header: 'session_campaign', width: 24 },
  { key: 'channel', header: 'channel', width: 18 },
  { key: 'source', header: 'source', width: 18 },
  { key: 'medium', header: 'medium', width: 14 },
  { key: 'source_medium', header: 'source_medium', width: 28 },
  { key: 'views', header: 'views', width: 10, number: true, highlight: true },
  { key: 'total_users', header: 'total_users', width: 12, number: true },
  { key: 'sessions', header: 'sessions', width: 12, number: true },
  { key: 'new_users', header: 'new_users', width: 12, number: true },
  { key: 'created_at', header: 'created_at', width: 22 },
  { key: 'vdp_conditions', header: 'vdp_conditions', width: 14 },
  { key: 'vdp_vehicle_condition', header: 'vdp_vehicle_condition', width: 18 },
  { key: 'year', header: 'year', width: 8, number: true },
  { key: 'ga4_page_type', header: 'ga4_page_type', width: 16, highlight: true },
  { key: 'cms', header: 'cms', width: 16 },
];

const COMBO_KEYS = ALL_EXPORT_COLUMNS.map((c) => c.key).filter((k) => !EPHEMERAL_KEYS.has(k));

const HEADER_FILL = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FFC8E87A' },
};
const HIGHLIGHT_FILL = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FFE8F4D9' },
};
const TOTAL_FILL = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FFD4E8A8' },
};

function formatCellValue(key, value) {
  if (value == null || value === '') {
    if (METRIC_KEYS.has(key)) return 0;
    return '';
  }
  if (key === 'vdp_conditions') return value ? 'true' : 'false';
  if (key === 'report_date') return formatReportDateIso(value);
  return value;
}

function mapApiRow(row) {
  const src = row || {};
  const out = {};
  for (const col of ALL_EXPORT_COLUMNS) {
    let raw = src[col.key];
    if (col.key === 'page_location' && (raw == null || String(raw).trim() === '')) {
      raw = src.page_location ?? src.page_path ?? '';
    }
    if (col.key === 'report_date') {
      out[col.key] = formatReportDateIso(raw);
    } else if (col.number) {
      out[col.key] = Number(raw) || 0;
    } else if (col.key === 'vdp_conditions') {
      out[col.key] = Boolean(raw);
    } else {
      out[col.key] = raw ?? '';
    }
  }
  return out;
}

function comboKeyFromRow(row) {
  return COMBO_KEYS.map((k) => String(row[k] ?? '')).join('\0');
}

/** Expand each page/channel row across every day in range; keep 0 views on missing days. */
function fillAllTabDateRange(rows, fromIso, toIso) {
  const dates = enumerateDatesInclusive(fromIso, toIso);
  if (!dates.length) return rows;

  const combos = new Map();
  const metricsByKey = new Map();

  for (const row of rows) {
    const iso = formatReportDateIso(row.report_date);
    const comboKey = comboKeyFromRow(row);
    if (!combos.has(comboKey)) {
      const template = {};
      for (const k of COMBO_KEYS) template[k] = row[k];
      combos.set(comboKey, template);
    }
    const metricKey = `${iso}\0${comboKey}`;
    const prev = metricsByKey.get(metricKey);
    metricsByKey.set(metricKey, {
      views: (prev?.views || 0) + (Number(row.views) || 0),
      total_users: (prev?.total_users || 0) + (Number(row.total_users) || 0),
      sessions: (prev?.sessions || 0) + (Number(row.sessions) || 0),
      new_users: (prev?.new_users || 0) + (Number(row.new_users) || 0),
      created_at: prev?.created_at ?? row.created_at ?? '',
    });
  }

  if (combos.size === 0) {
    return dates.map((iso) => {
      const blank = {};
      for (const col of ALL_EXPORT_COLUMNS) {
        if (col.key === 'report_date') blank[col.key] = iso;
        else if (METRIC_KEYS.has(col.key)) blank[col.key] = 0;
        else blank[col.key] = '';
      }
      return blank;
    });
  }

  const filled = [];
  for (const iso of dates) {
    for (const [comboKey, template] of combos) {
      const metrics = metricsByKey.get(`${iso}\0${comboKey}`) || {
        views: 0,
        total_users: 0,
        sessions: 0,
        new_users: 0,
        created_at: '',
      };
      filled.push({
        ...template,
        report_date: iso,
        created_at: metrics.created_at,
        views: metrics.views,
        total_users: metrics.total_users,
        sessions: metrics.sessions,
        new_users: metrics.new_users,
      });
    }
  }

  filled.sort((a, b) => {
    const dateCmp = String(b.report_date).localeCompare(String(a.report_date));
    if (dateCmp !== 0) return dateCmp;
    if (Number(b.views) !== Number(a.views)) return Number(b.views) - Number(a.views);
    return String(a.page_location).localeCompare(String(b.page_location));
  });

  return filled;
}

async function fetchAllExportPayload({ clientId, from, to }) {
  const qs = new URLSearchParams({
    clientId: String(clientId).trim(),
    from: String(from).slice(0, 10),
    to: String(to).slice(0, 10),
  });

  const res = await fetch(`/api/dashboard/all-export?${qs}`, {
    credentials: 'same-origin',
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(json.error || `Export failed (${res.status})`);
  }
  return json;
}

function addAllDataSheet(workbook, rows) {
  const sheet = workbook.addWorksheet('All Page Data');
  const headers = ALL_EXPORT_COLUMNS.map((c) => c.header);
  sheet.addRow(headers);

  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true };
  headers.forEach((_, idx) => {
    headerRow.getCell(idx + 1).fill = HEADER_FILL;
  });

  const highlightCols = ALL_EXPORT_COLUMNS.map((c, idx) => (c.highlight ? idx + 1 : null)).filter(Boolean);
  const reportDateCol =
    ALL_EXPORT_COLUMNS.findIndex((c) => c.key === 'report_date') + 1;
  const pageLocationCol =
    ALL_EXPORT_COLUMNS.findIndex((c) => c.key === 'page_location') + 1;

  let totalViews = 0;
  let totalUsers = 0;
  let totalSessions = 0;
  let totalNewUsers = 0;

  for (const row of rows) {
    totalViews += Number(row.views) || 0;
    totalUsers += Number(row.total_users) || 0;
    totalSessions += Number(row.sessions) || 0;
    totalNewUsers += Number(row.new_users) || 0;

    const values = ALL_EXPORT_COLUMNS.map((col) => formatCellValue(col.key, row[col.key]));
    const dataRow = sheet.addRow(values);

    for (const colIdx of highlightCols) {
      const cell = dataRow.getCell(colIdx);
      cell.fill = HIGHLIGHT_FILL;
    }
    dataRow.getCell(reportDateCol).value = formatReportDateIso(row.report_date);
    dataRow.getCell(pageLocationCol).value = String(row.page_location ?? '');
  }

  const totalValues = ALL_EXPORT_COLUMNS.map((col) => {
    if (col.key === 'report_date') return 'Total';
    if (col.key === 'views') return totalViews;
    if (col.key === 'total_users') return totalUsers;
    if (col.key === 'sessions') return totalSessions;
    if (col.key === 'new_users') return totalNewUsers;
    return '';
  });
  const totalRow = sheet.addRow(totalValues);
  totalRow.font = { bold: true };
  totalRow.eachCell((cell) => {
    cell.fill = TOTAL_FILL;
  });

  ALL_EXPORT_COLUMNS.forEach((col, idx) => {
    const column = sheet.getColumn(idx + 1);
    column.width = col.width;
    if (col.number) column.numFmt = '#,##0';
  });

  return rows.length;
}

/** Build and download All tab XLSX with full smart_ga4_page_data columns. */
export async function downloadAllTabXlsx({ clientId, from, to, dealerName }) {
  if (!clientId || !from || !to) {
    throw new Error('Select a dealer and date range first.');
  }

  const fromIso = String(from).slice(0, 10);
  const toIso = String(to).slice(0, 10);

  const payload = await fetchAllExportPayload({
    clientId,
    from: fromIso,
    to: toIso,
  });

  const mapped = (payload.rows || []).map(mapApiRow);
  const rows = fillAllTabDateRange(mapped, fromIso, toIso);

  const ExcelJS = await import('exceljs');
  const workbook = new ExcelJS.Workbook();
  const rowCount = addAllDataSheet(workbook, rows);

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const dealerSlug = slugPart(dealerName);
  const filename = `all-export_${dealerSlug}_${fromIso}_to_${toIso}.xlsx`;

  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);

  return { filename, rowCount };
}
