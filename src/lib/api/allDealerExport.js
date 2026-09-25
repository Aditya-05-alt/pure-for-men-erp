import {
  compareEntryForDealer,
  compareLookupFromRows,
  sliceMapForRow,
} from '@/lib/api/allDealerChannelMatrix';
import { pctChange } from '@/lib/overview/comparePeriod';

const TAB_SHEET_NAME = {
  vdp: 'VDP',
  all: 'All Pages',
};

const HEADER_FILL = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FF1A2332' },
};

const HEADER_FONT = {
  bold: true,
  color: { argb: 'FFE8F0FF' },
  size: 10,
};

const DEALER_FILL = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FF243044' },
};

const TOTAL_FILL = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FF2A3A52' },
};

const CHANNEL_FILL = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FF1E2A3C' },
};

const BODY_FONT = {
  bold: true,
  color: { argb: 'FFE8F0FF' },
  size: 10,
};

const THIN_BORDER = {
  style: 'thin',
  color: { argb: 'FF3A4A62' },
};

function slugPart(value) {
  return String(value || 'export')
    .replace(/[^\w.-]+/g, '_')
    .slice(0, 48);
}

/** Match AllDealerChannelTable short month tags (e.g. "JUL 2026"). */
function shortMonthLabel(periodLabel) {
  if (!periodLabel) return '';
  const raw = String(periodLabel).trim();
  const monthYear = raw.match(/^([A-Za-z]{3,9})\s+(\d{4})$/);
  if (monthYear) {
    return `${monthYear[1].slice(0, 3).toUpperCase()} ${monthYear[2]}`;
  }
  const rangeStart = raw.match(/^([A-Za-z]{3,9})\s+\d{1,2},?\s+(\d{4})/);
  if (rangeStart) {
    return `${rangeStart[1].slice(0, 3).toUpperCase()} ${rangeStart[2]}`;
  }
  return raw.length > 10 ? `${raw.slice(0, 10)}…` : raw.toUpperCase();
}

function deltaLabelForRange(from, compareFrom) {
  if (!from || !compareFrom) return 'MoM';
  return String(from).slice(0, 4) !== String(compareFrom).slice(0, 4)
    ? 'YoY'
    : 'MoM';
}

/** UI-style delta: "↑ 16%" / "↓ 4%" / "0%". */
function formatDeltaArrow(current, previous) {
  const pct = pctChange(current, previous);
  if (pct > 0) return `↑ ${pct}%`;
  if (pct < 0) return `↓ ${Math.abs(pct)}%`;
  return '0%';
}

function formatViews(n) {
  const v = Number(n) || 0;
  return v.toLocaleString('en-US');
}

/**
 * One Excel cell matching the on-screen compare stack:
 *   JUL 2026   93,857
 *   JUN 2026   98,094
 *   MoM        ↓ 4%
 */
function stackCellValue(current, compare, curTag, prevTag, deltaLabel) {
  const cur = Number(current) || 0;
  const cmp = Number(compare) || 0;
  if (cur <= 0 && cmp <= 0) return '—';

  const curLine = `${curTag}   ${cur > 0 ? formatViews(cur) : '—'}`;
  const prevLine = `${prevTag}   ${formatViews(cmp)}`;
  const deltaLine = `${deltaLabel}   ${formatDeltaArrow(cur, cmp)}`;
  return `${curLine}\n${prevLine}\n${deltaLine}`;
}

function applyBorders(cell) {
  cell.border = {
    top: THIN_BORDER,
    left: THIN_BORDER,
    bottom: THIN_BORDER,
    right: THIN_BORDER,
  };
}

function buildHeaders(columns) {
  return ['DEALERS', 'TOTAL VIEWS', ...columns.map((c) => String(c).toUpperCase())];
}

function buildPlainRow(row, columns) {
  const sliceMap = sliceMapForRow(row);
  const dealerName = row.dealer?.name || 'Unnamed dealer';
  if (row.error) {
    return [dealerName, '—', ...columns.map(() => '—')];
  }
  return [
    dealerName,
    Number(row.total) || 0,
    ...columns.map((col) => Number(sliceMap.get(col)?.value) || 0),
  ];
}

function buildCompareRow(row, columns, compareEntry, curTag, prevTag, deltaLabel) {
  const sliceMap = sliceMapForRow(row);
  const dealerName = row.dealer?.name || 'Unnamed dealer';

  if (row.error) {
    return [dealerName, '—', ...columns.map(() => '—')];
  }

  const compareTotal = Number(compareEntry?.total) || 0;
  const cells = [
    dealerName,
    stackCellValue(row.total, compareTotal, curTag, prevTag, deltaLabel),
  ];

  for (const col of columns) {
    const cur = Number(sliceMap.get(col)?.value) || 0;
    const cmp = Number(compareEntry?.channels?.get(col)?.value) || 0;
    cells.push(stackCellValue(cur, cmp, curTag, prevTag, deltaLabel));
  }

  return cells;
}

/**
 * Build XLSX matching the All Dealers on-screen matrix
 * (stacked current / compare / MoM|YoY per cell when compare is on).
 */
