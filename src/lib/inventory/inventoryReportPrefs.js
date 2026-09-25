import { toCalendarISO } from '@/lib/ga4/dateRange';

const INVENTORY_REPORT_DATE_KEY = 'sa_inventory_report_date';
const INVENTORY_REPORT_DATE_SESSION_KEY = 'sa_inventory_report_date_session';
const INVENTORY_COMPARE_ENABLED_KEY = 'sa_inventory_compare_enabled';
const INVENTORY_COMPARE_DATE_KEY = 'sa_inventory_compare_date';
const INVENTORY_COMPARE_DATE_SESSION_KEY = 'sa_inventory_compare_date_session';
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function defaultInventoryReportDate() {
  return toCalendarISO(new Date());
}

export function defaultInventoryCompareDate(reportDate = defaultInventoryReportDate()) {
  const base = new Date(`${reportDate}T00:00:00`);
  if (Number.isNaN(base.getTime())) return defaultInventoryReportDate();
  base.setDate(base.getDate() - 1);
  return toCalendarISO(base);
}

export function formatInventoryDateLabel(iso) {
  if (!iso) return '';
  const d = new Date(`${String(iso).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function canUseStorage() {
  return typeof window !== 'undefined';
}

/** Default on login / new tab: today unless user already picked a date this session. */
export function resolveInventoryReportDateOnLoad() {
  if (!canUseStorage()) return defaultInventoryReportDate();
  try {
    const sessionRaw = sessionStorage.getItem(INVENTORY_REPORT_DATE_SESSION_KEY)?.trim();
    if (sessionRaw && ISO_DATE_RE.test(sessionRaw)) return sessionRaw;
  } catch {
    /* ignore */
  }
  return defaultInventoryReportDate();
}

export function readStoredInventoryReportDate() {
  return resolveInventoryReportDateOnLoad();
}

export function writeStoredInventoryReportDate(value) {
  if (!canUseStorage() || value == null) return;
  const date = String(value).slice(0, 10);
  if (!ISO_DATE_RE.test(date)) return;
  try {
    sessionStorage.setItem(INVENTORY_REPORT_DATE_SESSION_KEY, date);
    localStorage.setItem(INVENTORY_REPORT_DATE_KEY, date);
  } catch {
    /* ignore */
  }
}

export function readStoredInventoryCompareEnabled() {
  if (!canUseStorage()) return false;
  try {
    return localStorage.getItem(INVENTORY_COMPARE_ENABLED_KEY) === 'true';
  } catch {
    return false;
  }
}

export function writeStoredInventoryCompareEnabled(enabled) {
  if (!canUseStorage()) return;
  try {
    localStorage.setItem(INVENTORY_COMPARE_ENABLED_KEY, enabled ? 'true' : 'false');
  } catch {
    /* ignore */
  }
}

export function readStoredInventoryCompareDate() {
  if (!canUseStorage()) return null;
  try {
    const sessionRaw = sessionStorage.getItem(INVENTORY_COMPARE_DATE_SESSION_KEY)?.trim();
    if (sessionRaw && ISO_DATE_RE.test(sessionRaw)) return sessionRaw;

    const raw = localStorage.getItem(INVENTORY_COMPARE_DATE_KEY)?.trim();
    if (!raw || !ISO_DATE_RE.test(raw)) return null;
    return raw;
  } catch {
    return null;
  }
}

export function writeStoredInventoryCompareDate(value) {
  if (!canUseStorage() || value == null) return;
  const date = String(value).slice(0, 10);
  if (!ISO_DATE_RE.test(date)) return;
  try {
    sessionStorage.setItem(INVENTORY_COMPARE_DATE_SESSION_KEY, date);
    localStorage.setItem(INVENTORY_COMPARE_DATE_KEY, date);
  } catch {
    /* ignore */
  }
}

export function normalizeInventoryReportDate(value) {
  if (value && ISO_DATE_RE.test(String(value).slice(0, 10))) {
    return String(value).slice(0, 10);
  }
  return defaultInventoryReportDate();
}
