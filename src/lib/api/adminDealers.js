async function parseJson(res) {
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || 'Request failed.');
  return json;
}

export async function fetchAdminDealers({ activeOnly = false, search = '' } = {}) {
  const qs = new URLSearchParams();
  if (activeOnly) qs.set('activeOnly', 'true');
  if (search) qs.set('search', search);

  const suffix = qs.toString() ? `?${qs}` : '';
  const res = await fetch(`/api/admin/dealers${suffix}`, {
    credentials: 'same-origin',
  });
  return parseJson(res);
}

export async function createAdminDealer(payload) {
  const res = await fetch('/api/admin/dealers', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return parseJson(res);
}

export async function updateAdminDealer(id, payload) {
  const res = await fetch(`/api/admin/dealers/${id}`, {
    method: 'PATCH',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return parseJson(res);
}

/** Switch a dealer on/off — off hides it from dashboard dropdowns (VDP overview). */
export async function setAdminDealerActive(id, active) {
  const res = await fetch(`/api/admin/dealers/${id}/active`, {
    method: 'PATCH',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ active: active === true }),
  });
  return parseJson(res);
}

/** Auto-save dealer category from the table dropdown. */
export async function setAdminDealerCategory(id, dealerCategory) {
  const res = await fetch(`/api/admin/dealers/${id}/category`, {
    method: 'PATCH',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ dealerCategory: dealerCategory || '' }),
  });
  return parseJson(res);
}

/** Toggle All Dealers portfolio visibility for a tab: vdp | all | srp. */
export async function setAdminDealerAllDealersTab(id, tab, enabled) {
  const res = await fetch(`/api/admin/dealers/${id}/all-dealers-tabs`, {
    method: 'PATCH',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tab, enabled: enabled === true }),
  });
  return parseJson(res);
}

export async function deleteAdminDealer(id, { hard = false } = {}) {
  const qs = hard ? '?hard=true' : '';
  const res = await fetch(`/api/admin/dealers/${id}${qs}`, {
    method: 'DELETE',
    credentials: 'same-origin',
  });
  return parseJson(res);
}

/**
 * Backfill one date chunk for a dealer (1 day — avoids statement timeout).
 * Body: { invTypeRawKey?, from, to, saveKey?: boolean }
 */
export async function refreshAdminDealerCustomType(
  id,
  { invTypeRawKey, from, to, saveKey = true } = {}
) {
  const res = await fetch(`/api/admin/dealers/${id}/refresh-custom-type`, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from,
      to,
      saveKey,
      ...(invTypeRawKey !== undefined ? { invTypeRawKey } : {}),
    }),
  });
  return parseJson(res);
}

export async function fetchAdminDealerLocations(dealerId) {
  const res = await fetch(`/api/admin/dealers/${dealerId}/locations`, {
    credentials: 'same-origin',
  });
  return parseJson(res);
}

export async function addAdminDealerLocation(dealerId, locationName) {
  const res = await fetch(`/api/admin/dealers/${dealerId}/locations`, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ locationName }),
  });
  return parseJson(res);
}

export async function deleteAdminDealerLocation(dealerId, locationId) {
  const res = await fetch(
    `/api/admin/dealers/${dealerId}/locations?locationId=${encodeURIComponent(locationId)}`,
    {
      method: 'DELETE',
      credentials: 'same-origin',
    }
  );
  return parseJson(res);
}
