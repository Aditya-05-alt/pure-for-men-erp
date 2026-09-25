import { colorForChannel } from '@/lib/ga4/channelDisplay';

function rowMap(rows) {
  const map = new Map();
  for (const row of rows || []) {
    const name = String(row.channel_bucket || '(not set)');
    map.set(name, {
      source: name,
      pageViews: Number(row.page_views) || 0,
      vdpViews: Number(row.vdp_views) || 0,
      color: row.color || null,
    });
  }
  return map;
}

/**
 * Fetch traffic-by-source for current (+ optional prior) period.
 * Uses get_traffic_by_source_advance via /api/dashboard/traffic-by-source.
 */
export async function fetchTrafficBySource({
  clientId,
  from,
  to,
  priorFrom,
  priorTo,
  onCancelCheck,
}) {
  if (!clientId || !from || !to) return [];
  if (typeof window === 'undefined') return [];
  if (onCancelCheck?.()) return [];

  const qs = new URLSearchParams({
    clientId: String(clientId).trim(),
    from: String(from).slice(0, 10),
    to: String(to).slice(0, 10),
  });

  const curRes = await fetch(`/api/dashboard/traffic-by-source?${qs}`, {
    credentials: 'same-origin',
  });
  const curJson = await curRes.json().catch(() => ({}));
  if (onCancelCheck?.()) return [];
  if (!curRes.ok) {
    throw new Error(curJson.error || `Traffic by source failed (${curRes.status})`);
  }

  const curMap = rowMap(curJson.rows);
  let priMap = new Map();

  if (priorFrom && priorTo) {
    const pqs = new URLSearchParams({
      clientId: String(clientId).trim(),
      from: String(priorFrom).slice(0, 10),
      to: String(priorTo).slice(0, 10),
    });
    const priRes = await fetch(`/api/dashboard/traffic-by-source?${pqs}`, {
      credentials: 'same-origin',
    });
    const priJson = await priRes.json().catch(() => ({}));
    if (onCancelCheck?.()) return [];
    if (!priRes.ok) {
      throw new Error(
        priJson.error || `Traffic prior period failed (${priRes.status})`
      );
    }
    priMap = rowMap(priJson.rows);
  }

  const names = [...new Set([...curMap.keys(), ...priMap.keys()])];

  return names
    .map((name, index) => {
      const cur = curMap.get(name) || { pageViews: 0, vdpViews: 0, color: null };
      const pri = priMap.get(name) || { pageViews: 0, vdpViews: 0, color: null };
      const pv1 = cur.pageViews;
      const pv0 = pri.pageViews;
      const vdp1 = cur.vdpViews;
      const vdp0 = pri.vdpViews;
      return {
        source: name,
        color: cur.color || pri.color || colorForChannel(name, index),
        pv1,
        pv0,
        pvmom: pv0 > 0 ? ((pv1 - pv0) / pv0) * 100 : pv1 > 0 ? 100 : 0,
        vdp1,
        vdp0,
        vdpmom: vdp0 > 0 ? ((vdp1 - vdp0) / vdp0) * 100 : vdp1 > 0 ? 100 : 0,
        rate: pv1 > 0 ? (vdp1 / pv1) * 100 : 0,
      };
    })
    .sort((a, b) => b.pv1 - a.pv1 || a.source.localeCompare(b.source));
}
