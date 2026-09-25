/** US + DC state codes — used to keep Location filter as real places only. */
const US_STATE_CODES = new Set([
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'DC', 'FL', 'GA', 'HI', 'ID',
  'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD', 'MA', 'MI', 'MN', 'MS', 'MO',
  'MT', 'NE', 'NV', 'NH', 'NJ', 'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA',
  'RI', 'SC', 'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY',
]);

const JUNK_LOCATION_RE =
  /dealership|inventory|explore|trusted|models|selection|latest|multi[- ]?state|for sale|motorhomes?|campers?|trailers?|\bdeals\b|\bsales\b/i;

/**
 * Keep Location filter options aligned with Location Breakdown:
 * "City, ST" / "City ST" with a real US state — drop marketing / dealer titles.
 */
export function isCleanVdpLocationName(value) {
  const s = String(value || '').trim();
  if (!s) return false;
  if (s === 'All') return true;
  if (s.toLowerCase() === 'unknown') return false;
  if (s.length < 4 || s.length > 60) return false;
  if (/[\^\*]/.test(s)) return false;
  if (/[\u4e00-\u9fff]/.test(s)) return false; // Chinese / CJK junk
  if (JUNK_LOCATION_RE.test(s)) return false;

  const m = s.match(/,\s*([A-Za-z]{2})$/) || s.match(/\s([A-Za-z]{2})$/);
  if (!m) return false;
  return US_STATE_CODES.has(m[1].toUpperCase());
}

/** Filter a locations option list; preserves leading "All". */
export function sanitizeVdpLocationOptions(locations) {
  const list = Array.isArray(locations) ? locations : [];
  const out = [];
  const seen = new Set();

  for (const raw of list) {
    const s = String(raw || '').trim();
    if (!s) continue;
    if (s === 'All') {
      if (!seen.has('All')) {
        seen.add('All');
        out.push('All');
      }
      continue;
    }
    if (!isCleanVdpLocationName(s)) continue;
    const key = s.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
  }

  if (!out.includes('All')) out.unshift('All');
  return out;
}
