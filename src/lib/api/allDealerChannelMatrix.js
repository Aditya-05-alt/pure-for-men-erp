import { colorForChannel } from '@/lib/ga4/channelDisplay';

/** Parallel chunks from the start — avoids one huge cold first RPC. */
const CHUNK_SIZE = 12;
const CHUNK_CONCURRENCY = 6;

function buildColumnOrder(results) {
  const totals = new Map();
  for (const row of results) {
    for (const slice of row.slices) {
      totals.set(slice.name, (totals.get(slice.name) || 0) + (Number(slice.value) || 0));
    }
  }
  return [...totals.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([name]) => name);
}

function dealerClientIds(dealers) {
  return (dealers || [])
    .filter((d) => d?.name)
    .map((d) => String(d.ga4CustomerId || '').trim())
    .filter(Boolean);
}

function chunkClientIds(dealers, chunkSize = CHUNK_SIZE) {
  const ids = dealerClientIds(dealers);
  if (!ids.length) return [];

  const chunks = [];
  for (let i = 0; i < ids.length; i += chunkSize) {
    chunks.push(ids.slice(i, i + chunkSize));
  }
  return chunks;
}

function isTimeoutError(message) {
  return /statement timeout|canceling statement|timeout|57014/i.test(
    String(message || '')
  );
}

export function matrixFromRpcRows(rpcRows, dealers, failedClientIds = null) {
  const failed = failedClientIds instanceof Set ? failedClientIds : new Set();
  const byClient = new Map();
  const nameByClient = new Map();

  for (const row of rpcRows || []) {
    const clientId = String(row.client_id ?? '').trim();
    if (!clientId) continue;
    if (row.dealer_name) nameByClient.set(clientId, row.dealer_name);
    if (!byClient.has(clientId)) byClient.set(clientId, []);
    if (row.channel_bucket && Number(row.views) > 0) {
      const bucket = String(row.channel_bucket);
      byClient.get(clientId).push({
        name: bucket,
        value: Number(row.views) || 0,
        color: row._color || colorForChannel(bucket),
        pct: 0,
      });
    }
  }

  const results = (dealers || [])
    .filter((d) => d?.name)
    .map((dealer) => {
      const clientId = String(dealer.ga4CustomerId || '').trim();
      if (!clientId) {
        return {
          dealer,
          slices: [],
          total: 0,
          error: 'No GA4 customer ID',
        };
      }
      if (failed.has(clientId)) {
        return {
          dealer,
          slices: [],
          total: 0,
          error: 'Timed out loading this dealer',
        };
      }
      const slices = byClient.get(clientId) || [];
      const total = slices.reduce((sum, slice) => sum + (Number(slice.value) || 0), 0);
      return {
        dealer: {
          ...dealer,
          name: dealer.name || nameByClient.get(clientId) || 'Unnamed dealer',
        },
        slices,
        total,
        error: null,
      };
    });

  results.sort((a, b) => String(a.dealer.name).localeCompare(String(b.dealer.name)));

  return {
    rows: results,
    columns: buildColumnOrder(results),
  };
}

async function fetchMatrixChunkViaApi({
  from,
  to,
  pageTypeFilter,
  condition = 'BOTH',
  clientIds,
  onCancelCheck,
}) {
  if (onCancelCheck?.()) return [];
  if (typeof window === 'undefined') return [];

  const qs = new URLSearchParams({
    from,
    to,
    pageType: pageTypeFilter || 'ALL',
    condition: condition || 'BOTH',
  });
  for (const clientId of clientIds || []) {
    qs.append('clientId', clientId);
  }

  const res = await fetch(`/api/dashboard/all-dealers-channel-matrix?${qs}`, {
    credentials: 'same-origin',
  });
  const json = await res.json().catch(() => ({}));

  if (onCancelCheck?.()) return [];
  if (!res.ok) {
    throw new Error(json.error || `All-dealer matrix request failed (${res.status})`);
  }

  return json.data || [];
}

/**
 * On timeout, split the chunk in half instead of falling back to 1-by-1
 * (much faster recovery for large chunks).
 */
