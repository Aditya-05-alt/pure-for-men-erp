/**
 * Channel dataset — values zeroed out, ready to be hydrated from Supabase.
 * Color palette is preserved so panels keep the SmartAnalytics look.
 *
 * Shape contracts (don't change without updating the components):
 *   CHANNEL_COMPARISON: [{ ch, color, cur, prev, ly }]
 *   CHANNEL_DONUT:     [{ name, color, value, pct }]
 *   ATTRIBUTION:       [{ name, color, ga4, ga4Pct, truePct, delta }]
 */
export const CHANNEL_COMPARISON = [
  { ch: 'Organic Search', color: '#4EE09C', cur: 0, prev: 0, ly: 0 },
  { ch: 'Paid Search',    color: '#6FA0FF', cur: 0, prev: 0, ly: 0 },
  { ch: 'Direct',         color: '#C8E87A', cur: 0, prev: 0, ly: 0 },
  { ch: 'Paid Social',    color: '#FFA269', cur: 0, prev: 0, ly: 0 },
  { ch: 'Organic Social', color: '#B89BFF', cur: 0, prev: 0, ly: 0 },
  { ch: 'Other',          color: '#7A8095', cur: 0, prev: 0, ly: 0 },
];

export const CHANNEL_DONUT = [
  { name: 'Organic',     color: '#4EE09C', value: 0, pct: 0 },
  { name: 'Paid Search', color: '#6FA0FF', value: 0, pct: 0 },
  { name: 'Direct',      color: '#C8E87A', value: 0, pct: 0 },
  { name: 'Paid Social', color: '#FFA269', value: 0, pct: 0 },
  { name: 'Other',       color: '#7A8095', value: 0, pct: 0 },
];

export const ATTRIBUTION = [
  { name: 'Organic',     color: '#4EE09C', ga4: 0, ga4Pct: 0, truePct: 0, delta: 0 },
  { name: 'Paid Search', color: '#6FA0FF', ga4: 0, ga4Pct: 0, truePct: 0, delta: 0 },
  { name: 'Paid Social', color: '#FFA269', ga4: 0, ga4Pct: 0, truePct: 0, delta: 0 },
  { name: 'Direct',      color: '#C8E87A', ga4: 0, ga4Pct: 0, truePct: 0, delta: 0 },
];
