'use client';

import {
  createContext,
  useContext,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { fetchOverviewBundle } from '@/lib/api/overviewFetch';
import { fetchChannelBreakdownBundle } from '@/lib/api/channelBreakdownFetch';
import { fetchVdpDailyFiltered, fetchVdpFilterOptions } from '@/lib/api/dashboardApi';
import {
  DEFAULT_VDP_FILTERS,
  normalizeVdpFilters,
  vdpFilterCacheSuffix,
  vdpFiltersActive,
} from '@/lib/vdp/vdpFilterParams';
import {
  getVdpDailyCache,
} from '@/lib/data/vdpDailyCache';
import {
  getOverviewCache,
  setOverviewCache,
} from '@/lib/data/overviewCache';
import { normalizeReportDate } from '@/lib/ga4/aggregatePageDataRows';
import { enumerateDatesInclusive, toCalendarISO } from '@/lib/ga4/dateRange';
import {
  previousMonthAlignedRange,
  periodMonthLabel,
  sameMonthLastYearRange,
  mergeChannelComparison,
} from '@/lib/overview/comparePeriod';
import { useClient } from '../ClientContext';
import {
  readStoredOverviewTab,
  writeStoredOverviewTab,
  readStoredOverviewDateRange,
  writeStoredOverviewDateRange,
  readStoredOverviewCompareEnabled,
  writeStoredOverviewCompareEnabled,
  readStoredOverviewCompareDateRange,
  writeStoredOverviewCompareDateRange,
} from '@/lib/dashboard/dashboardPrefs';

const OverviewDataContext = createContext(null);

const EMPTY_VDP_FILTER_OPTIONS = {
  years: ['All'],
  makes: ['All'],
  models: ['All'],
  locations: ['All'],
  types: ['All'],
};

function pruneInvalidFilterSelections(filters, options) {
  const next = { ...filters };
  const keys = ['year', 'make', 'model', 'type', 'location'];
  for (const key of keys) {
    const list = options[`${key}s`] || options[key] || ['All'];
    if (next[key] !== 'All' && !list.includes(next[key])) {
      next[key] = 'All';
    }
  }
  return next;
}

const TAB_IDS = ['vdp', 'srp', 'home', 'all', 'other'];
const DEFAULT_RANGE = 'current_month';

function daysAgo(base, n) {
  const d = new Date(base);
  d.setDate(d.getDate() - n);
  return d;
}

/** Resolve the DateRange value into ISO date strings (inclusive). */
function resolveRange(value) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Any object that carries an explicit start/end wins — whatever the picker emits.
  if (value && typeof value === 'object' && value.start && value.end) {
    return { from: value.start, to: value.end };
  }

  const v = typeof value === 'string' ? value : DEFAULT_RANGE;
  let from = today;
  let to = today;

  switch (v) {
    case 'today':
      break;
    case 'yesterday':
      from = daysAgo(today, 1);
      to = daysAgo(today, 1);
      break;
    case '7d':
      from = daysAgo(today, 6);
      break;
    case '14d':
      from = daysAgo(today, 13);
      break;
    case '30d':
      from = daysAgo(today, 29);
      break;
    case '90d':
      from = daysAgo(today, 89);
      break;
    case '12m':
      from = daysAgo(today, 364);
      break;
    case 'current_month':
    case 'mtd':
      from = new Date(today.getFullYear(), today.getMonth(), 1);
      break;
    case 'last_mtd': {
      const end = new Date(today.getFullYear(), today.getMonth(), 0);
      from = new Date(end.getFullYear(), end.getMonth(), 1);
      to = end;
      break;
    }
    case 'qtd': {
      const q = Math.floor(today.getMonth() / 3);
      from = new Date(today.getFullYear(), q * 3, 1);
      break;
    }
    case 'ytd':
      from = new Date(today.getFullYear(), 0, 1);
      break;
    case 'last_year': {
      const y = today.getFullYear() - 1;
      from = new Date(y, 0, 1);
      to = new Date(y, 11, 31);
      break;
    }
    case 'all':
      from = new Date(2020, 0, 1);
      break;
    default:
      if (typeof v === 'string' && /^year_\d{4}$/.test(v)) {
        const y = Number(v.slice(5));
        from = new Date(y, 0, 1);
        to = y === today.getFullYear() ? today : new Date(y, 11, 31);
      } else {
        from = daysAgo(today, 29);
      }
  }

  return { from: toCalendarISO(from), to: toCalendarISO(to) };
}

