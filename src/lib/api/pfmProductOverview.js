/**
 * Fetch Product overview bundle for Pure for Men (VDP-style layout).
 */
export async function fetchPfmProductOverview({
  from,
  to,
  priorFrom,
  priorTo,
  clientId = '001',
  limit = 50,
  signal,
}) {
  const qs = new URLSearchParams({
    from,
    to,
    priorFrom,
    priorTo,
    clientId,
    limit: String(limit),
  });
  const res = await fetch(`/api/pfm/product-overview?${qs}`, { signal });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      json?.error || `Product overview request failed (${res.status})`
    );
  }
  return json;
}