export async function downloadAllDealerChannelXlsx({
  matrixRows,
  compareMatrixRows = [],
  columns = [],
  from,
  to,
  tab = 'all',
  compareEnabled = false,
  compareFrom,
  compareTo,
  currentPeriodLabel = 'Current',
  comparePeriodLabel = 'Compare',
}) {
  if (!matrixRows?.length || !columns?.length || !from || !to) {
    throw new Error('Table data is not ready yet — wait for loading to finish.');
  }

  const fromIso = String(from).slice(0, 10);
  const toIso = String(to).slice(0, 10);
  const showCompare = Boolean(compareEnabled && compareFrom && compareTo);
  const deltaLabel = deltaLabelForRange(from, compareFrom);
  const curTag = shortMonthLabel(currentPeriodLabel) || 'CURRENT';
  const prevTag = shortMonthLabel(comparePeriodLabel) || 'PREVIOUS';
  const headers = buildHeaders(columns);

  const compareByDealer = compareLookupFromRows(compareMatrixRows);
  const dataRows = (matrixRows || []).map((row) => {
    if (!showCompare) return buildPlainRow(row, columns);
    const compareEntry = compareEntryForDealer(compareByDealer, row.dealer);
    return buildCompareRow(
      row,
      columns,
      compareEntry,
      curTag,
      prevTag,
      deltaLabel,
    );
  });

  // Yield so "Preparing…" can paint before Excel work.
  await new Promise((resolve) => {
    setTimeout(resolve, 0);
  });

  const ExcelJS = await import('exceljs');
  const workbook = new ExcelJS.Workbook();
  const sheetName = TAB_SHEET_NAME[tab] || 'All Pages';
  const sheet = workbook.addWorksheet(sheetName.slice(0, 31));

  const title = showCompare
    ? `${tab === 'vdp' ? 'VDP' : 'All Pages'} views by channel — all dealers (${curTag} – ${prevTag} – ${deltaLabel})`
    : `${tab === 'vdp' ? 'VDP' : 'All Pages'} views by channel — all dealers (${fromIso} to ${toIso})`;

  const colCount = Math.max(headers.length, 1);
  sheet.mergeCells(1, 1, 1, colCount);
  const titleCell = sheet.getCell(1, 1);
  titleCell.value = title;
  titleCell.font = { bold: true, size: 12, color: { argb: 'FFE8F0FF' } };
  titleCell.fill = HEADER_FILL;
  titleCell.alignment = { vertical: 'middle', horizontal: 'left' };
  sheet.getRow(1).height = 24;

  sheet.addRow(headers);
  if (dataRows.length) {
    sheet.addRows(dataRows);
  }

  const headerRow = sheet.getRow(2);
  headerRow.height = 36;
  headers.forEach((header, idx) => {
    const cell = headerRow.getCell(idx + 1);
    cell.value = header;
    cell.font = HEADER_FONT;
    cell.fill = HEADER_FILL;
    cell.alignment = {
      vertical: 'middle',
      horizontal: idx === 0 ? 'left' : 'center',
      wrapText: true,
    };
    applyBorders(cell);
  });

  const dataStart = 3;
  const dataEnd = 2 + dataRows.length;
  for (let rowNumber = dataStart; rowNumber <= dataEnd; rowNumber += 1) {
    const row = sheet.getRow(rowNumber);
    row.height = showCompare ? 58 : 22;
    for (let colNumber = 1; colNumber <= headers.length; colNumber += 1) {
      const cell = row.getCell(colNumber);
      cell.font = BODY_FONT;
      if (colNumber === 1) {
        cell.fill = DEALER_FILL;
        cell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
      } else if (colNumber === 2) {
        cell.fill = TOTAL_FILL;
        cell.alignment = {
          vertical: 'middle',
          horizontal: showCompare ? 'left' : 'right',
          wrapText: true,
        };
      } else {
        cell.fill = CHANNEL_FILL;
        cell.alignment = {
          vertical: 'middle',
          horizontal: showCompare ? 'left' : 'right',
          wrapText: true,
        };
      }
      applyBorders(cell);
      if (!showCompare && colNumber > 1 && typeof cell.value === 'number') {
        cell.numFmt = '#,##0';
      }
    }
  }

  sheet.getColumn(1).width = 34;
  sheet.getColumn(2).width = showCompare ? 24 : 14;
  for (let c = 3; c <= headers.length; c += 1) {
    sheet.getColumn(c).width = showCompare ? 24 : 16;
  }

  sheet.views = [{ state: 'frozen', xSplit: 1, ySplit: 2 }];

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });

  const tabSlug = slugPart(tab === 'vdp' ? 'vdp' : 'all-pages');
  const rangeSlug = showCompare
    ? `${fromIso}_to_${toIso}_vs_${String(compareFrom).slice(0, 10)}_to_${String(compareTo).slice(0, 10)}`
    : `${fromIso}_to_${toIso}`;
  const filename = `all-dealers_${tabSlug}_${rangeSlug}.xlsx`;

  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);

  return {
    filename,
    dealerCount: matrixRows.length,
  };
}
