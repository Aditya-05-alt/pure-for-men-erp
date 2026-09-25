/**
 * Warm leads + proximity datasets — values zeroed out, ready for Supabase hydration.
 *
 * Shape contracts:
 *   WARM_LEADS_TOP: [{ zip, city, distance, cond, make, visits }]
 *   WARM_LEADS_ALL: [{ zip, city, distance, visits, lastVisit, make, cond, firstChannel }]
 *   PROXIMITY:      [{ label, value, pct, color, faded? }]
 *   MAKES_VALUES:   { cur, prev, ly } as parallel arrays
 */
export const WARM_LEADS_TOP = [];

export const WARM_LEADS_ALL = [];

export const PROXIMITY = [
  { label: 'Within 15 mi', value: 0, pct: 0, color: 'var(--acc)' },
  { label: '15–40 mi',     value: 0, pct: 0, color: 'var(--green)' },
  { label: '40–100 mi',    value: 0, pct: 0, color: 'var(--blue)' },
  { label: 'Out of area',  value: 0, pct: 0, color: 'var(--s3)', faded: true },
];

export const MAKES_VALUES = {
  cur:  [0, 0, 0, 0, 0, 0],
  prev: [0, 0, 0, 0, 0, 0],
  ly:   [0, 0, 0, 0, 0, 0],
};