/** Normalize `ga4_page_type` from Supabase to our tab id.
 *  Tolerant of spaces, dashes, underscores and casing — so
 *  "Home page", "home_page", "HOME-PAGE", "homepage" all map to `home`.
 */
function pageTypeToTab(raw) {
  const t = String(raw || '').toLowerCase().replace(/[\s_\-]+/g, '');
  if (t === 'srp' || t === 'searchresults' || t === 'searchresultspage') return 'srp';
  if (t === 'home' || t === 'homepage') return 'home';
  if (t === 'vdp' || t === 'vehicledetails' || t === 'vehicledetailspage') return 'vdp';
  return 'other';
}

function totalsFromOverviewRows(rows) {
  const totals = { all: 0, vdp: 0, srp: 0, home: 0, other: 0 };
  for (const r of rows || []) {
    const views = Number(r.views) || 0;
    const date = normalizeReportDate(r.report_date);
    if (!date || views === 0) continue;
    const tabKey = pageTypeToTab(r.ga4_page_type);
    totals.all += views;
    totals[tabKey] += views;
  }
  return totals;
}

/** Drop trailing chart days with no views on any tab (e.g. today before pipeline runs). */
function chartDateListAndSeries(dateList, seriesByTab) {
  if (!dateList.length) return { dateList, seriesByTab };

  let end = dateList.length;
  while (end > 1) {
    const idx = end - 1;
    const hasViews = TAB_IDS.some((key) => (seriesByTab[key]?.[idx] || 0) > 0);
    if (hasViews) break;
    end -= 1;
  }

  if (end === dateList.length) return { dateList, seriesByTab };

  const trimmedDates = dateList.slice(0, end);
  const trimmedSeries = {};
  for (const key of TAB_IDS) {
    trimmedSeries[key] = (seriesByTab[key] || []).slice(0, end);
  }
  return { dateList: trimmedDates, seriesByTab: trimmedSeries };
}

