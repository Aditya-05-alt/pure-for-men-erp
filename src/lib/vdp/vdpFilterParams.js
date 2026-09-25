/** Default VDP tab inventory filters (All = no restriction). */
export const DEFAULT_VDP_FILTERS = {
  year: 'All',
  condition: 'All',
  make: 'All',
  model: 'All',
  type: 'All',
  location: 'All',
};

export function normalizeVdpFilters(input) {
  return { ...DEFAULT_VDP_FILTERS, ...(input || {}) };
}

function slugPart(value) {
  return encodeURIComponent(String(value)).replace(/%/g, '_').slice(0, 48);
}

/** Any non-default VDP inventory filter selected. */
export function vdpFiltersActive(vdpFilters, tab) {
  if (tab !== 'vdp') return false;
  const f = normalizeVdpFilters(vdpFilters);
  return (
    f.year !== 'All' ||
    (f.condition !== 'All' && f.condition !== 'Used + New') ||
    f.make !== 'All' ||
    f.model !== 'All' ||
    f.type !== 'All' ||
    f.location !== 'All'
  );
}

/**
 * Channel Breakdown: same filters as VDP except location (location blanks the GA4 join).
 * Make / model / type / year / condition still update channel totals.
 */
export function channelBreakdownVdpFilters(vdpFilters) {
  return {
    ...normalizeVdpFilters(vdpFilters),
    location: 'All',
  };
}

/** True when channel-relevant inventory filters are active (excludes location). */
export function channelFiltersActive(vdpFilters, tab) {
  if (tab !== 'vdp') return false;
  const f = channelBreakdownVdpFilters(vdpFilters);
  return (
    f.year !== 'All' ||
    (f.condition !== 'All' && f.condition !== 'Used + New') ||
    f.make !== 'All' ||
    f.model !== 'All' ||
    f.type !== 'All'
  );
}

/** Cache key for channel fetches — ignores location. */
export function channelFilterCacheSuffix(vdpFilters, tab) {
  return vdpFilterCacheSuffix(channelBreakdownVdpFilters(vdpFilters), tab);
}

/** Map UI filters → Supabase RPC params (VDP tab only). */
export function vdpFiltersToRpcParams(vdpFilters, tab) {
  if (tab !== 'vdp') return {};
  const f = normalizeVdpFilters(vdpFilters);
  const params = { p_condition: 'BOTH' };

  if (f.year && f.year !== 'All') {
    const y = parseInt(String(f.year), 10);
    if (Number.isFinite(y) && y >= 1900 && y <= 2100) params.p_years = [y];
  }
  if (f.make && f.make !== 'All') params.p_makes = [f.make];
  if (f.model && f.model !== 'All') params.p_models = [f.model];
  if (f.type && f.type !== 'All') params.p_types = [f.type];
  if (f.location && f.location !== 'All') params.p_locations = [f.location];

  if (f.condition === 'Used') params.p_condition = 'USED';
  else if (f.condition === 'New') params.p_condition = 'NEW';
  else params.p_condition = 'BOTH';

  return params;
}

/** Backward-compatible alias. */
export function vdpRpcExtraParams(vdpFilters, tab) {
  return vdpFiltersToRpcParams(vdpFilters, tab);
}

export function vdpFilterCacheSuffix(vdpFilters, tab) {
  if (tab !== 'vdp') return '';
  const f = normalizeVdpFilters(vdpFilters);
  const parts = [];
  if (f.year !== 'All') parts.push(`y${f.year}`);
  if (f.condition !== 'All' && f.condition !== 'Used + New') {
    parts.push(`c${slugPart(f.condition)}`);
  }
  if (f.make !== 'All') parts.push(`mk${slugPart(f.make)}`);
  if (f.model !== 'All') parts.push(`md${slugPart(f.model)}`);
  if (f.type !== 'All') parts.push(`t${slugPart(f.type)}`);
  if (f.location !== 'All') parts.push(`l${slugPart(f.location)}`);
  return parts.length ? `|${parts.join('-')}` : '';
}

/** @deprecated use vdpFilterCacheSuffix */
export function yearFilterCacheSuffix(vdpFilters, tab) {
  return vdpFilterCacheSuffix(vdpFilters, tab);
}

export function appendInvParamsToSearchParams(searchParams, inv) {
  if (!inv) return;
  if (inv.p_years?.length) searchParams.set('years', inv.p_years.join(','));
  if (inv.p_makes?.length) searchParams.set('makes', inv.p_makes.join(','));
  if (inv.p_models?.length) searchParams.set('models', inv.p_models.join(','));
  if (inv.p_types?.length) searchParams.set('types', inv.p_types.join(','));
  if (inv.p_locations?.length) searchParams.set('locations', inv.p_locations.join(','));
  if (inv.p_condition && inv.p_condition !== 'BOTH') {
    searchParams.set('condition', inv.p_condition);
  }
}

export function appendVdpFiltersToSearchParams(searchParams, vdpFilters, tab) {
  appendInvParamsToSearchParams(searchParams, vdpFiltersToRpcParams(vdpFilters, tab));
}

export function parseVdpFiltersFromSearchParams(searchParams) {
  const parseList = (key) => {
    const raw = searchParams.get(key)?.trim();
    if (!raw) return null;
    return raw.split(',').map((s) => s.trim()).filter(Boolean);
  };

  const years = parseList('years');
  const makes = parseList('makes');
  const models = parseList('models');
  const types = parseList('types');
  const locations = parseList('locations');
  const condition = searchParams.get('condition')?.trim()?.toUpperCase();

  const filters = { ...DEFAULT_VDP_FILTERS };
  if (years?.length) filters.year = String(years[0]);
  if (makes?.length) filters.make = makes[0];
  if (models?.length) filters.model = models[0];
  if (types?.length) filters.type = types[0];
  if (locations?.length) filters.location = locations[0];
  if (condition === 'USED') filters.condition = 'Used';
  else if (condition === 'NEW') filters.condition = 'New';

  return filters;
}

export function parseInvRpcFromSearchParams(searchParams) {
  const years = searchParams.get('years')?.trim();
  const makes = searchParams.get('makes')?.trim();
  const models = searchParams.get('models')?.trim();
  const types = searchParams.get('types')?.trim();
  const locations = searchParams.get('locations')?.trim();
  const condition = searchParams.get('condition')?.trim()?.toUpperCase();

  return {
    ...(years
      ? { p_years: years.split(',').map((y) => parseInt(y, 10)).filter(Number.isFinite) }
      : {}),
    ...(makes ? { p_makes: makes.split(',').map((s) => s.trim()).filter(Boolean) } : {}),
    ...(models ? { p_models: models.split(',').map((s) => s.trim()).filter(Boolean) } : {}),
    ...(types ? { p_types: types.split(',').map((s) => s.trim()).filter(Boolean) } : {}),
    ...(locations
      ? { p_locations: locations.split(',').map((s) => s.trim()).filter(Boolean) }
      : {}),
    ...(condition && condition !== 'BOTH' ? { p_condition: condition } : { p_condition: 'BOTH' }),
  };
}
