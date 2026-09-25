import { UNMAPPED_ID, rawPairKey } from './defaults';

/**
 * Resolve display channel for a raw source/medium pair.
 * @param {Map<string,string>|Record<string,string>} mapping
 * @param {Array<{id:string,name:string,color:string}>} channels
 */
export function resolveMappedChannel(mapping, channels, rawSource, rawMedium) {
  const key = rawPairKey(rawSource, rawMedium);
  let channelId = UNMAPPED_ID;
  if (mapping instanceof Map) {
    channelId = mapping.get(key) || UNMAPPED_ID;
  } else if (mapping && typeof mapping === 'object') {
    channelId = mapping[key] || UNMAPPED_ID;
  }
  const ch =
    (channels || []).find((c) => c.id === channelId) ||
    (channels || []).find((c) => c.id === UNMAPPED_ID) ||
    { id: UNMAPPED_ID, name: 'Unmapped', color: '#94a3b8' };
  return ch;
}

/**
 * Aggregate raw source/medium traffic rows into named channels.
 * Input rows: { rawSource|raw_source, rawMedium|raw_medium, pageViews|page_views, vdpViews|vdp_views }
 * Output: [{ id, name, color, pageViews, vdpViews }]
 */
export function aggregateRawToChannels(rawRows, channels, mapping) {
  const byId = new Map();
  for (const ch of channels || []) {
    byId.set(ch.id, {
      id: ch.id,
      name: ch.name,
      color: ch.color,
      pageViews: 0,
      vdpViews: 0,
    });
  }

  for (const row of rawRows || []) {
    const source = row.rawSource ?? row.raw_source ?? '(direct)';
    const medium = row.rawMedium ?? row.raw_medium ?? '(none)';
    const ch = resolveMappedChannel(mapping, channels, source, medium);
    if (!byId.has(ch.id)) {
      byId.set(ch.id, {
        id: ch.id,
        name: ch.name,
        color: ch.color,
        pageViews: 0,
        vdpViews: 0,
      });
    }
    const bucket = byId.get(ch.id);
    bucket.pageViews += Number(row.pageViews ?? row.page_views) || 0;
    bucket.vdpViews += Number(row.vdpViews ?? row.vdp_views) || 0;
  }

  return [...byId.values()]
    .filter((r) => r.id !== UNMAPPED_ID || r.pageViews > 0 || r.vdpViews > 0)
    .filter((r) => r.pageViews > 0 || r.vdpViews > 0)
    .sort((a, b) => b.pageViews - a.pageViews || a.name.localeCompare(b.name));
}

/**
 * Roll matrix source/medium slices into mapped channel columns.
 * Input rpc rows: { client_id, dealer_name, raw_source, raw_medium, views }
 * Output same shape as channel matrix: { client_id, dealer_name, channel_bucket, views }
 */
export function mapSourceMediumMatrixRows(rpcRows, channels, mapping) {
  const totals = new Map(); // key: clientId|||channelName

  for (const row of rpcRows || []) {
    const clientId = String(row.client_id ?? '').trim();
    if (!clientId) continue;
    const ch = resolveMappedChannel(
      mapping,
      channels,
      row.raw_source,
      row.raw_medium
    );
    const key = `${clientId}|||${ch.name}`;
    const prev = totals.get(key);
    if (prev) {
      prev.views += Number(row.views) || 0;
    } else {
      totals.set(key, {
        client_id: clientId,
        dealer_name: row.dealer_name,
        channel_bucket: ch.name,
        views: Number(row.views) || 0,
        _color: ch.color,
      });
    }
  }

  return [...totals.values()].filter((r) => r.views > 0);
}

function normName(name) {
  return String(name ?? '')
    .toLowerCase()
    .replace(/[\s_-]+/g, '');
}

/**
 * Fast All Dealers path: MV rows are already GA4 channels.
 * Align column names/colors to Source Mapping channel defs when names match
 * (e.g. "Organic Search" → admin "Organic Search"). Unmatched stay as-is.
 */
export function mapGa4ChannelMatrixRows(rpcRows, channels) {
  const byNorm = new Map();
  for (const ch of channels || []) {
    if (!ch?.name || ch.id === UNMAPPED_ID) continue;
    byNorm.set(normName(ch.name), ch);
  }

  const totals = new Map();
  for (const row of rpcRows || []) {
    const clientId = String(row.client_id ?? '').trim();
    const rawBucket = String(row.channel_bucket || '(not set)');
    if (!clientId || !rawBucket) continue;

    const matched = byNorm.get(normName(rawBucket));
    const bucket = matched?.name || rawBucket;
    const key = `${clientId}|||${bucket}`;
    const prev = totals.get(key);
    const views = Number(row.views) || 0;
    if (prev) {
      prev.views += views;
    } else {
      totals.set(key, {
        client_id: clientId,
        dealer_name: row.dealer_name,
        channel_bucket: bucket,
        views,
        _color: matched?.color || null,
      });
    }
  }

  return [...totals.values()].filter((r) => r.views > 0);
}

/** Build Map rawPairKey → channelId from API mapping object or entries. */
export function toMappingMap(mapping) {
  if (mapping instanceof Map) return mapping;
  const map = new Map();
  if (Array.isArray(mapping)) {
    for (const e of mapping) {
      map.set(rawPairKey(e.rawSource ?? e.raw_source, e.rawMedium ?? e.raw_medium), e.channelId ?? e.channel_id);
    }
  } else if (mapping && typeof mapping === 'object') {
    for (const [k, v] of Object.entries(mapping)) {
      map.set(String(k).toLowerCase(), v);
    }
  }
  return map;
}