export function OverviewProvider({ children }) {
  const { client, isAllDealer } = useClient();

  const [tab, setTabState] = useState(() => readStoredOverviewTab() || 'vdp');
  const setTab = useCallback((nextTab) => {
    setTabState(nextTab);
    writeStoredOverviewTab(nextTab);
  }, []);

  useEffect(() => {
    if (isAllDealer && tab !== 'vdp' && tab !== 'all') {
      setTab('vdp');
    }
  }, [isAllDealer, tab, setTab]);

  const [dateRange, setDateRangeState] = useState(
    () => readStoredOverviewDateRange() || DEFAULT_RANGE,
  );
  const setDateRange = useCallback((next) => {
    setDateRangeState(next);
    writeStoredOverviewDateRange(next);
  }, []);

  const [compareEnabled, setCompareEnabledState] = useState(
    () => readStoredOverviewCompareEnabled(),
  );
  const [compareDateRange, setCompareDateRangeState] = useState(
    () => readStoredOverviewCompareDateRange(),
  );

  const setCompareDateRange = useCallback((next) => {
    setCompareDateRangeState(next);
    writeStoredOverviewCompareDateRange(next);
  }, []);
  const [compareRows, setCompareRows] = useState([]);
  const [compareLoading, setCompareLoading] = useState(false);
  const [lyRows, setLyRows] = useState([]);
  const [vdpFilters, setVdpFilters] = useState(DEFAULT_VDP_FILTERS);
  const [vdpFilterOptions, setVdpFilterOptions] = useState(EMPTY_VDP_FILTER_OPTIONS);
  const [vdpFilteredDaily, setVdpFilteredDaily] = useState(null);
  const [compareVdpFilteredDaily, setCompareVdpFilteredDaily] = useState(null);
  const [lyVdpFilteredDaily, setLyVdpFilteredDaily] = useState(null);
  const [vdpFiltersLoading, setVdpFiltersLoading] = useState(false);
  const [vdpChannelCurRows, setVdpChannelCurRows] = useState([]);
  const [vdpChannelCmpRows, setVdpChannelCmpRows] = useState([]);
  const [vdpChannelLyRows, setVdpChannelLyRows] = useState(null);
  const [vdpChannelLoading, setVdpChannelLoading] = useState(false);
  const [vdpChannelError, setVdpChannelError] = useState(null);
  const [rows, setRows] = useState([]);
  const [userTotalsRows, setUserTotalsRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const { from, to } = useMemo(() => resolveRange(dateRange), [dateRange]);

  const defaultCompare = useMemo(
    () => previousMonthAlignedRange(from, to),
    [from, to]
  );

  const { compareFrom, compareTo } = useMemo(() => {
    const fallback = defaultCompare;
    if (!compareDateRange) return fallback;

    if (
      typeof compareDateRange === 'object'
      && compareDateRange.start
      && compareDateRange.end
    ) {
      return {
        compareFrom: compareDateRange.start,
        compareTo: compareDateRange.end,
      };
    }

    if (typeof compareDateRange === 'string') {
      const resolved = resolveRange(compareDateRange);
      return { compareFrom: resolved.from, compareTo: resolved.to };
    }

    return fallback;
  }, [compareDateRange, defaultCompare]);

  const currentPeriodLabel = useMemo(
    () => periodMonthLabel(from, to),
    [from, to]
  );
  const comparePeriodLabel = useMemo(
    () => periodMonthLabel(compareFrom, compareTo),
    [compareFrom, compareTo]
  );

  const { lyFrom, lyTo } = useMemo(
    () => sameMonthLastYearRange(from, to),
    [from, to]
  );

  const setCompareEnabled = useCallback((next) => {
    const enabled = Boolean(next);
    setCompareEnabledState(enabled);
    writeStoredOverviewCompareEnabled(enabled);
    if (!enabled) {
      setCompareDateRange(null);
    }
  }, [setCompareDateRange]);

  const toggleCompareEnabled = useCallback(() => {
    setCompareEnabledState((prev) => {
      const next = !prev;
      writeStoredOverviewCompareEnabled(next);
      if (next) {
        const def = previousMonthAlignedRange(from, to);
        setCompareDateRange({
          start: def.compareFrom,
          end: def.compareTo,
          preset: 'custom',
        });
      } else {
        setCompareDateRange(null);
      }
      return next;
    });
  }, [from, to, setCompareDateRange]);

  const prevMainRangeRef = useRef(null);
  useEffect(() => {
    const key = `${from}|${to}`;
    if (prevMainRangeRef.current === null) {
      prevMainRangeRef.current = key;
      return;
    }
    if (prevMainRangeRef.current === key) return;
    prevMainRangeRef.current = key;
    setCompareDateRange(null);
  }, [from, to, setCompareDateRange]);

  // ── single fetch keyed by (client, from, to) ─────────────────
  // Join: `smart_ga4_page_data.client_id` === `smart_hoot_config.ga4_customer_id`.
  const clientKey = client?.ga4CustomerId || null;

  const setVdpFilter = useCallback((key, value) => {
    setVdpFilters((prev) => ({ ...prev, [key]: value }));
  }, []);

  const clearVdpFilters = useCallback(() => {
    setVdpFilters(DEFAULT_VDP_FILTERS);
  }, []);

  const breakdownLoadsRef = useRef(0);
  const vdpFilteredDailyRef = useRef(null);
  const [breakdownUpdating, setBreakdownUpdating] = useState(false);
  const [breakdownChunkProgress, setBreakdownChunkProgress] = useState(null);

  const beginBreakdownLoad = useCallback(() => {
    breakdownLoadsRef.current += 1;
    setBreakdownUpdating(true);
  }, []);

  const endBreakdownLoad = useCallback(() => {
    breakdownLoadsRef.current = Math.max(0, breakdownLoadsRef.current - 1);
    if (breakdownLoadsRef.current === 0) {
      setBreakdownUpdating(false);
      setBreakdownChunkProgress(null);
    }
  }, []);

  const reportBreakdownChunk = useCallback((progress) => {
    if (progress) setBreakdownChunkProgress(progress);
  }, []);

  useEffect(() => {
    vdpFilteredDailyRef.current = vdpFilteredDaily;
  }, [vdpFilteredDaily]);

  useEffect(() => {
    setVdpFilters(DEFAULT_VDP_FILTERS);
    setVdpFilteredDaily(null);
    setCompareVdpFilteredDaily(null);
    setLyVdpFilteredDaily(null);
    vdpFilteredDailyRef.current = null;
  }, [clientKey, from, to]);

  useEffect(() => {
    if (!clientKey || !from || !to) {
      setRows([]);
      return undefined;
    }

    let cancelled = false;
    const cached = getOverviewCache(clientKey, from, to);
    if (cached) {
      setRows(cached.rows || []);
      setUserTotalsRows(cached.userTotalsRows || []);
      setLoading(false);
      setError(null);
    } else {
      setRows([]);
      setUserTotalsRows([]);
      setLoading(true);
      setError(null);
    }

    (async () => {
      try {
        const bundle = await fetchOverviewBundle({
          clientId: clientKey,
          from,
          to,
          onCancelCheck: () => cancelled,
        });
        if (cancelled || !bundle) return;

        setRows(bundle.rows || []);
        setUserTotalsRows(bundle.userTotalsRows || []);
        setOverviewCache(clientKey, from, to, {
          rows: bundle.rows || [],
          userTotalsRows: bundle.userTotalsRows || [],
        });
      } catch (fetchError) {
        if (cancelled) return;
        setError(fetchError?.message || 'Failed to fetch overview data.');
        if (!cached) {
          setRows([]);
          setUserTotalsRows([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [clientKey, from, to]);

  // ── previous-month overview (MoM baseline + compare chart) ──
  useEffect(() => {
    if (!clientKey || !compareFrom || !compareTo) {
      setCompareRows([]);
      setCompareLoading(false);
      return undefined;
    }

    let cancelled = false;
    const cached = getOverviewCache(clientKey, compareFrom, compareTo);
    if (cached) {
      setCompareRows(cached.rows || []);
      setCompareLoading(false);
    } else {
      setCompareRows([]);
      setCompareLoading(true);
    }

    (async () => {
      try {
        const bundle = await fetchOverviewBundle({
          clientId: clientKey,
          from: compareFrom,
          to: compareTo,
          onCancelCheck: () => cancelled,
        });
        if (cancelled || !bundle) return;
        setCompareRows(bundle.rows || []);
        setOverviewCache(clientKey, compareFrom, compareTo, {
          rows: bundle.rows || [],
          userTotalsRows: bundle.userTotalsRows || [],
        });
      } catch {
        if (!cancelled && !cached) setCompareRows([]);
      } finally {
        if (!cancelled) setCompareLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [clientKey, compareFrom, compareTo]);

  // ── same period last year (YoY baseline for KPI) ──
  useEffect(() => {
    if (!clientKey || !lyFrom || !lyTo) {
      setLyRows([]);
      return undefined;
    }

    let cancelled = false;
    const cached = getOverviewCache(clientKey, lyFrom, lyTo);
    if (cached) {
      setLyRows(cached.rows || []);
    } else {
      setLyRows([]);
    }

    if (cached) {
      return () => {
        cancelled = true;
      };
    }

    (async () => {
      try {
        const bundle = await fetchOverviewBundle({
          clientId: clientKey,
          from: lyFrom,
          to: lyTo,
          onCancelCheck: () => cancelled,
        });
        if (cancelled || !bundle) return;
        setLyRows(bundle.rows || []);
        setOverviewCache(clientKey, lyFrom, lyTo, {
          rows: bundle.rows || [],
          userTotalsRows: bundle.userTotalsRows || [],
        });
      } catch {
        if (!cancelled) setLyRows([]);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [clientKey, lyFrom, lyTo]);

  // ── VDP filter dropdown options (from inventory in range) ──
  useEffect(() => {
    if (!clientKey || !from || !to) {
      setVdpFilterOptions(EMPTY_VDP_FILTER_OPTIONS);
      return undefined;
    }

    let cancelled = false;
    fetchVdpFilterOptions({
      clientId: clientKey,
      from,
      to,
      onCancelCheck: () => cancelled,
    })
      .then((options) => {
        if (cancelled || !options) return;
        setVdpFilterOptions(options);
        setVdpFilters((current) =>
          pruneInvalidFilterSelections(normalizeVdpFilters(current), options)
        );
      })
      .catch(() => {
        if (!cancelled) setVdpFilterOptions(EMPTY_VDP_FILTER_OPTIONS);
      });

    return () => {
      cancelled = true;
    };
  }, [clientKey, from, to]);

  // ── VDP daily views for KPI + chart (current period — priority) ──
  useEffect(() => {
    if (!clientKey || !from || !to) {
      setVdpFilteredDaily(null);
      setVdpFiltersLoading(false);
      return undefined;
    }

    const cacheSuffix = vdpFilterCacheSuffix(vdpFilters, 'vdp');
    const cached = getVdpDailyCache(clientKey, from, to, cacheSuffix);
    if (cached) {
      setVdpFilteredDaily(cached);
      setVdpFiltersLoading(false);
      return undefined;
    }

    let cancelled = false;
    if (!vdpFilteredDailyRef.current) setVdpFiltersLoading(true);

    fetchVdpDailyFiltered({
      clientId: clientKey,
      from,
      to,
      vdpFilters,
      tab: 'vdp',
      onCancelCheck: () => cancelled,
      onProgress: (partial) => {
        if (cancelled || !partial) return;
        setVdpFilteredDaily(partial);
        setVdpFiltersLoading(false);
      },
    })
      .then((result) => {
        if (!cancelled && result) setVdpFilteredDaily(result);
      })
      .finally(() => {
        if (!cancelled) setVdpFiltersLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [clientKey, from, to, vdpFilters]);

  // ── VDP daily views for compare period (only when compare is on) ──
  useEffect(() => {
    if (!compareEnabled || !clientKey || !compareFrom || !compareTo) {
      setCompareVdpFilteredDaily(null);
      return undefined;
    }

    const cacheSuffix = vdpFilterCacheSuffix(vdpFilters, 'vdp');
    const cached = getVdpDailyCache(clientKey, compareFrom, compareTo, cacheSuffix);
    if (cached) {
      setCompareVdpFilteredDaily(cached);
      return undefined;
    }

    let cancelled = false;

    fetchVdpDailyFiltered({
      clientId: clientKey,
      from: compareFrom,
      to: compareTo,
      vdpFilters,
      tab: 'vdp',
      onCancelCheck: () => cancelled,
      onProgress: (partial) => {
        if (!cancelled && partial) setCompareVdpFilteredDaily(partial);
      },
    })
      .then((result) => {
        if (!cancelled && result) setCompareVdpFilteredDaily(result);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [compareEnabled, clientKey, compareFrom, compareTo, vdpFilters]);

  // ── VDP daily views for YoY baseline (background) ──
  useEffect(() => {
    if (!clientKey || !lyFrom || !lyTo) {
      setLyVdpFilteredDaily(null);
      return undefined;
    }

    const cacheSuffix = vdpFilterCacheSuffix(vdpFilters, 'vdp');
    const cached = getVdpDailyCache(clientKey, lyFrom, lyTo, cacheSuffix);
    if (cached) {
      setLyVdpFilteredDaily(cached);
      return undefined;
    }

    let cancelled = false;

    fetchVdpDailyFiltered({
      clientId: clientKey,
      from: lyFrom,
      to: lyTo,
      vdpFilters,
      tab: 'vdp',
      onCancelCheck: () => cancelled,
      onProgress: (partial) => {
        if (!cancelled && partial) setLyVdpFilteredDaily(partial);
      },
    })
      .then((result) => {
        if (!cancelled && result) setLyVdpFilteredDaily(result);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [clientKey, lyFrom, lyTo, vdpFilters]);

  // ── VDP channel breakdown (all filters except location; KPI uses filtered daily) ──
  useEffect(() => {
    if (!clientKey || !from || !to || !compareFrom || !compareTo) {
      setVdpChannelCurRows([]);
      setVdpChannelCmpRows([]);
      setVdpChannelLyRows(null);
      setVdpChannelLoading(false);
      setVdpChannelError(null);
      return undefined;
    }

    let cancelled = false;
    let loadTracked = false;
    setVdpChannelLoading(true);
    setVdpChannelError(null);
    beginBreakdownLoad();
    loadTracked = true;

    const fetchOpts = {
      clientId: clientKey,
      pageTypeFilter: 'VDP',
      // Location ignored for channel; make/model/type/year/condition still apply.
      vdpFilters,
      tab: 'vdp',
      onCancelCheck: () => cancelled,
      adaptiveChunks: true,
      preferServer: true,
    };

    const loadPeriod = (rangeFrom, rangeTo) =>
      fetchChannelBreakdownBundle({
        ...fetchOpts,
        from: rangeFrom,
        to: rangeTo,
      });

    (async () => {
      try {
        const current = await loadPeriod(from, to);
        if (cancelled) return;
        setVdpChannelCurRows(current || []);

        const compare = await loadPeriod(compareFrom, compareTo);
        if (cancelled) return;
        setVdpChannelCmpRows(compare || []);

        if (lyFrom && lyTo) {
          const ly = await loadPeriod(lyFrom, lyTo);
          if (cancelled) return;
          setVdpChannelLyRows(ly || []);
        } else {
          setVdpChannelLyRows(null);
        }
      } catch (fetchError) {
        if (!cancelled) {
          setVdpChannelError(fetchError?.message || 'Failed to load VDP channel comparison.');
          setVdpChannelCurRows([]);
          setVdpChannelCmpRows([]);
          setVdpChannelLyRows(null);
        }
      } finally {
        if (loadTracked) endBreakdownLoad();
        if (!cancelled) setVdpChannelLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    clientKey,
    from,
    to,
    compareFrom,
    compareTo,
    lyFrom,
    lyTo,
    vdpFilters,
    beginBreakdownLoad,
    endBreakdownLoad,
  ]);

  // ── derived: totals + daily-by-date map per tab + raw page-type histogram ──
  const derived = useMemo(() => {
    const totals = { all: 0, vdp: 0, srp: 0, home: 0, other: 0 };
    const uniqueVisitors = { all: 0, vdp: 0, srp: 0, home: 0, other: 0 };
    const daily = { all: {}, vdp: {}, srp: {}, home: {}, other: {} };
    const pageTypeHist = new Map(); // raw value → { views, rows, tab }

    for (const r of rows) {
      const views = Number(r.views) || 0;
      const visitors = Number(r.total_users) || 0;
      const date = normalizeReportDate(r.report_date);
      if (!date) continue;
      const rawType = r.ga4_page_type ?? '(null)';
      const tabKey = pageTypeToTab(r.ga4_page_type);

      // histogram (always count the row, even if views=0)
      const prev = pageTypeHist.get(rawType) || { views: 0, rows: 0, tab: tabKey };
      prev.views += views;
      prev.rows += 1;
      prev.tab = tabKey;
      pageTypeHist.set(rawType, prev);

      uniqueVisitors.all += visitors;
      if (tabKey !== 'vdp') {
        uniqueVisitors[tabKey] += visitors;
      }

      if (views === 0) continue;

      // "all" sums every row
      totals.all += views;
      daily.all[date] = (daily.all[date] || 0) + views;

      totals[tabKey] += views;
      daily[tabKey][date] = (daily[tabKey][date] || 0) + views;
    }

    const pageTypes = Array.from(pageTypeHist.entries())
      .map(([raw, info]) => ({ raw, ...info }))
      .sort((a, b) => b.views - a.views);

    // IMPORTANT:
    // User/session metrics are sourced from smart_ga4_data via RPC
    // and are not split by ga4_page_type in this context.
    const totalUsers = userTotalsRows.reduce(
      (sum, r) => sum + (Number(r.total_users) || 0),
      0
    );
    uniqueVisitors.all = totalUsers;
    uniqueVisitors.vdp = totalUsers;
    uniqueVisitors.srp = totalUsers;
    uniqueVisitors.home = totalUsers;
    uniqueVisitors.other = totalUsers;

    return { totals, uniqueVisitors, daily, pageTypes };
  }, [rows, userTotalsRows]);

  const adjustedDerived = useMemo(() => {
    if (!vdpFilteredDaily) {
      return {
        ...derived,
        totals: { ...derived.totals, vdp: 0 },
        daily: { ...derived.daily, vdp: {} },
      };
    }
    return {
      ...derived,
      totals: { ...derived.totals, vdp: vdpFilteredDaily.total || 0 },
      daily: { ...derived.daily, vdp: vdpFilteredDaily.daily || {} },
    };
  }, [derived, vdpFilteredDaily]);

  // ── derived: continuous daily series (zero-fills missing days) ──
  const fullDateList = useMemo(
    () => enumerateDatesInclusive(from, to),
    [from, to]
  );

  const seriesByTabRaw = useMemo(() => {
    const out = {};
    for (const key of TAB_IDS) {
      out[key] = fullDateList.map((d) => adjustedDerived.daily[key]?.[d] || 0);
    }
    return out;
  }, [adjustedDerived, fullDateList]);

  const { dateList, seriesByTab } = useMemo(
    () => chartDateListAndSeries(fullDateList, seriesByTabRaw),
    [fullDateList, seriesByTabRaw]
  );

  const compareFullDateList = useMemo(
    () => (compareEnabled ? enumerateDatesInclusive(compareFrom, compareTo) : []),
    [compareEnabled, compareFrom, compareTo]
  );

  const compareDerived = useMemo(() => {
    const totals = totalsFromOverviewRows(compareRows);
    const daily = { all: {}, vdp: {}, srp: {}, home: {}, other: {} };

    for (const r of compareRows) {
      const views = Number(r.views) || 0;
      const date = normalizeReportDate(r.report_date);
      if (!date || views === 0) continue;
      const tabKey = pageTypeToTab(r.ga4_page_type);
      daily.all[date] = (daily.all[date] || 0) + views;
      daily[tabKey][date] = (daily[tabKey][date] || 0) + views;
    }

    return { totals, daily };
  }, [compareRows]);

  const adjustedCompareDerived = useMemo(() => {
    if (!compareVdpFilteredDaily) return compareDerived;
    return {
      ...compareDerived,
      totals: { ...compareDerived.totals, vdp: compareVdpFilteredDaily.total || 0 },
      daily: { ...compareDerived.daily, vdp: compareVdpFilteredDaily.daily || {} },
    };
  }, [compareDerived, compareVdpFilteredDaily]);

  const lyTotals = useMemo(() => totalsFromOverviewRows(lyRows), [lyRows]);

  const adjustedLyTotals = useMemo(() => {
    if (!lyVdpFilteredDaily) return lyTotals;
    return { ...lyTotals, vdp: lyVdpFilteredDaily.total || 0 };
  }, [lyTotals, lyVdpFilteredDaily]);

  const compareSeriesByTabRaw = useMemo(() => {
    if (!compareEnabled) return {};
    const out = {};
    for (const key of TAB_IDS) {
      out[key] = compareFullDateList.map(
        (d) => adjustedCompareDerived.daily[key]?.[d] || 0
      );
    }
    return out;
  }, [compareEnabled, compareFullDateList, adjustedCompareDerived]);

  const { dateList: compareDateList, seriesByTab: compareSeriesTrimmed } = useMemo(
    () => chartDateListAndSeries(compareFullDateList, compareSeriesByTabRaw),
    [compareFullDateList, compareSeriesByTabRaw]
  );

  const vdpChannelComparison = useMemo(
    () => mergeChannelComparison(vdpChannelCurRows, vdpChannelCmpRows, vdpChannelLyRows),
    [vdpChannelCurRows, vdpChannelCmpRows, vdpChannelLyRows]
  );

  const rowCount = rows.length;

  const value = useMemo(
    () => ({
      tab,
      setTab,
      dateRange,
      setDateRange,
      vdpFilters,
      setVdpFilter,
      clearVdpFilters,
      vdpFilterOptions,
      vdpFiltersLoading,
      breakdownUpdating,
      breakdownChunkProgress,
      beginBreakdownLoad,
      endBreakdownLoad,
      reportBreakdownChunk,
      from,
      to,
      dateList,
      totals: adjustedDerived.totals,
      uniqueVisitors: derived.uniqueVisitors,
      pageTypes: derived.pageTypes,
      seriesByTab,
      loading,
      error,
      rowCount,
      clientKey,
      rows,
      compareEnabled,
      setCompareEnabled,
      toggleCompareEnabled,
      compareDateRange,
      setCompareDateRange,
      compareFrom,
      compareTo,
      currentPeriodLabel,
      comparePeriodLabel,
      compareTotals: adjustedCompareDerived.totals,
      lyTotals: adjustedLyTotals,
      compareDateList,
      compareSeriesByTab: compareSeriesTrimmed,
      compareLoading,
      vdpChannelComparison,
      vdpChannelCurRows,
      vdpChannelCmpRows,
      vdpChannelLyRows,
      vdpChannelLoading,
      vdpChannelError,
    }),
    [
      tab,
      setTab,
      dateRange,
      setDateRange,
      vdpFilters,
      setVdpFilter,
      clearVdpFilters,
      vdpFilterOptions,
      vdpFiltersLoading,
      breakdownUpdating,
      breakdownChunkProgress,
      beginBreakdownLoad,
      endBreakdownLoad,
      reportBreakdownChunk,
      from,
      to,
      dateList,
      adjustedDerived.totals,
      derived.uniqueVisitors,
      derived.pageTypes,
      seriesByTab,
      loading,
      error,
      rowCount,
      clientKey,
      rows,
      compareEnabled,
      setCompareEnabled,
      toggleCompareEnabled,
      compareDateRange,
      setCompareDateRange,
      compareFrom,
      compareTo,
      currentPeriodLabel,
      comparePeriodLabel,
      adjustedCompareDerived.totals,
      adjustedLyTotals,
      compareDateList,
      compareSeriesTrimmed,
      compareLoading,
      vdpChannelComparison,
      vdpChannelCurRows,
      vdpChannelCmpRows,
      vdpChannelLyRows,
      vdpChannelLoading,
      vdpChannelError,
    ]
  );

  return (
    <OverviewDataContext.Provider value={value}>
      {children}
    </OverviewDataContext.Provider>
  );
}

export function useOverview() {
  const ctx = useContext(OverviewDataContext);
  if (!ctx) {
    throw new Error('useOverview must be used inside <OverviewProvider>');
  }
  return ctx;
}
