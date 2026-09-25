'use client';

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useMemo,
  useEffect,
} from 'react';
import { CATEGORIES } from '@/lib/data/categories';
import { createClient } from '@/lib/supabase/client';
import {
  readStoredDealerId,
  resolveDealerFromList,
  writeStoredDealerId,
} from '@/lib/dashboard/dashboardPrefs';
import { ALL_DEALER_CLIENT, isAllDealerClient } from '@/lib/dashboard/allDealers';
import { DEFAULT_ACCESS } from '@/lib/access/permissions';
import {
  DEALER_CATEGORY_OPTIONS,
  normalizeDealerCategory,
} from '@/lib/dealers/fields';

const ClientContext = createContext(null);

const FALLBACK_CATEGORY = 'rv';
const DEALER_CATEGORY_FILTER_KEY = 'sa_dealer_category_filter';

function readStoredCategoryFilter() {
  if (typeof window === 'undefined') return '';
  try {
    const raw = localStorage.getItem(DEALER_CATEGORY_FILTER_KEY) || '';
    return normalizeDealerCategory(raw) || '';
  } catch {
    return '';
  }
}

function writeStoredCategoryFilter(value) {
  if (typeof window === 'undefined') return;
  try {
    if (!value) {
      localStorage.removeItem(DEALER_CATEGORY_FILTER_KEY);
      return;
    }
    localStorage.setItem(DEALER_CATEGORY_FILTER_KEY, value);
  } catch {
    /* ignore */
  }
}

function normalizeRow(row) {
  return {
    id: row.id,
    name: row.customer_name || 'Unnamed dealer',
    hootId: row.hoot_id || null,
    hootUrl: row.hoot_url || null,
    ga4CustomerId: row.ga4_customer_id || null,
    websitePlatform: row.website_platform || null,
    dealerCategory: normalizeDealerCategory(row.dealer_category),
    isActive: row.is_active !== false,
    showAllDealersVdp: row.show_all_dealers_vdp !== false,
    showAllDealersAll: row.show_all_dealers_all !== false,
    showAllDealersSrp: row.show_all_dealers_srp !== false,
    category: FALLBACK_CATEGORY,
  };
}

function filterDealersByCategory(dealers, categoryFilter) {
  if (!categoryFilter) return dealers;
  return dealers.filter((d) => d.dealerCategory === categoryFilter);
}

export function ClientProvider({ children }) {
  const [allDealers, setAllDealers] = useState([]);
  const [dealerCategoryFilter, setDealerCategoryFilterState] = useState('');
  const [client, setClient] = useState(ALL_DEALER_CLIENT);
  const [access, setAccess] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [categoryFilterReady, setCategoryFilterReady] = useState(false);

  useEffect(() => {
    setDealerCategoryFilterState(readStoredCategoryFilter());
    setCategoryFilterReady(true);
  }, []);

  const setDealerCategoryFilter = useCallback((value) => {
    const next = normalizeDealerCategory(value) || '';
    setDealerCategoryFilterState(next);
    writeStoredCategoryFilter(next);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadDealers() {
      let resolvedAccess = DEFAULT_ACCESS;
      try {
        const accessResponse = await fetch('/api/auth/access', {
          credentials: 'same-origin',
        });
        const accessJson = await accessResponse.json();
        if (accessResponse.ok && accessJson?.access) {
          resolvedAccess = accessJson.access;
        }
      } catch {
        // Preserve legacy full access if the access endpoint is unavailable.
      }
      if (!cancelled) setAccess(resolvedAccess);

      const supabase = createClient();
      if (!supabase) {
        if (!cancelled) {
          setError('Supabase is not configured.');
          setLoading(false);
        }
        return;
      }

      let dealerQuery = supabase
        .from('smart_hoot_config')
        .select(
          'id, customer_name, hoot_id, hoot_url, ga4_customer_id, website_platform, dealer_category, is_active, show_all_dealers_vdp, show_all_dealers_all, show_all_dealers_srp'
        )
        .eq('is_active', true)
        .order('customer_name', { ascending: true });

      if (resolvedAccess.role === 'user' && !resolvedAccess.allDealers) {
        if (!resolvedAccess.dealerIds.length) {
          if (!cancelled) {
            setAllDealers([]);
            setLoading(false);
          }
          return;
        }
        dealerQuery = dealerQuery.in('id', resolvedAccess.dealerIds);
      }

      const { data, error: fetchError } = await dealerQuery;

      if (cancelled) return;

      if (fetchError) {
        setError(fetchError.message);
        setLoading(false);
        return;
      }

      const list = (data || [])
        .filter((r) => r && r.customer_name)
        .map(normalizeRow);

      setAllDealers(list);
      setLoading(false);
    }

    loadDealers();
    return () => {
      cancelled = true;
    };
  }, []);

  const dealers = useMemo(
    () => filterDealersByCategory(allDealers, dealerCategoryFilter),
    [allDealers, dealerCategoryFilter]
  );

  const canUseAllDealers = access?.role !== 'user' || Boolean(access?.allDealers);

  useEffect(() => {
    if (!categoryFilterReady || loading) return;
    if (!allDealers.length) {
      setClient(ALL_DEALER_CLIENT);
      return;
    }

    const storedId = readStoredDealerId();
    let resolved = resolveDealerFromList(dealers, storedId);

    if (canUseAllDealers === false && isAllDealerClient(resolved)) {
      resolved = dealers[0] || allDealers[0] || ALL_DEALER_CLIENT;
    }

    // Selected single dealer left the active category — fall back.
    if (
      !isAllDealerClient(resolved) &&
      dealers.length > 0 &&
      !dealers.some((d) => String(d.id) === String(resolved.id))
    ) {
      resolved = canUseAllDealers
        ? ALL_DEALER_CLIENT
        : dealers[0] || ALL_DEALER_CLIENT;
    }

    setClient((prev) => {
      if (
        prev &&
        resolved &&
        String(prev.id) === String(resolved.id) &&
        String(prev.ga4CustomerId || '') === String(resolved.ga4CustomerId || '')
      ) {
        return prev;
      }
      return resolved;
    });
  }, [
    allDealers,
    dealers,
    access,
    canUseAllDealers,
    loading,
    categoryFilterReady,
  ]);

  const pickClient = useCallback((c) => {
    setClient(c);
    if (c?.id != null) writeStoredDealerId(c.id);
  }, []);

  const isAllDealer = isAllDealerClient(client);

  const config = useMemo(() => {
    const key = client?.category || FALLBACK_CATEGORY;
    return CATEGORIES[key] || CATEGORIES.rv;
  }, [client]);

  const value = useMemo(
    () => ({
      client,
      config,
      pickClient,
      dealers,
      allDealers,
      dealerCategoryFilter,
      setDealerCategoryFilter,
      dealerCategoryOptions: DEALER_CATEGORY_OPTIONS,
      loading,
      error,
      access,
      accessLoading: access == null,
      canUseAllDealers,
      isAllDealer,
      allDealerClient: ALL_DEALER_CLIENT,
    }),
    [
      client,
      config,
      pickClient,
      dealers,
      allDealers,
      dealerCategoryFilter,
      setDealerCategoryFilter,
      loading,
      error,
      access,
      canUseAllDealers,
      isAllDealer,
    ]
  );

  return <ClientContext.Provider value={value}>{children}</ClientContext.Provider>;
}

export function useClient() {
  const ctx = useContext(ClientContext);
  if (!ctx) throw new Error('useClient must be used inside <ClientProvider>');
  return ctx;
}
