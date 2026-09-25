export const DEFAULT_INVENTORY_FILTERS = {
  year: 'All',
  condition: 'All',
  make: 'All',
  model: 'All',
  type: 'All',
  location: 'All',
};

export const INVENTORY_CONDITION_OPTIONS = [
  { value: 'All', label: 'All Conditions' },
  { value: 'Used + New', label: 'Used + New' },
  { value: 'Used', label: 'Used' },
  { value: 'New', label: 'New' },
];

const STATIC_YEARS = ['2026', '2025', '2024', '2023', '2022', '2021', '2020'];
const STATIC_MAKES = [
  'Harley-Davidson',
  'Honda',
  'Toyota',
  'Ford',
  'Polaris',
  'Yamaha',
];
const STATIC_MODELS = [
  'Sportster',
  'Road Glide',
  'Civic',
  'F-150',
  'Ranger',
  'CRF',
];
const STATIC_LOCATIONS = ['Main Lot', 'Remote Lot', 'Showroom'];

export function normalizeInventoryFilters(input) {
  const merged = { ...DEFAULT_INVENTORY_FILTERS, ...(input || {}) };
  return { ...merged, year: 'All', model: 'All' };
}

export function inventoryFiltersActive(filters) {
  const f = normalizeInventoryFilters(filters);
  return (
    (f.condition !== 'All' && f.condition !== 'Used + New')
    || f.make !== 'All'
    || f.type !== 'All'
    || f.location !== 'All'
  );
}

export function toFilterOpts(values, allLabel) {
  return (values || ['All']).map((v) => ({
    value: v,
    label: v === 'All' ? allLabel : v,
  }));
}

/** Map inventory UI filters → con_inv_breakdown RPC params. */
export function inventoryFiltersToRpcParams(filters) {
  const f = normalizeInventoryFilters(filters);
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

export function buildInventoryFilterOptions(config = {}) {
  const typeList = config.types?.length ? config.types : [
    'Motorcycle',
    'ATV',
    'UTV',
    'Marine',
  ];

  return {
    years: ['All', ...STATIC_YEARS],
    makes: ['All', ...STATIC_MAKES],
    models: ['All', ...STATIC_MODELS],
    types: ['All', ...typeList],
    locations: ['All', ...STATIC_LOCATIONS],
  };
}

/** Map RPC filterOptions json → UI dropdown values (with leading All). */
export function filterOptionsFromRpc(rpcOptions) {
  if (!rpcOptions || typeof rpcOptions !== 'object') return null;

  const withAll = (values) => {
    const list = Array.isArray(values)
      ? values.map((v) => String(v)).filter(Boolean)
      : [];
    return ['All', ...list];
  };

  return {
    years: withAll(rpcOptions.years),
    makes: withAll(rpcOptions.makes),
    models: withAll(rpcOptions.models),
    types: withAll(rpcOptions.types),
    locations: withAll(rpcOptions.locations),
  };
}

export function mergeInventoryFilterOptions(rpcOptions, config = {}) {
  const fallback = buildInventoryFilterOptions(config);
  if (!rpcOptions) return fallback;

  const merge = (rpcList, fallbackList) => {
    const rpc = Array.isArray(rpcList) ? rpcList : [];
    if (rpc.length <= 1) return fallbackList;
    return rpc;
  };

  return {
    years: merge(rpcOptions.years, fallback.years),
    makes: merge(rpcOptions.makes, fallback.makes),
    models: merge(rpcOptions.models, fallback.models),
    types: merge(rpcOptions.types, fallback.types),
    locations: merge(rpcOptions.locations, fallback.locations),
  };
}
