/**
 * Page classification for smart_ga4_page_data (ported from edge V30).
 */

export function buildVdpMatchers(patternStr) {
  if (!patternStr) return [];
  const parts = String(patternStr)
    .split(/\s+OR\s+/i)
    .map((p) => p.trim())
    .filter(Boolean);
  const matchers = [];
  for (const raw of parts) {
    try {
      const regex = new RegExp(raw, 'i');
      const rawLower = raw.toLowerCase();
      matchers.push({
        regex,
        hasNewIndicator:
          rawLower.includes('/new-') ||
          rawLower.includes('/new/') ||
          rawLower.includes('/new-inventory') ||
          rawLower.includes('/new+') ||
          rawLower.includes('-new-') ||
          rawLower === '/product/new-' ||
          rawLower.includes('/inventory/new'),
        hasUsedIndicator:
          rawLower.includes('/used-') ||
          rawLower.includes('/used/') ||
          rawLower.includes('/used-inventory') ||
          rawLower.includes('/used+') ||
          rawLower.includes('-used-') ||
          rawLower === '/product/used-' ||
          rawLower.includes('/inventory/used') ||
          rawLower.includes('pre-owned'),
      });
    } catch {
      /* skip invalid regex */
    }
  }
  return matchers;
}

export function classifyPage(pageLocation, pagePath, vdpMatchers = []) {
  const pathLower = (pagePath || '').toLowerCase();
  const locLower = (pageLocation || '').toLowerCase();

  if (vdpMatchers.length > 0) {
    for (const matcher of vdpMatchers) {
      if (
        matcher.regex.test(pagePath || '') ||
        matcher.regex.test(pageLocation || '')
      ) {
        if (matcher.hasNewIndicator && !matcher.hasUsedIndicator) return 'VDP_New';
        if (matcher.hasUsedIndicator && !matcher.hasNewIndicator) return 'VDP_Used';
        if (
          pathLower.includes('/new-') ||
          pathLower.includes('/new/') ||
          pathLower.includes('/new+') ||
          pathLower.includes('-new-') ||
          pathLower.includes('/product/new-') ||
          pathLower.includes('/inventory/new') ||
          pathLower.includes('/new-inventory') ||
          locLower.includes('/new-') ||
          locLower.includes('/new/') ||
          locLower.includes('/inventory/new')
        ) {
          return 'VDP_New';
        }
        if (
          pathLower.includes('/used-') ||
          pathLower.includes('/used/') ||
          pathLower.includes('/used+') ||
          pathLower.includes('-used-') ||
          pathLower.includes('/product/used-') ||
          pathLower.includes('/inventory/used') ||
          pathLower.includes('/used-inventory') ||
          pathLower.includes('pre-owned') ||
          locLower.includes('/used-') ||
          locLower.includes('/used/') ||
          locLower.includes('/inventory/used')
        ) {
          return 'VDP_Used';
        }
        return 'VDP';
      }
    }
  }
  return 'Non-VDP';
}

/** Whether a page-grain row counts as VDP for view totals. */
export function isVdpPageRow(row) {
  if (row?.vdp_conditions === true) return true;
  const t = String(row?.ga4_page_type || '')
    .toLowerCase()
    .replace(/[\s_\-]+/g, '');
  if (t.startsWith('vdp')) return true;
  return false;
}
