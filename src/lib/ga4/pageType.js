/** Normalize `ga4_page_type` to dashboard tab id. */
export function pageTypeToTab(raw) {
  const t = String(raw || '').toLowerCase().replace(/[\s_\-]+/g, '');
  if (t === 'srp' || t === 'searchresults' || t === 'searchresultspage') return 'srp';
  if (t === 'home' || t === 'homepage') return 'home';
  if (
    t === 'vdp' ||
    t.startsWith('vdp') ||
    t === 'vehicledetails' ||
    t === 'vehicledetailspage'
  ) {
    return 'vdp';
  }
  return 'other';
}

export function sumVdpViewsByDate(rows) {
  const daily = {};
  for (const r of rows || []) {
    if (pageTypeToTab(r.ga4_page_type) !== 'vdp') continue;
    const date = String(r.report_date || '').split('T')[0];
    if (!date) continue;
    daily[date] = (daily[date] || 0) + (Number(r.views) || 0);
  }
  return daily;
}
