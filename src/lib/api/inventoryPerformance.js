function vehicleKey(row) {
  const vin = String(row.inv_vin || '').trim();
  if (vin) return `vin:${vin.toLowerCase()}`;
  const stock = String(row.inv_stock_number || '').trim();
  if (stock) return `s:${stock.toLowerCase()}`;
  return [
    'v',
    String(row.inv_year || '').trim(),
    String(row.inv_make || '').trim().toLowerCase(),
    String(row.inv_model || '').trim().toLowerCase(),
    String(row.inv_condition || '').trim().toLowerCase(),
  ].join('|');
}

function normalizeRow(row) {
  const vin = String(row.inv_vin || '').trim();
  const stock = String(row.inv_stock_number || '').trim();
  const displayVin = vin || stock || '—';
  const channelViews =
    row.channel_views && typeof row.channel_views === 'object'
      ? Object.fromEntries(
          Object.entries(row.channel_views).map(([k, v]) => [
            k,
            Number(v) || 0,
          ])
        )
      : {};
  return {
    vin: displayVin,
    stock: stock || null,
    make: row.inv_make || 'Unknown',
    model: row.inv_model || 'Unknown',
    year: row.inv_year || '—',
    condition: row.inv_condition || 'Unknown',
    category: row.inv_category || 'Unknown',
    views: Number(row.views) || 0,
    uniqueViews: Number(row.unique_views) || 0,
    ageDays:
      row.age_days == null || Number.isNaN(Number(row.age_days))
        ? null
        : Number(row.age_days),
    channelViews,
    _key: vehicleKey(row),
  };
}

function csvList(value) {
  if (Array.isArray(value)) {
    return value.map((v) => String(v || '').trim()).filter(Boolean);
  }
  const s = String(value || '').trim();
  if (!s || s.toLowerCase() === 'all') return [];
  return s
    .split(',')
    .map((v) => v.trim())
    .filter((v) => v && v.toLowerCase() !== 'all');
}

function csvParam(value) {
  const parts = csvList(value);
  return parts.length ? parts.join(',') : '';
}

function channelLookupKeys(vin, stock) {
  const keys = [];
  const v = String(vin || '')
    .trim()
    .toUpperCase();
  const s = String(stock || '')
    .trim()
    .toUpperCase();
  if (v && v !== '—' && v !== 'UNASSIGNED') keys.push(v);
  if (s && s !== v) keys.push(s);
  return keys;
}

function applyPriorMoM(rows, prior) {
  const priorMap = new Map();
  for (const row of prior || []) {
    priorMap.set(row._key, row);
  }
  return (rows || []).map((row) => {
    const prev = priorMap.get(row._key);
    const vdp0 = prev?.views || 0;
    const vdp1 = row.vdp1 ?? row.views ?? 0;
    return {
      ...row,
      vdp1,
      vdp0,
      vdpmom: vdp0 > 0 ? ((vdp1 - vdp0) / vdp0) * 100 : vdp1 > 0 ? 100 : 0,
    };
  });
}

function attachChannelsToRows(rows, byVk) {
  if (!byVk?.size) return rows;
  return (rows || []).map((r) => {
    let channelViews = r.channelViews || {};
    for (const key of channelLookupKeys(r.vin, r.stock)) {
      if (byVk.has(key)) {
        channelViews = byVk.get(key) || {};
        break;
      }
    }
    return { ...r, channelViews };
  });
}

