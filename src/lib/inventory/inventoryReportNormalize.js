import { colorForInventoryRow } from './inventoryDonutData';
import { INVENTORY_PIPELINE } from './inventoryPipeline';
import { filterOptionsFromRpc } from './inventoryReportFilters';

function normalizeGroupKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s*-\s*/g, '-')
    .replace(/\s*,\s*/g, ' ')
    .replace(/\s+/g, ' ');
}

function pickPreferredLabel(current, candidate) {
  if (!current) return candidate;
  if (!candidate) return current;
  const hasCommaState = /,\s*[a-z]{2}(\s|$)/i.test(candidate);
  const currentHasCommaState = /,\s*[a-z]{2}(\s|$)/i.test(current);
  if (hasCommaState && !currentHasCommaState) return candidate;
  if (!hasCommaState && currentHasCommaState) return current;
  return String(candidate).length > String(current).length ? candidate : current;
}

function mergeDuplicateLabels(rows = []) {
  const merged = new Map();

  for (const row of rows) {
    const label = row.label ?? 'Unknown';
    const key = normalizeGroupKey(label) || 'unknown';
    const prev = merged.get(key);

    if (!prev) {
      merged.set(key, {
        ...row,
        label,
        units: Number(row.units) || 0,
        totalValue: Number(row.totalValue) || 0,
      });
      continue;
    }

    prev.units += Number(row.units) || 0;
    prev.totalValue += Number(row.totalValue) || 0;
    prev.label = pickPreferredLabel(prev.label, label);
  }

  const list = Array.from(merged.values());
  const totalUnits = list.reduce((sum, row) => sum + row.units, 0);

  return list
    .sort((a, b) => b.units - a.units || a.label.localeCompare(b.label))
    .map((row, index) => ({
      ...row,
      pct: totalUnits > 0 ? (row.units / totalUnits) * 100 : 0,
      color: colorForInventoryRow(row.label, index),
    }));
}

function enrichRows(rows = []) {
  return mergeDuplicateLabels(rows);
}

function enrichRowsExact(rows = []) {
  const list = (rows || []).map((row) => ({
    ...row,
    label: row.label ?? '(No type)',
    units: Number(row.units) || 0,
    totalValue: Number(row.totalValue) || 0,
  }));
  const totalUnits = list.reduce((sum, row) => sum + row.units, 0);

  return list
    .sort((a, b) => b.units - a.units || String(a.label).localeCompare(String(b.label)))
    .map((row, index) => ({
      ...row,
      pct: totalUnits > 0 ? (row.units / totalUnits) * 100 : 0,
      color: colorForInventoryRow(row.label, index),
    }));
}

function enrichSection(section, { mergeLabels = true } = {}) {
  if (!section) return null;
  return {
    ...section,
    rows: mergeLabels ? enrichRows(section.rows) : enrichRowsExact(section.rows),
    totalUnits: Number(section.totalUnits) || 0,
    totalValue: Number(section.totalValue) || 0,
  };
}

function mergeInventoryListRows(rows = []) {
  const merged = new Map();

  for (const row of rows) {
    const manufacturer = row.manufacturer ?? 'Unknown';
    const brandModel = row.brandModel ?? 'Unknown';
    const condition = String(row.condition || '').toLowerCase();
    const key = `${normalizeGroupKey(manufacturer)}|${normalizeGroupKey(brandModel)}|${condition}`;
    const prev = merged.get(key);

    if (!prev) {
      merged.set(key, {
        ...row,
        manufacturer,
        brandModel,
        condition,
        units: Number(row.units) || 0,
        totalValue: Number(row.totalValue) || 0,
      });
      continue;
    }

    prev.units += Number(row.units) || 0;
    prev.totalValue += Number(row.totalValue) || 0;
    prev.manufacturer = pickPreferredLabel(prev.manufacturer, manufacturer);
  }

  return Array.from(merged.values()).map((row) => ({
    ...row,
    averagePrice: row.units > 0 ? Math.round(row.totalValue / row.units) : 0,
  }));
}

/**
 * Map get_inventory_report RPC jsonb → UI report shape.
 * @param {object} raw
 * @param {{ clientId?: string, reportDate?: string, filters?: object }} params
 */
export function normalizeInventoryReportResponse(raw, params = {}) {
  if (!raw?.ready) {
    throw new Error('Inventory report is not ready.');
  }

  const sections = {
    condition: enrichSection(raw.sections?.condition),
    location: enrichSection(raw.sections?.location),
    make: enrichSection(raw.sections?.make),
    type: enrichSection(raw.sections?.type, { mergeLabels: false }),
  };

  const list = raw.inventoryList ?? {};
  const inventoryList = {
    rows: mergeInventoryListRows(Array.isArray(list.rows) ? list.rows : []),
    totalUnits: Number(list.totalUnits) || 0,
    totalValue: Number(list.totalValue) || 0,
    averagePrice: Number(list.averagePrice) || 0,
  };

  return {
    ready: true,
    sections,
    inventoryList,
    filterOptions: filterOptionsFromRpc(raw.filterOptions),
    meta: {
      ...(raw.meta || {}),
      clientId: params.clientId ?? raw.meta?.clientId ?? null,
      reportDate: params.reportDate ?? raw.meta?.requestedDate ?? null,
      pullDate: raw.meta?.pullDate ?? null,
      filters: params.filters ?? null,
      source: raw.meta?.source ?? INVENTORY_PIPELINE.dailyHootTable,
      inventorySource: raw.meta?.inventorySource ?? null,
      hootSource: raw.meta?.hootSource ?? INVENTORY_PIPELINE.liveTable,
      countMode: raw.meta?.countMode ?? 'snapshot_sk_pull_date',
      rowCount: Number(raw.meta?.rowCount) || inventoryList.totalUnits,
      allDealers: Boolean(raw.meta?.allDealers),
    },
  };
}
