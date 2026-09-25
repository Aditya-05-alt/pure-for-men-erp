function vehicleKey(row) {
  return [
    String(row.inv_year || '').trim(),
    String(row.inv_make || '').trim().toLowerCase(),
    String(row.inv_model || '').trim().toLowerCase(),
    String(row.inv_condition || '').trim().toLowerCase(),
  ].join('|');
}

/**
 * Top VDP vehicles for a dealer/period (get_top_vdp_vehicles_advance).
 * Optionally pass priorFrom/priorTo to attach MoM on the same vehicle keys.
 */
export async function fetchTopVdpVehicles({
  clientId,
  from,
  to,
  priorFrom,
  priorTo,
  limit = 5,
  onCancelCheck,
}) {
  if (!clientId || !from || !to) return [];
  if (typeof window === 'undefined') return [];
  if (onCancelCheck?.()) return [];

  const qs = new URLSearchParams({
    clientId: String(clientId).trim(),
    from: String(from).slice(0, 10),
    to: String(to).slice(0, 10),
    limit: String(limit),
  });

  const curRes = await fetch(`/api/dashboard/top-vdp-vehicles?${qs}`, {
    credentials: 'same-origin',
  });
  const curJson = await curRes.json().catch(() => ({}));
  if (onCancelCheck?.()) return [];
  if (!curRes.ok) {
    throw new Error(curJson.error || `Top vehicles failed (${curRes.status})`);
  }

  const current = curJson.rows || [];
  let priorMap = new Map();

  if (priorFrom && priorTo) {
    const pqs = new URLSearchParams({
      clientId: String(clientId).trim(),
      from: String(priorFrom).slice(0, 10),
      to: String(priorTo).slice(0, 10),
      limit: String(Math.max(limit * 4, 20)),
    });
    const priRes = await fetch(`/api/dashboard/top-vdp-vehicles?${pqs}`, {
      credentials: 'same-origin',
    });
    const priJson = await priRes.json().catch(() => ({}));
    if (onCancelCheck?.()) return [];
    if (priRes.ok) {
      for (const row of priJson.rows || []) {
        priorMap.set(vehicleKey(row), Number(row.views) || 0);
      }
    }
  }

  return current.map((row) => {
    const views = Number(row.views) || 0;
    const prior = priorMap.get(vehicleKey(row)) || 0;
    const mom =
      prior > 0 ? ((views - prior) / prior) * 100 : views > 0 ? 100 : 0;
    return {
      year: row.inv_year || '—',
      make: row.inv_make || 'Unknown',
      model: row.inv_model || 'Unknown',
      condition: row.inv_condition || 'Unknown',
      stock: row.inv_stock_number || null,
      vdp1: views,
      vdp0: prior,
      vdpmom: mom,
    };
  });
}