async function fetchPeriod({
  clientId,
  from,
  to,
  make,
  condition,
  category,
  search,
  channel,
  lite = false,
  channelsOnly = false,
  onCancelCheck,
  signal,
  timeoutMs = 0,
}) {
  const qs = new URLSearchParams({
    clientId: String(clientId).trim(),
    from: String(from).slice(0, 10),
    to: String(to).slice(0, 10),
  });
  const makeCsv = csvParam(make);
  const condCsv = csvParam(condition);
  const catCsv = csvParam(category);
  const channelCsv = csvParam(channel);
  if (makeCsv) qs.set('make', makeCsv);
  if (condCsv) qs.set('condition', condCsv);
  if (catCsv) qs.set('category', catCsv);
  if (search) qs.set('search', search);
  if (channelCsv) qs.set('channel', channelCsv);
  if (lite) qs.set('lite', '1');
  if (channelsOnly) qs.set('channelsOnly', '1');

  const ctrl = new AbortController();
  const onAbort = () => ctrl.abort();
  if (signal) {
    if (signal.aborted) ctrl.abort();
    else signal.addEventListener('abort', onAbort, { once: true });
  }
  const timer =
    timeoutMs > 0
      ? setTimeout(() => ctrl.abort(), timeoutMs)
      : null;

  try {
    const res = await fetch(`/api/dashboard/inventory-performance?${qs}`, {
      credentials: 'same-origin',
      signal: ctrl.signal,
    });
    const json = await res.json().catch(() => ({}));
    if (onCancelCheck?.()) return { rows: [], channels: [] };
    if (!res.ok) {
      throw new Error(json.error || `Inventory performance failed (${res.status})`);
    }
    return {
      rows: (json.rows || []).map(normalizeRow),
      channels: Array.isArray(json.channels) ? json.channels : [],
      channelColumns: Array.isArray(json.channelColumns) ? json.channelColumns : [],
      channelMatrix: Array.isArray(json.channelMatrix) ? json.channelMatrix : [],
    };
  } finally {
    if (timer) clearTimeout(timer);
    if (signal) signal.removeEventListener('abort', onAbort);
  }
}

function mapRowsWithPrior(current, prior) {
  const priorMap = new Map();
  for (const row of prior || []) {
    priorMap.set(row._key, row);
  }

  return (current || []).map((row) => {
    const prev = priorMap.get(row._key);
    const vdp0 = prev?.views || 0;
    const vdp1 = row.views;
    return {
      vin: row.vin || row.stock || '—',
      stock: row.stock || null,
      make: row.make,
      model: row.model,
      year: row.year,
      age: row.ageDays == null ? null : row.ageDays,
      condition: row.condition,
      category: row.category,
      vdp1,
      vdp0,
      vdpmom: vdp0 > 0 ? ((vdp1 - vdp0) / vdp0) * 100 : vdp1 > 0 ? 100 : 0,
      uniq1: row.uniqueViews,
      channelViews: row.channelViews || {},
      _key: row._key,
    };
  });
}

function optionLists(rows) {
  const makes = [
    ...new Set((rows || []).map((r) => r.make).filter(Boolean)),
  ].sort((a, b) => a.localeCompare(b));
  const categories = [
    ...new Set((rows || []).map((r) => r.category).filter(Boolean)),
  ].sort((a, b) => a.localeCompare(b));
  return { makes, categories };
}

/**
 * Inventory performance — loads inventory, compare, and channels.
 * onProgress reports stage completion; await resolves when every part is done.
 */
