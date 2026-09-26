import { JWT } from 'google-auth-library';
import { loadGcpServiceAccountCredentials } from '@/lib/pipeline/gcpCredentials';

const DEFAULT_PROPERTY_ID = '387861212';

/**
 * Normalize product labels for matching page titles ↔ GA4 itemName.
 * e.g. "Stay Ready Fiber Capsules | Pure for Men" → "stay ready fiber capsules"
 * Keeps region markers (uk/eu) so locales don't collapse into the US SKU.
 */
export function normalizeProductLabel(raw) {
  return String(raw || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s*\|\s*pure for men.*$/i, '')
    .replace(/\+/g, ' ')
    .replace(/['’]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
    // British/American spelling
    .replace(/\bfibre\b/g, 'fiber');
}

function pathHandle(pagePath) {
  const m = String(pagePath || '').match(/\/products\/([^/?#]+)/i);
  if (!m) return '';
  return normalizeProductLabel(decodeURIComponent(m[1]).replace(/[-_]+/g, ' '));
}

function findBestItemMatch(queryKey, itemMap) {
  if (!queryKey || !itemMap?.size) return null;
  const exact = itemMap.get(queryKey);
  if (exact) return exact;

  let best = null;
  let bestScore = 0;
  for (const [key, value] of itemMap.entries()) {
    if (!key) continue;
    let score = 0;
    if (key === queryKey) score = 100;
    else if (key.startsWith(queryKey) || queryKey.startsWith(key)) {
      const shorter = Math.min(key.length, queryKey.length);
      const longer = Math.max(key.length, queryKey.length);
      // Require strong prefix overlap (avoid "stay ready fiber" → capsules).
      if (shorter / longer >= 0.85) score = 80 + (shorter / longer) * 10;
    } else if (key.includes(queryKey) || queryKey.includes(key)) {
      const shorter = Math.min(key.length, queryKey.length);
      const longer = Math.max(key.length, queryKey.length);
      if (shorter / longer >= 0.9) score = 60 + (shorter / longer) * 10;
    }
    if (score > bestScore) {
      bestScore = score;
      best = value;
    }
  }
  return bestScore >= 60 ? best : null;
}

async function getGa4Token() {
  const credentials = loadGcpServiceAccountCredentials();
  const authClient = new JWT({
    email: credentials.client_email,
    key: credentials.private_key,
    scopes: ['https://www.googleapis.com/auth/analytics.readonly'],
  });
  const { token } = await authClient.getAccessToken();
  if (!token) throw new Error('Failed to get GA4 access token');
  return token;
}

/**
 * Pull item-scoped ecommerce for a date range.
 * Conversion = itemsPurchased (purchase key-event units).
 * Revenue = itemRevenue.
 */
export async function fetchGa4ItemEcommerce({
  from,
  to,
  propertyId = DEFAULT_PROPERTY_ID,
}) {
  const token = await getGa4Token();
  const prop = String(propertyId || DEFAULT_PROPERTY_ID).replace(
    /^properties\//,
    ''
  );

  const res = await fetch(
    `https://analyticsdata.googleapis.com/v1beta/properties/${prop}:runReport`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        dateRanges: [{ startDate: from, endDate: to }],
        dimensions: [{ name: 'itemName' }],
        metrics: [
          { name: 'itemsPurchased' },
          { name: 'itemRevenue' },
          { name: 'itemsViewed' },
        ],
        orderBys: [{ metric: { metricName: 'itemRevenue' }, desc: true }],
        limit: 10000,
      }),
    }
  );

  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      json?.error?.message || `GA4 item ecommerce failed (${res.status})`
    );
  }

  /** @type {Map<string, { conversions: number, revenue: number, itemsViewed: number, itemName: string }>} */
  const byName = new Map();

  for (const row of json.rows || []) {
    const itemName = row.dimensionValues?.[0]?.value || '';
    if (!itemName || itemName === '(not set)') continue;
    const conversions = Number(row.metricValues?.[0]?.value || 0) || 0;
    const revenue = Number(row.metricValues?.[1]?.value || 0) || 0;
    const itemsViewed = Number(row.metricValues?.[2]?.value || 0) || 0;
    const key = normalizeProductLabel(itemName);
    if (!key) continue;
    const prev = byName.get(key) || {
      conversions: 0,
      revenue: 0,
      itemsViewed: 0,
      itemName,
    };
    prev.conversions += conversions;
    prev.revenue += revenue;
    prev.itemsViewed += itemsViewed;
    byName.set(key, prev);
  }

  return byName;
}

function channelKey(raw) {
  return String(raw || '')
    .toLowerCase()
    .replace(/[\s_/-]+/g, '');
}

/**
 * Key events (conversions) by session default channel group.
 * Same grain as GA4 Traffic acquisition → Key events.
 */
export async function fetchGa4ChannelKeyEvents({
  from,
  to,
  propertyId = DEFAULT_PROPERTY_ID,
}) {
  const token = await getGa4Token();
  const prop = String(propertyId || DEFAULT_PROPERTY_ID).replace(
    /^properties\//,
    ''
  );

  async function run(metricName) {
    const res = await fetch(
      `https://analyticsdata.googleapis.com/v1beta/properties/${prop}:runReport`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          dateRanges: [{ startDate: from, endDate: to }],
          dimensions: [{ name: 'sessionDefaultChannelGroup' }],
          metrics: [{ name: metricName }],
          orderBys: [{ metric: { metricName }, desc: true }],
          limit: 100,
        }),
      }
    );
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(
        json?.error?.message ||
          `GA4 channel ${metricName} failed (${res.status})`
      );
    }
    return json;
  }

  let json;
  try {
    json = await run('keyEvents');
  } catch {
    json = await run('conversions');
  }

  /** @type {Map<string, number>} */
  const byChannel = new Map();
  for (const row of json.rows || []) {
    const name = row.dimensionValues?.[0]?.value || '(not set)';
    const value = Number(row.metricValues?.[0]?.value || 0) || 0;
    const key = channelKey(name);
    if (!key) continue;
    byChannel.set(key, (byChannel.get(key) || 0) + value);
  }
  return byChannel;
}

/**
 * Overlay GA4 key events onto product channel rows (matched by channel name).
 */
export function enrichChannelsWithKeyEvents(channels, keyEventMap) {
  if (!keyEventMap || keyEventMap.size === 0) {
    return (channels || []).map((c) => ({
      ...c,
      conversions: Number(c.conversions) || 0,
    }));
  }

  return (channels || []).map((c) => {
    const key = channelKey(c.channel_bucket);
    const hit = keyEventMap.get(key);
    return {
      ...c,
      conversions: hit != null ? hit : 0,
    };
  });
}

/**
 * Attach item ecommerce metrics onto product page rows.
 */
export function enrichProductsWithItemEcommerce(products, itemMap) {
  if (!itemMap || itemMap.size === 0) {
    return (products || []).map((p) => ({
      ...p,
      conversions: Number(p.conversions) || 0,
      revenue: Number(p.revenue) || 0,
    }));
  }

  return (products || []).map((p) => {
    const titleKey = normalizeProductLabel(p.pageTitle);
    const handleKey = pathHandle(p.pagePath);

    const hit =
      findBestItemMatch(titleKey, itemMap) ||
      findBestItemMatch(handleKey, itemMap);

    return {
      ...p,
      conversions: hit ? hit.conversions : 0,
      revenue: hit ? hit.revenue : 0,
      itemNameMatched: hit?.itemName || null,
    };
  });
}
