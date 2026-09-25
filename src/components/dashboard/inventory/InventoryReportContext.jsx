'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { useClient } from '@/components/dashboard/ClientContext';
import {
  fetchInventoryReport,
  inventoryReportExcludesAllDealers,
  isInventoryReportRefreshing,
  resolveInventoryReportClientId,
} from '@/lib/inventory/inventoryReport';
import {
  DEFAULT_INVENTORY_FILTERS,
  mergeInventoryFilterOptions,
  normalizeInventoryFilters,
} from '@/lib/inventory/inventoryReportFilters';
import {
  defaultInventoryCompareDate,
  defaultInventoryReportDate,
  formatInventoryDateLabel,
  normalizeInventoryReportDate,
  readStoredInventoryCompareDate,
  readStoredInventoryCompareEnabled,
  resolveInventoryReportDateOnLoad,
  writeStoredInventoryCompareDate,
  writeStoredInventoryCompareEnabled,
  writeStoredInventoryReportDate,
} from '@/lib/inventory/inventoryReportPrefs';

const InventoryReportContext = createContext(null);

export function InventoryReportProvider({ children }) {
  const { client, config, dealers, pickClient, isAllDealer } = useClient();

  const [reportDate, setReportDateState] = useState(
    () => resolveInventoryReportDateOnLoad(),
  );
  const [compareEnabled, setCompareEnabledState] = useState(
    () => readStoredInventoryCompareEnabled(),
  );
  const [compareDate, setCompareDateState] = useState(() => {
    const primary = resolveInventoryReportDateOnLoad();
    return readStoredInventoryCompareDate() || defaultInventoryCompareDate(primary);
  });
  const [filters, setFiltersState] = useState(DEFAULT_INVENTORY_FILTERS);
  const [sections, setSections] = useState(null);
  const [compareSections, setCompareSections] = useState(null);
  const [inventoryList, setInventoryList] = useState(null);
  const [compareInventoryList, setCompareInventoryList] = useState(null);
  const [rpcFilterOptions, setRpcFilterOptions] = useState(null);
  const [meta, setMeta] = useState(null);
  const [compareMeta, setCompareMeta] = useState(null);
  const [error, setError] = useState(null);
  const [compareError, setCompareError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [compareLoading, setCompareLoading] = useState(false);
  const [hasDisplayedReport, setHasDisplayedReport] = useState(false);
  const [hasDisplayedCompare, setHasDisplayedCompare] = useState(false);

  const updating = isInventoryReportRefreshing(loading, hasDisplayedReport);
  const compareUpdating = isInventoryReportRefreshing(
    compareLoading,
    hasDisplayedCompare,
  );

  const setReportDate = useCallback((next) => {
    const normalized = normalizeInventoryReportDate(next);
    setReportDateState(normalized);
    writeStoredInventoryReportDate(normalized);
  }, []);

  const setCompareDate = useCallback((next) => {
    const normalized = normalizeInventoryReportDate(next);
    setCompareDateState(normalized);
    writeStoredInventoryCompareDate(normalized);
  }, []);

  const setCompareEnabled = useCallback((enabled) => {
    setCompareEnabledState(enabled);
    writeStoredInventoryCompareEnabled(enabled);
  }, []);

  const toggleCompareEnabled = useCallback(() => {
    setCompareEnabledState((prev) => {
      const next = !prev;
      writeStoredInventoryCompareEnabled(next);
      return next;
    });
  }, []);

  const setFilter = useCallback((key, value) => {
    setFiltersState((prev) => ({ ...prev, [key]: value }));
  }, []);

  const clearFilters = useCallback(() => {
    setFiltersState(DEFAULT_INVENTORY_FILTERS);
  }, []);

  const filterOptions = useMemo(
    () => mergeInventoryFilterOptions(rpcFilterOptions, config),
    [rpcFilterOptions, config],
  );

  const clientId = useMemo(
    () => resolveInventoryReportClientId(client, dealers),
    [client, dealers],
  );

  const normalizedFilters = useMemo(
    () => normalizeInventoryFilters(filters),
    [filters],
  );

  const reportDateLabel = useMemo(
    () => formatInventoryDateLabel(reportDate),
    [reportDate],
  );

  const compareDateLabel = useMemo(
    () => formatInventoryDateLabel(compareDate),
    [compareDate],
  );

  useEffect(() => {
    if (!inventoryReportExcludesAllDealers() || !isAllDealer) return;
    const first = dealers.find((d) => d?.id);
    if (first) pickClient(first);
  }, [isAllDealer, dealers, pickClient]);

  useEffect(() => {
    const today = defaultInventoryReportDate();
    let sessionDate = null;
    try {
      sessionDate = sessionStorage.getItem('sa_inventory_report_date_session');
    } catch {
      sessionDate = null;
    }

    if (!sessionDate) {
      setReportDateState(today);
      writeStoredInventoryReportDate(today);
      const nextCompare = defaultInventoryCompareDate(today);
      setCompareDateState(nextCompare);
      writeStoredInventoryCompareDate(nextCompare);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetchInventoryReport({
      clientId,
      reportDate,
      filters: normalizedFilters,
    })
      .then((result) => {
        if (cancelled) return;
        if (result.ready) {
          setSections(result.sections ?? {});
          setInventoryList(result.inventoryList ?? null);
          setRpcFilterOptions(result.filterOptions ?? null);
          setMeta(result.meta ?? null);
          setHasDisplayedReport(true);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err?.message || 'Failed to load inventory report.');
          setSections({});
          setInventoryList({ rows: [], totalUnits: 0, totalValue: 0, averagePrice: 0 });
          setRpcFilterOptions(null);
          setMeta(null);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [clientId, reportDate, normalizedFilters]);

  useEffect(() => {
    if (!compareEnabled) {
      setCompareSections(null);
      setCompareInventoryList(null);
      setCompareMeta(null);
      setCompareError(null);
      setCompareLoading(false);
      return undefined;
    }

    let cancelled = false;
    setCompareLoading(true);
    setCompareError(null);

    fetchInventoryReport({
      clientId,
      reportDate: compareDate,
      filters: normalizedFilters,
    })
      .then((result) => {
        if (cancelled) return;
        if (result.ready) {
          setCompareSections(result.sections ?? {});
          setCompareInventoryList(result.inventoryList ?? null);
          setCompareMeta(result.meta ?? null);
          setHasDisplayedCompare(true);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setCompareError(err?.message || 'Failed to load compare inventory report.');
          setCompareSections({});
          setCompareInventoryList({ rows: [], totalUnits: 0, totalValue: 0, averagePrice: 0 });
          setCompareMeta(null);
        }
      })
      .finally(() => {
        if (!cancelled) setCompareLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [clientId, compareDate, normalizedFilters, compareEnabled]);

  const value = useMemo(
    () => ({
      reportDate,
      setReportDate,
      compareEnabled,
      setCompareEnabled,
      toggleCompareEnabled,
      compareDate,
      setCompareDate,
      reportDateLabel,
      compareDateLabel,
      filters,
      setFilter,
      clearFilters,
      filterOptions,
      sections,
      compareSections,
      inventoryList,
      compareInventoryList,
      meta,
      compareMeta,
      error,
      compareError,
      loading,
      compareLoading,
      updating,
      compareUpdating,
      showLocationFilter: config?.showLoc !== false,
      typeHeader: config?.typeH || 'Type',
    }),
    [
      reportDate,
      setReportDate,
      compareEnabled,
      setCompareEnabled,
      toggleCompareEnabled,
      compareDate,
      setCompareDate,
      reportDateLabel,
      compareDateLabel,
      filters,
      setFilter,
      clearFilters,
      filterOptions,
      sections,
      compareSections,
      inventoryList,
      compareInventoryList,
      meta,
      compareMeta,
      error,
      compareError,
      loading,
      compareLoading,
      updating,
      compareUpdating,
      config,
    ],
  );

  return (
    <InventoryReportContext.Provider value={value}>
      {children}
    </InventoryReportContext.Provider>
  );
}

export function useInventoryReport() {
  const ctx = useContext(InventoryReportContext);
  if (!ctx) {
    throw new Error('useInventoryReport must be used within InventoryReportProvider');
  }
  return ctx;
}
