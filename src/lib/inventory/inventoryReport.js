/**
 * Inventory report — standalone module (not part of VDP Step 3 / smart_final_data).
 */

import { fetchGetInventoryReport } from '@/lib/api/inventoryReportApi';
import { createClient } from '@/lib/supabase/client';
import { isAllDealerClient } from '@/lib/dashboard/allDealers';
import {
  filterOptionsFromRpc,
  normalizeInventoryFilters,
} from './inventoryReportFilters';
import { getDummyInventoryReport } from './inventoryReportDummy';
import { INVENTORY_PIPELINE } from './inventoryPipeline';
import { normalizeInventoryReportResponse } from './inventoryReportNormalize';
import { normalizeInventoryReportDate } from './inventoryReportPrefs';

export const INVENTORY_REPORT_PATH = '/dashboard/inventory';

/** Inventory report requires a single dealer; no portfolio-wide "All Dealers" mode. */
export const INVENTORY_REPORT_INCLUDES_ALL_DEALERS = false;

export function inventoryReportExcludesAllDealers() {
  return !INVENTORY_REPORT_INCLUDES_ALL_DEALERS;
}

export function isInventoryReportPath(pathname) {
  return Boolean(pathname?.startsWith(INVENTORY_REPORT_PATH));
}

/** Pick a concrete dealer when All Dealers is not allowed. */
export function resolveInventoryReportClient(client, dealers = []) {
  if (!inventoryReportExcludesAllDealers()) return client;
  if (isAllDealerClient(client)) {
    return dealers.find((d) => !isAllDealerClient(d)) ?? null;
  }
  return client;
}

export function resolveInventoryReportClientId(client, dealers = []) {
  const resolved = resolveInventoryReportClient(client, dealers);
  return resolved?.ga4CustomerId || resolved?.id || null;
}

export const INVENTORY_REPORT_SECTION_ORDER = [
  'condition',
  'location',
  'make',
  'type',
];

const EMPTY_LIST = {
  rows: [],
  totalUnits: 0,
  totalValue: 0,
  averagePrice: 0,
};

const EMPTY_SECTION = (title, labelHeader) => ({
  title,
  labelHeader,
  rows: [],
  totalUnits: 0,
  totalValue: 0,
});

const EMPTY_SECTIONS = {
  condition: EMPTY_SECTION('Condition', 'Conditions'),
  location: EMPTY_SECTION('Location', 'Locations'),
  make: EMPTY_SECTION('Make', 'Makes'),
  type: EMPTY_SECTION('Type', 'Types'),
};

export function inventoryReportDateKey(value) {
  if (!value) return null;
  const date = String(value).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null;
}

/** True only when the DB snapshot date matches the requested report date (no fallback). */
export function inventorySnapshotMatchesDate(pullDate, reportDate) {
  const requested = inventoryReportDateKey(reportDate);
  const snapshot = inventoryReportDateKey(pullDate);
  if (!requested) return false;
  return snapshot === requested;
}

/** VDP-style refresh: keep prior report visible while a new request is in flight. */
export function isInventoryReportRefreshing(loading, hasDisplayedReport) {
  return Boolean(loading && hasDisplayedReport);
}

/**
 * When RPC falls back to an earlier pull_date, return zeroed report for the requested date.
 */
export function applyExactInventorySnapshotPolicy(report, reportDate) {
  const requested = inventoryReportDateKey(reportDate);
  if (!requested || !report) return report;

  if (inventorySnapshotMatchesDate(report.meta?.pullDate, requested)) {
    return report;
  }

  return buildEmptyInventoryReport({
    clientId: report.meta?.clientId ?? null,
    reportDate: requested,
    filters: report.meta?.filters ?? null,
    allDealers: Boolean(report.meta?.allDealers),
    nearestPullDate: inventoryReportDateKey(report.meta?.pullDate),
  });
}

export function buildEmptyInventoryReport({
  clientId = null,
  reportDate = null,
  filters = null,
  allDealers = false,
  nearestPullDate = null,
  source = INVENTORY_PIPELINE.dailyHootTable,
} = {}) {
  const requested = inventoryReportDateKey(reportDate);
  const message = requested
    ? `No inventory snapshot for ${requested}`
    : 'No inventory snapshot for the requested date';

  return {
    ready: true,
    sections: { ...EMPTY_SECTIONS },
    inventoryList: { ...EMPTY_LIST },
    filterOptions: filterOptionsFromRpc({
      years: [],
      makes: [],
      models: [],
      types: [],
      locations: [],
    }),
    meta: {
      clientId,
      reportDate: requested,
      requestedDate: requested,
      pullDate: null,
      nearestPullDate,
      filters,
      source,
      rowCount: 0,
      allDealers,
      noSnapshot: true,
      message,
    },
  };
}

/**
 * @param {{
 *   clientId?: string,
 *   reportDate?: string,
 *   filters?: object,
 * }} params
 */
export async function fetchInventoryReport(params = {}) {
  const normalizedFilters = normalizeInventoryFilters(params.filters);
  const reportDate = normalizeInventoryReportDate(params.reportDate);
  const clientId = params.clientId ? String(params.clientId).trim() : null;

  const supabase = createClient();
  if (!supabase) {
    const sample = getDummyInventoryReport();
    return {
      ...sample,
      filterOptions: null,
      meta: {
        clientId,
        reportDate,
        pullDate: null,
        filters: normalizedFilters,
        source: 'sample',
        allDealers: false,
      },
    };
  }

  const raw = await fetchGetInventoryReport({
    clientId,
    reportDate,
    filters: normalizedFilters,
  });

  const normalized = normalizeInventoryReportResponse(raw, {
    clientId,
    reportDate,
    filters: normalizedFilters,
  });

  return applyExactInventorySnapshotPolicy(normalized, reportDate);
}

export { EMPTY_LIST };
