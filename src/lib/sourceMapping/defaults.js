/** Defaults matching vdp_dashboard_prototype.html Source Mapping. */

export const CHANNEL_PALETTE = [
  '#2563eb',
  '#16a34a',
  '#d97706',
  '#dc2626',
  '#7c3aed',
  '#0891b2',
  '#db2777',
  '#65a30d',
  '#0d9488',
  '#ca8a04',
  '#4f46e5',
  '#e11d48',
];

export const UNMAPPED_ID = 'unmapped';

export function defaultChannels() {
  return [
    { id: 'organic-search', name: 'Organic Search', color: '#2563eb', sortOrder: 10, isUnmapped: false },
    { id: 'direct', name: 'Direct', color: '#16a34a', sortOrder: 20, isUnmapped: false },
    { id: 'paid-search', name: 'Paid Search', color: '#d97706', sortOrder: 30, isUnmapped: false },
    { id: 'paid-social', name: 'Paid Social', color: '#dc2626', sortOrder: 40, isUnmapped: false },
    { id: 'organic-social', name: 'Organic Social', color: '#7c3aed', sortOrder: 50, isUnmapped: false },
    { id: 'referral', name: 'Referral', color: '#0891b2', sortOrder: 60, isUnmapped: false },
    { id: 'email', name: 'Email', color: '#db2777', sortOrder: 70, isUnmapped: false },
    { id: UNMAPPED_ID, name: 'Unmapped', color: '#94a3b8', sortOrder: 999, isUnmapped: true },
  ];
}

/** HTML prototype default raw source/medium → channel id. */
export function defaultMappingEntries() {
  return [
    { rawSource: 'google', rawMedium: 'organic', channelId: 'organic-search' },
    { rawSource: 'bing', rawMedium: 'organic', channelId: 'organic-search' },
    { rawSource: 'yahoo', rawMedium: 'organic', channelId: 'organic-search' },
    { rawSource: '(direct)', rawMedium: '(none)', channelId: 'direct' },
    { rawSource: 'google', rawMedium: 'cpc', channelId: 'paid-search' },
    { rawSource: 'bing', rawMedium: 'cpc', channelId: 'paid-search' },
    { rawSource: 'facebook', rawMedium: 'paid', channelId: 'paid-social' },
    { rawSource: 'instagram', rawMedium: 'paid', channelId: 'paid-social' },
    { rawSource: 'tiktok', rawMedium: 'paid', channelId: 'paid-social' },
    { rawSource: 'facebook', rawMedium: 'organic', channelId: 'organic-social' },
    { rawSource: 'instagram', rawMedium: 'organic', channelId: 'organic-social' },
    { rawSource: 'autotrader.com', rawMedium: 'referral', channelId: 'referral' },
    { rawSource: 'cars.com', rawMedium: 'referral', channelId: 'referral' },
    { rawSource: 'cargurus.com', rawMedium: 'referral', channelId: 'referral' },
    { rawSource: 'newsletter', rawMedium: 'email', channelId: 'email' },
    { rawSource: 'klaviyo', rawMedium: 'email', channelId: 'email' },
  ];
}

export function rawPairKey(source, medium) {
  return `${String(source || '').trim().toLowerCase()}|||${String(medium || '').trim().toLowerCase()}`;
}

export function mappingMapFromEntries(entries) {
  const map = new Map();
  for (const e of entries || []) {
    map.set(rawPairKey(e.rawSource, e.rawMedium), e.channelId);
  }
  return map;
}