export async function fetchInventoryPerformance({
  clientId,
  from,
  to,
  priorFrom,
  priorTo,
  make = [],
  condition = [],
  category = [],
  search = '',
  channel = [],
  onCancelCheck,
  onCoreReady,
  onUpdate,
  onProgress,
}) {
  if (!clientId || !from || !to) {
    return { rows: [], makes: [], categories: [], channels: [], channelColumns: [] };
  }
  if (typeof window === 'undefined') {
    return { rows: [], makes: [], categories: [], channels: [], channelColumns: [] };
  }
  if (onCancelCheck?.()) {
    return { rows: [], makes: [], categories: [], channels: [], channelColumns: [] };
  }

  const filterOpts = { make, condition, category, search, channel };
  const needUnfiltered =
    csvList(make).length ||
    csvList(category).length ||
    csvList(condition).length ||
    search ||
    csvList(channel).length;

  const hasPrior = Boolean(priorFrom && priorTo);
  const totalSteps = 1 + (hasPrior ? 1 : 0) + (needUnfiltered ? 1 : 0) + 1;
  let completedSteps = 0;
  const reportProgress = (stage) => {
    onProgress?.({
      completed: completedSteps,
      total: totalSteps,
      stage,
      percent: Math.round((completedSteps / totalSteps) * 100),
    });
  };

  reportProgress('inventory');

  // Lite core first (views only) so large dealers unlock before age/channels.
  const currentRes = await fetchPeriod({
    clientId,
    from,
    to,
    ...filterOpts,
    lite: true,
    onCancelCheck,
  });
  if (onCancelCheck?.()) {
    return { rows: [], makes: [], categories: [], channels: [], channelColumns: [] };
  }

  let rows = mapRowsWithPrior(currentRes.rows || [], []);
  let { makes, categories } = optionLists(currentRes.rows || []);

  const corePayload = {
    rows,
    makes,
    categories,
    channels: [],
    channelColumns: [],
  };
  completedSteps = 1;
  reportProgress('inventory');
  onCoreReady?.(corePayload);
  onUpdate?.(corePayload);

  const bg = [];

  // Age fills in behind the first paint (same endpoint without lite/channelsOnly).
  bg.push(
    fetchPeriod({
      clientId,
      from,
      to,
      ...filterOpts,
      onCancelCheck,
      timeoutMs: 25000,
    })
      .then((agedRes) => {
        if (onCancelCheck?.()) return;
        const ageByKey = new Map();
        for (const r of agedRes.rows || []) {
          if (r.ageDays == null) continue;
          ageByKey.set(r._key, r.ageDays);
        }
        if (!ageByKey.size) return;
        rows = rows.map((r) => {
          const age = ageByKey.get(r._key);
          return age == null ? r : { ...r, age };
        });
        onUpdate?.({
          rows,
          makes,
          categories,
          channels: corePayload.channels,
          channelColumns: corePayload.channelColumns,
        });
      })
      .catch(() => {})
  );

  if (hasPrior) {
    bg.push(
      fetchPeriod({
        clientId,
        from: priorFrom,
        to: priorTo,
        ...filterOpts,
        lite: true,
        onCancelCheck,
      }).then((priorRes) => {
        if (onCancelCheck?.()) return;
        rows = applyPriorMoM(rows, priorRes.rows || []);
        completedSteps += 1;
        reportProgress('compare');
        onUpdate?.({
          rows,
          makes,
          categories,
          channels: corePayload.channels,
          channelColumns: corePayload.channelColumns,
        });
      })
    );
  }

  if (needUnfiltered) {
    bg.push(
      fetchPeriod({
        clientId,
        from,
        to,
        make: [],
        condition: [],
        category: [],
        search: '',
        channel: [],
        lite: true,
        onCancelCheck,
      }).then((unfilteredRes) => {
        if (onCancelCheck?.()) return;
        const opts = optionLists(unfilteredRes.rows || []);
        makes = opts.makes;
        categories = opts.categories;
        completedSteps += 1;
        reportProgress('filters');
        onUpdate?.({
          rows,
          makes,
          categories,
          channels: corePayload.channels,
          channelColumns: corePayload.channelColumns,
        });
      })
    );
  }

  bg.push(
    fetchPeriod({
      clientId,
      from,
      to,
      ...filterOpts,
      channelsOnly: true,
      onCancelCheck,
      // Day-chunked channel path usually finishes in a few seconds; abort if hung.
      timeoutMs: 45000,
    })
      .then((chRes) => {
        if (onCancelCheck?.()) return;
        const channels = chRes.channels || [];
        const channelColumns = chRes.channelColumns || [];
        corePayload.channels = channels;
        corePayload.channelColumns = channelColumns;
        const byVk = new Map();
        for (const m of chRes.channelMatrix || []) {
          const views = m.channel_views || {};
          const vk = String(m.vk || '').trim().toUpperCase();
          if (vk) byVk.set(vk, views);
        }
        rows = attachChannelsToRows(rows, byVk);
        completedSteps += 1;
        reportProgress('channels');
        onUpdate?.({ rows, makes, categories, channels, channelColumns });
      })
      .catch(() => {
        completedSteps += 1;
        reportProgress('channels');
      })
  );

  await Promise.allSettled(bg);
  if (onCancelCheck?.()) {
    return { rows: [], makes: [], categories: [], channels: [], channelColumns: [] };
  }

  completedSteps = totalSteps;
  reportProgress('done');

  return {
    rows,
    makes,
    categories,
    channels: corePayload.channels,
    channelColumns: corePayload.channelColumns,
  };
}
