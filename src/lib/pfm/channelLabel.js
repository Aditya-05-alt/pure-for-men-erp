/**
 * Format chipper_pfm_ga4_data.channel (snake_case) for display / color map.
 * e.g. paid_search → Paid Search, cross-network → Cross-network
 */
export function formatPfmChannelLabel(raw) {
  const s = String(raw || '').trim();
  if (!s || s === '(empty)') return '(not set)';
  if (s === '(not set)') return '(not set)';
  return s
    .split('_')
    .map((part) => {
      if (!part) return part;
      if (part.toLowerCase() === 'ai') return 'Ai';
      return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
    })
    .join(' ');
}

export function mapPfmChannelRows(rows) {
  return (rows || []).map((r) => ({
    channel_bucket: formatPfmChannelLabel(r.channel_bucket),
    views: Number(r.views) || 0,
  }));
}
