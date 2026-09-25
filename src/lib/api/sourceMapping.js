import {
  defaultChannels,
  defaultMappingEntries,
  rawPairKey,
} from '@/lib/sourceMapping/defaults';

let cache = { at: 0, data: null };
const TTL_MS = 30_000;

export async function fetchSourceMapping({ force = false } = {}) {
  if (typeof window === 'undefined') {
    return {
      channels: defaultChannels(),
      mapping: Object.fromEntries(
        defaultMappingEntries().map((e) => [
          rawPairKey(e.rawSource, e.rawMedium),
          e.channelId,
        ])
      ),
      rules: defaultMappingEntries(),
    };
  }

  if (!force && cache.data && Date.now() - cache.at < TTL_MS) {
    return cache.data;
  }

  const res = await fetch('/api/dashboard/source-mapping', {
    credentials: 'same-origin',
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const fallback = {
      channels: defaultChannels(),
      mapping: Object.fromEntries(
        defaultMappingEntries().map((e) => [
          rawPairKey(e.rawSource, e.rawMedium),
          e.channelId,
        ])
      ),
      rules: defaultMappingEntries(),
    };
    cache = { at: Date.now(), data: fallback };
    return fallback;
  }

  const data = {
    channels: json.channels || defaultChannels(),
    mapping: json.mapping || {},
    rules: json.rules || [],
  };
  cache = { at: Date.now(), data };
  return data;
}

export function invalidateSourceMappingCache() {
  cache = { at: 0, data: null };
}
