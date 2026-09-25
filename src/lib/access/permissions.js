export const REPORT_OPTIONS = [
  { key: 'overview', label: 'All Dealers / Overview', href: '/dashboard' },
  { key: 'traffic', label: 'Traffic by Source', href: '/dashboard/traffic' },
  { key: 'campaigns', label: 'Campaign Views', href: '/dashboard/campaigns_advance' },
  { key: 'inventory', label: 'Inventory Performance', href: '/dashboard/inventory' },
];

export const DEFAULT_ACCESS = Object.freeze({
  role: 'admin',
  allReports: true,
  reportKeys: REPORT_OPTIONS.map((report) => report.key),
  allDealers: true,
  dealerIds: [],
});

const VALID_REPORT_KEYS = new Set(REPORT_OPTIONS.map((report) => report.key));

export function normalizeAccess(row) {
  if (!row || row.role !== 'user') return { ...DEFAULT_ACCESS };

  return {
    role: 'user',
    allReports: row.all_reports === true,
    reportKeys: (row.report_keys || []).filter((key) => VALID_REPORT_KEYS.has(key)),
    allDealers: row.all_dealers === true,
    dealerIds: (row.dealer_ids || [])
      .map(Number)
      .filter((id) => Number.isInteger(id) && id > 0),
  };
}

export function canAccessReport(access, key) {
  if (!access || access.role === 'admin' || access.allReports) return true;
  return access.reportKeys.includes(key);
}

export function reportKeyFromPathname(pathname) {
  if (
    pathname === '/dashboard' ||
    pathname === '/dashboard/' ||
    pathname?.startsWith('/dashboard/overview')
  ) {
    return 'overview';
  }
  if (pathname?.startsWith('/dashboard/traffic')) return 'traffic';
  if (
    pathname?.startsWith('/dashboard/campaigns_advance') ||
    pathname?.startsWith('/dashboard/campaigns')
  ) {
    return 'campaigns';
  }
  // Available to every logged-in user (same as HTML prototype top tabs)
  if (pathname?.startsWith('/dashboard/inventory-analyse')) return null;
  if (pathname?.startsWith('/dashboard/source-mapping')) return null;
  // Same access gate as Inventory Performance
  if (pathname?.startsWith('/dashboard/vehicle-age')) return 'inventory';
  if (pathname?.startsWith('/dashboard/inventory')) return 'inventory';
  // Legacy routes redirect visually; treat as overview for access
  if (
    pathname?.startsWith('/dashboard/health') ||
    pathname?.startsWith('/dashboard/attribution') ||
    pathname?.startsWith('/dashboard/local')
  ) {
    return 'overview';
  }
  return null;
}

export function firstAllowedReportHref(access) {
  return (
    REPORT_OPTIONS.find((report) => canAccessReport(access, report.key))?.href ||
    '/login'
  );
}
