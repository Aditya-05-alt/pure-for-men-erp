'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  resolveVdpReportPeriod,
  VDP_DEFAULT_COMPARE_MODE,
  VDP_DEFAULT_DATE_RANGE,
} from '@/lib/vdp/dateRange';

const VdpDateRangeContext = createContext(null);

const STORAGE_KEY = 'vdp_report_date_range';
const COMPARE_ENABLED_KEY = 'vdp_compare_enabled';
const COMPARE_RANGE_KEY = 'vdp_compare_date_range';
const COMPARE_MODE_KEY = 'vdp_compare_mode';

function readJson(key, fallback) {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = window.sessionStorage.getItem(key);
    if (raw == null) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function normalizeCompareMode(value) {
  if (value === 'pop' || value === 'mom') return value;
  return null;
}

export function VdpDateRangeProvider({ children }) {
  const [dateRange, setDateRangeState] = useState(VDP_DEFAULT_DATE_RANGE);
  const [compareEnabled, setCompareEnabledState] = useState(true);
  const [compareDateRange, setCompareDateRangeState] = useState(null);
  const [compareMode, setCompareModeState] = useState(VDP_DEFAULT_COMPARE_MODE);

  useEffect(() => {
    try {
      // Restore last selected range (do NOT reset to current_month every mount).
      const storedRange = readJson(STORAGE_KEY, null);
      if (storedRange != null) {
        setDateRangeState(storedRange);
      } else {
        window.sessionStorage.setItem(
          STORAGE_KEY,
          JSON.stringify(VDP_DEFAULT_DATE_RANGE)
        );
      }
      const storedEnabled = readJson(COMPARE_ENABLED_KEY, true);
      setCompareEnabledState(storedEnabled !== false);
      const storedCompare = readJson(COMPARE_RANGE_KEY, null);
      if (storedCompare) setCompareDateRangeState(storedCompare);
      // Compare starts empty — user opts into MoM / PoP when needed
      setCompareModeState(null);
      window.sessionStorage.setItem(COMPARE_MODE_KEY, JSON.stringify(null));
    } catch {
      /* ignore */
    }
  }, []);

  const setDateRange = useCallback((next) => {
    setDateRangeState(next);
    try {
      window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  }, []);

  const setCompareEnabled = useCallback((next) => {
    const enabled = Boolean(next);
    setCompareEnabledState(enabled);
    try {
      window.sessionStorage.setItem(
        COMPARE_ENABLED_KEY,
        JSON.stringify(enabled)
      );
    } catch {
      /* ignore */
    }
  }, []);

  const toggleCompareEnabled = useCallback(() => {
    setCompareEnabledState((prev) => {
      const enabled = !prev;
      try {
        window.sessionStorage.setItem(
          COMPARE_ENABLED_KEY,
          JSON.stringify(enabled)
        );
      } catch {
        /* ignore */
      }
      return enabled;
    });
  }, []);

  const setCompareDateRange = useCallback((next) => {
    setCompareDateRangeState(next);
    try {
      window.sessionStorage.setItem(COMPARE_RANGE_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  }, []);

  const setCompareMode = useCallback((next) => {
    const mode = normalizeCompareMode(next);
    setCompareModeState(mode);
    try {
      window.sessionStorage.setItem(COMPARE_MODE_KEY, JSON.stringify(mode));
    } catch {
      /* ignore */
    }
  }, []);

  const toggleCompareMode = useCallback((next) => {
    setCompareModeState((prev) => {
      const wanted = normalizeCompareMode(next);
      const mode = prev === wanted ? null : wanted;
      try {
        window.sessionStorage.setItem(COMPARE_MODE_KEY, JSON.stringify(mode));
      } catch {
        /* ignore */
      }
      return mode;
    });
  }, []);

  const period = useMemo(
    () =>
      resolveVdpReportPeriod(dateRange, {
        compareEnabled,
        compareDateRange,
        compareMode,
      }),
    [dateRange, compareEnabled, compareDateRange, compareMode]
  );

  const value = useMemo(
    () => ({
      dateRange,
      setDateRange,
      compareEnabled,
      setCompareEnabled,
      toggleCompareEnabled,
      compareDateRange,
      setCompareDateRange,
      compareMode,
      setCompareMode,
      toggleCompareMode,
      period,
      from: period.from,
      to: period.to,
      priorFrom: period.priorFrom,
      priorTo: period.priorTo,
      curLabel: period.curLabel,
      priLabel: period.priLabel,
    }),
    [
      dateRange,
      setDateRange,
      compareEnabled,
      setCompareEnabled,
      toggleCompareEnabled,
      compareDateRange,
      setCompareDateRange,
      compareMode,
      setCompareMode,
      toggleCompareMode,
      period,
    ]
  );

  return (
    <VdpDateRangeContext.Provider value={value}>
      {children}
    </VdpDateRangeContext.Provider>
  );
}

export function useVdpDateRange() {
  const ctx = useContext(VdpDateRangeContext);
  if (!ctx) {
    const period = resolveVdpReportPeriod(VDP_DEFAULT_DATE_RANGE, {
      compareEnabled: true,
      compareMode: VDP_DEFAULT_COMPARE_MODE,
    });
    return {
      dateRange: VDP_DEFAULT_DATE_RANGE,
      setDateRange: () => {},
      compareEnabled: true,
      setCompareEnabled: () => {},
      toggleCompareEnabled: () => {},
      compareDateRange: null,
      setCompareDateRange: () => {},
      compareMode: VDP_DEFAULT_COMPARE_MODE,
      setCompareMode: () => {},
      toggleCompareMode: () => {},
      period,
      from: period.from,
      to: period.to,
      priorFrom: period.priorFrom,
      priorTo: period.priorTo,
      curLabel: period.curLabel,
      priLabel: period.priLabel,
    };
  }
  return ctx;
}