async function fetchChunkResilient({
  from,
  to,
  pageTypeFilter,
  condition = 'BOTH',
  clientIds,
  onCancelCheck,
  failedClientIds,
}) {
  if (!clientIds?.length) return [];

  try {
    return await fetchMatrixChunkViaApi({
      from,
      to,
      pageTypeFilter,
      condition,
      clientIds,
      onCancelCheck,
    });
  } catch (err) {
    if (onCancelCheck?.()) return [];
    if (clientIds.length === 1 || !isTimeoutError(err?.message)) {
      if (clientIds.length === 1) {
        failedClientIds.add(clientIds[0]);
      }
      throw err;
    }
  }

  const mid = Math.ceil(clientIds.length / 2);
  const left = clientIds.slice(0, mid);
  const right = clientIds.slice(mid);
  const rows = [];

  for (const part of [left, right]) {
    if (onCancelCheck?.() || !part.length) continue;
    try {
      const partRows = await fetchChunkResilient({
        from,
        to,
        pageTypeFilter,
        condition,
        clientIds: part,
        onCancelCheck,
        failedClientIds,
      });
      rows.push(...partRows);
    } catch {
      for (const id of part) failedClientIds.add(id);
    }
  }
  return rows;
}

async function runChunkPool(chunks, worker, concurrency, onCancelCheck) {
  const queue = [...chunks];
  const poolSize = Math.max(1, Math.min(concurrency, queue.length || 1));

  await Promise.all(
    Array.from({ length: poolSize }, async () => {
      while (queue.length > 0) {
        if (onCancelCheck?.()) return;
        const chunk = queue.shift();
        if (!chunk?.length) continue;
        await worker(chunk);
      }
    })
  );
}

/**
 * All-dealer channel matrix — parallel chunks from the start (no giant first RPC).
 * Does not stream partial UI updates (caller should render once when this resolves).
 */
export async function fetchAllDealersChannelMatrix({
  dealers,
  from,
  to,
  pageTypeFilter = 'ALL',
  condition = 'BOTH',
  onProgress,
  onCancelCheck,
}) {
  if (!dealers?.length || !from || !to) {
    return { rows: [], columns: [], warning: null };
  }

  const allIds = dealerClientIds(dealers);
  if (!allIds.length) {
    return { ...matrixFromRpcRows([], dealers), warning: null };
  }

  const failedClientIds = new Set();
  const chunkErrors = [];
  const chunks = chunkClientIds(dealers);
  const total = chunks.length;
  let completed = 0;
  const rpcRows = [];
  const conditionParam =
    condition === 'new' || condition === 'NEW'
      ? 'NEW'
      : condition === 'used' || condition === 'USED'
        ? 'USED'
        : 'BOTH';

  onProgress?.({ completed: 0, total });

  await runChunkPool(
    chunks,
    async (clientIds) => {
      try {
        const rows = await fetchChunkResilient({
          from,
          to,
          pageTypeFilter,
          condition: conditionParam,
          clientIds,
          onCancelCheck,
          failedClientIds,
        });

        if (onCancelCheck?.()) return;
        rpcRows.push(...rows);
      } catch (err) {
        if (onCancelCheck?.()) return;
        for (const clientId of clientIds) {
          failedClientIds.add(clientId);
        }
        chunkErrors.push(err?.message || 'Chunk failed');
      }

      completed += 1;
      onProgress?.({ completed, total });
    },
    CHUNK_CONCURRENCY,
    onCancelCheck
  );

  if (onCancelCheck?.()) return { rows: [], columns: [], warning: null };

  const result = matrixFromRpcRows(rpcRows, dealers, failedClientIds);

  if (failedClientIds.size > 0 || chunkErrors.length > 0) {
    if (rpcRows.length === 0) {
      throw new Error(
        chunkErrors[0] || 'Failed to load all-dealer channel matrix.'
      );
    }
    return {
      ...result,
      warning: `${failedClientIds.size} dealer(s) timed out — showing partial results. Try a shorter date range.`,
    };
  }

  return { ...result, warning: null };
}

export function compareLookupFromRows(compareRows) {
  const byDealer = new Map();
  for (const row of compareRows || []) {
    const clientId = String(row.dealer?.ga4CustomerId || '').trim();
    const configId = row.dealer?.id;
    const entry = {
      total: Number(row.total) || 0,
      channels: sliceMapForRow(row),
    };
    if (clientId) byDealer.set(`c:${clientId}`, entry);
    if (configId != null) byDealer.set(`i:${String(configId)}`, entry);
  }
  return byDealer;
}

export function compareEntryForDealer(lookup, dealer) {
  if (!lookup || !dealer) return null;
  const clientId = String(dealer.ga4CustomerId || '').trim();
  if (clientId && lookup.has(`c:${clientId}`)) {
    return lookup.get(`c:${clientId}`);
  }
  if (dealer.id != null && lookup.has(`i:${String(dealer.id)}`)) {
    return lookup.get(`i:${String(dealer.id)}`);
  }
  return null;
}

export function sliceMapForRow(row) {
  const map = new Map();
  for (const slice of row.slices || []) {
    map.set(slice.name, slice);
  }
  return map;
}
