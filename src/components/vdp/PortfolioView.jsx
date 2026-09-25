'use client';

import { useCallback, useEffect, useMemo, useRef, useState, Fragment } from 'react';
import { useRouter } from 'next/navigation';
import { useClient } from '@/components/dashboard/ClientContext';
import {
  fetchAllDealersChannelMatrix,
  sliceMapForRow,
} from '@/lib/api/allDealerChannelMatrix';
import { fetchAllDealersConditionTotals } from '@/lib/api/allDealerConditionTotals';
import { colorForChannel } from '@/lib/ga4/channelDisplay';
import { fmt, pct, momClass, safeDiv } from '@/lib/vdp/aggregates';
import VdpChart from './VdpChart';
import { VdpLoadingCard } from './VdpLoadingBanner';
import { useVdpDateRange } from './VdpDateRangeContext';
import { Card, Kpi, Seg, Toolbar, ToolbarGroup } from './VdpUi';
import { VDP_COMPARE_MODES } from '@/lib/vdp/dateRange';

const METRIC_OPTS = [
  { value: 'vdp', label: 'VDP Views' },
  { value: 'page', label: 'Page Views' },
];

function dealerIncludedOnTab(dealer, metric) {
  if (metric === 'vdp') return dealer?.showAllDealersVdp !== false;
  return dealer?.showAllDealersAll !== false;
}

function dealerKey(dealer) {
  return String(dealer?.ga4CustomerId || dealer?.id || dealer?.name || '');
}

function totalForRow(row, channelId) {
  if (!row) return 0;
  if (channelId === 'all') return Math.round(Number(row.total) || 0);
  const slice = sliceMapForRow(row).get(channelId);
  return Math.round(Number(slice?.value) || 0);
}

function indexRowsByDealer(rows) {
  const map = new Map();
  for (const row of rows || []) {
    map.set(dealerKey(row.dealer), row);
  }
  return map;
}

function buildChannelGrid(matrixRows, columns) {
  const dealerRows = (matrixRows || []).map((row) => {
    const byName = sliceMapForRow(row);
    const cells = columns.map((name) =>
      Math.round(Number(byName.get(name)?.value) || 0)
    );
    return {
      dealer: row.dealer,
      error: row.error,
      cells,
      total: cells.reduce((s, v) => s + v, 0),
    };
  });

  const allChannelTotals = columns.map((name, i) => ({
    id: name,
    name,
    color: colorForChannel(name, i),
    total: dealerRows.reduce((s, row) => s + row.cells[i], 0),
  }));

  const allTotal = allChannelTotals.reduce((s, c) => s + c.total, 0);
  return { dealerRows, allChannelTotals, allTotal, columns };
}

function channelMatrixSortValue(
  row,
  key,
  { channelId, channelGrid, priorByDealer, channelValue }
) {
  if (key === 'name') return String(row.dealer?.name || '').toLowerCase();
  if (key === 'total') return Number(row.total) || 0;
  if (key === 'totalPri') {
    const priorRow = priorByDealer.get(dealerKey(row.dealer));
    if (channelId === 'all') return Math.round(Number(priorRow?.total) || 0);
    return channelValue(priorRow, channelId);
  }
  if (String(key).startsWith('ch:')) {
    const id = String(key).slice(3);
    if (channelId !== 'all' && id !== channelId) return 0;
    const idx = channelGrid.columns.indexOf(id);
    if (idx < 0) return 0;
    return Number(row.cells[idx]) || 0;
  }
  if (String(key).startsWith('chPri:')) {
    const id = String(key).slice(6);
    const priorRow = priorByDealer.get(dealerKey(row.dealer));
    return channelValue(priorRow, id);
  }
  return 0;
}

function SortableTh({
  children,
  className = '',
  style,
  sortKey,
  channelSort,
  onChannelSort,
  rowSpan,
  colSpan,
}) {
  const active = channelSort.k === sortKey;
  return (
    <th
      className={`${className}${active ? ' sorted' : ''} vdp-th-sortable`.trim()}
      style={style}
      rowSpan={rowSpan}
      colSpan={colSpan}
      onClick={() => onChannelSort(sortKey)}
    >
      <div className="vdp-col-sort">
        <span className="vdp-col-sort-label">{children}</span>
        <span className="vdp-col-sort-arrows" aria-hidden="true">
          <button
            type="button"
            className={active && channelSort.dir === 1 ? 'active' : ''}
            aria-label="Sort low to high"
            onClick={(e) => {
              e.stopPropagation();
              onChannelSort(sortKey, 1);
            }}
          >
            ▲
          </button>
          <button
            type="button"
            className={active && channelSort.dir === -1 ? 'active' : ''}
            aria-label="Sort high to low"
            onClick={(e) => {
              e.stopPropagation();
              onChannelSort(sortKey, -1);
            }}
          >
            ▼
          </button>
        </span>
      </div>
    </th>
  );
}

/** Custom single-select channel dropdown (not native select). */
function ChannelDropdown({ value, options, onChange, disabled }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => {
      if (!rootRef.current?.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const items = useMemo(
    () => [{ id: 'all', name: 'All Channels' }, ...(options || [])],
    [options]
  );

  const selectedLabel =
    items.find((o) => o.id === value)?.name || 'All Channels';

  return (
    <div className={`vdp-channel-dd${open ? ' is-open' : ''}`} ref={rootRef}>
      <button
        type="button"
        className={`vdp-channel-dd-trigger${open ? ' is-open' : ''}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="vdp-channel-dd-trigger-text">{selectedLabel}</span>
        <span className="vdp-channel-dd-chevron" aria-hidden>
          {open ? '▴' : '▾'}
        </span>
      </button>
      {open ? (
        <ul className="vdp-channel-dd-menu" role="listbox">
          {items.map((o) => {
            const active = o.id === value;
            return (
              <li key={o.id} role="option" aria-selected={active}>
                <button
                  type="button"
                  className={`vdp-channel-dd-option${active ? ' is-active' : ''}`}
                  onClick={() => {
                    onChange(o.id);
                    setOpen(false);
                  }}
                >
                  {o.name}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}

/** Searchable multi-select for dealers (empty selection = all dealers). */
function DealerMultiFilter({ options, selectedIds, onChange, disabled, showLabel = true }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const rootRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => {
      if (!rootRef.current?.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  useEffect(() => {
    if (!open) setQuery('');
  }, [open]);

  const selectedSet = useMemo(() => new Set(selectedIds || []), [selectedIds]);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => String(o.name || '').toLowerCase().includes(q));
  }, [options, query]);

  const triggerLabel = !selectedIds?.length
    ? 'All dealers'
    : selectedIds.length === 1
      ? options.find((o) => o.id === selectedIds[0])?.name || '1 dealer'
      : `${selectedIds.length} dealers`;

  const toggleId = (id) => {
    const next = new Set(selectedSet);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange([...next]);
  };

  return (
    <div className="vdp-dealer-multi" ref={rootRef}>
      {showLabel ? <label className="vdp-dealer-multi-lbl">Dealers</label> : null}
      <button
        type="button"
        className={`vdp-dealer-multi-trigger${open ? ' is-open' : ''}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="vdp-dealer-multi-trigger-text">{triggerLabel}</span>
        <span aria-hidden>{open ? '▴' : '▾'}</span>
      </button>
      {open ? (
        <div className="vdp-dealer-multi-pop" role="listbox" aria-multiselectable="true">
          <input
            type="search"
            className="vdp-dealer-multi-search"
            placeholder="Search dealers…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
          />
          <div className="vdp-dealer-multi-actions">
            <button
              type="button"
              className="vdp-dealer-multi-link"
              onClick={() => onChange(options.map((o) => o.id))}
            >
              Select all
            </button>
            <button
              type="button"
              className="vdp-dealer-multi-link"
              onClick={() => onChange([])}
            >
              Clear
            </button>
            <span className="vdp-dealer-multi-count">
              {selectedIds?.length
                ? `${selectedIds.length} selected`
                : 'Showing all'}
            </span>
          </div>
          <ul className="vdp-dealer-multi-list">
            {filtered.length === 0 ? (
              <li className="vdp-dealer-multi-empty">No dealers match</li>
            ) : (
              filtered.map((o) => {
                const checked = selectedSet.has(o.id);
                return (
                  <li key={o.id}>
                    <label className="vdp-dealer-multi-item">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleId(o.id)}
                      />
                      <span>{o.name}</span>
                    </label>
                  </li>
                );
              })
            )}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

export default function PortfolioView() {
  const router = useRouter();
  const {
    dealers,
    pickClient,
    loading: dealersLoading,
    error: dealersError,
    dealerCategoryFilter,
  } = useClient();

  const [metric, setMetric] = useState('vdp');
  const [channelId, setChannelId] = useState('all');
  const [sort, setSort] = useState({ k: 'name', dir: 1 });
  const [channelSort, setChannelSort] = useState({ k: 'name', dir: 1 });
  const [selectedDealerIds, setSelectedDealerIds] = useState([]);

  const [pageCur, setPageCur] = useState({ rows: [], columns: [] });
  const [pagePri, setPagePri] = useState({ rows: [], columns: [] });
  const [vdpCur, setVdpCur] = useState({ rows: [], columns: [] });
  const [vdpPri, setVdpPri] = useState({ rows: [], columns: [] });
  /** Lightweight New/Used/Unknown rows from condition-totals RPC. */
  const [conditionTotalsRows, setConditionTotalsRows] = useState([]);
  const [conditionSplitReady, setConditionSplitReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [progress, setProgress] = useState(null);
  const cancelRef = useRef(false);
  const loadGenRef = useRef(0);
  const conditionGenRef = useRef(0);

  const {
    from: curFrom,
    to: curTo,
    priorFrom: priFrom,
    priorTo: priTo,
    curLabel,
    priLabel,
    compareMode,
    toggleCompareMode,
  } = useVdpDateRange();
  const metricLabel = metric === 'page' ? 'Page Views' : 'VDP Views';
  const compareActive = compareMode === 'mom' || compareMode === 'pop';
  const comparePctLabel = compareMode === 'pop' ? 'PoP %' : 'MoM %';
  const compareModeLabel =
    compareMode === 'pop'
      ? 'PoP · same dates last month'
      : 'MoM · full last month';

  const portfolioDealers = useMemo(
    () => (dealers || []).filter((d) => dealerIncludedOnTab(d, metric)),
    [dealers, metric]
  );

  const loadMatrix = useCallback(async () => {
    if (!portfolioDealers.length || !curFrom || !curTo) {
      setPageCur({ rows: [], columns: [] });
      setPagePri({ rows: [], columns: [] });
      setVdpCur({ rows: [], columns: [] });
      setVdpPri({ rows: [], columns: [] });
      return;
    }

    const loadGen = loadGenRef.current + 1;
    loadGenRef.current = loadGen;
    cancelRef.current = false;
    const isStale = () => cancelRef.current || loadGenRef.current !== loadGen;
    const withCompare = compareActive && Boolean(priFrom && priTo);
    const fetchCount = withCompare ? 4 : 2;

    setLoading(true);
    setError(null);
    setProgress({ completed: 0, total: fetchCount });

    const progressParts = Array(fetchCount).fill(0);
    const publishProgress = () => {
      if (isStale()) return;
      setProgress({
        completed: progressParts.reduce((s, n) => s + n, 0),
        total: fetchCount,
      });
    };

    const fetchOne = (from, to, pageTypeFilter, idx) =>
      fetchAllDealersChannelMatrix({
        dealers: portfolioDealers,
        from,
        to,
        pageTypeFilter,
        condition: 'BOTH',
        onProgress: (prog) => {
          progressParts[idx] = prog.total
            ? prog.completed / prog.total
            : 0;
          publishProgress();
        },
        onCancelCheck: () => isStale(),
      });

    try {
      const emptyPrior = { rows: [], columns: [], warning: null };
      const [pageCurrent, pagePrior, vdpCurrent, vdpPrior] = await Promise.all([
        fetchOne(curFrom, curTo, 'ALL', 0),
        withCompare
          ? fetchOne(priFrom, priTo, 'ALL', 1)
          : Promise.resolve(emptyPrior),
        fetchOne(curFrom, curTo, 'VDP', withCompare ? 2 : 1),
        withCompare
          ? fetchOne(priFrom, priTo, 'VDP', 3)
          : Promise.resolve(emptyPrior),
      ]);

      if (isStale()) return;

      setPageCur({ rows: pageCurrent.rows || [], columns: pageCurrent.columns || [] });
      setPagePri({ rows: pagePrior.rows || [], columns: pagePrior.columns || [] });
      setVdpCur({ rows: vdpCurrent.rows || [], columns: vdpCurrent.columns || [] });
      setVdpPri({ rows: vdpPrior.rows || [], columns: vdpPrior.columns || [] });
      setError(
        pageCurrent.warning ||
          pagePrior.warning ||
          vdpCurrent.warning ||
          vdpPrior.warning ||
          null
      );
    } catch (err) {
      if (!isStale()) {
        setError(err?.message || 'Failed to load dealer channel data.');
        setPageCur({ rows: [], columns: [] });
        setPagePri({ rows: [], columns: [] });
        setVdpCur({ rows: [], columns: [] });
        setVdpPri({ rows: [], columns: [] });
      }
    } finally {
      if (!isStale()) {
        setLoading(false);
        setProgress(null);
      }
    }
  }, [
    portfolioDealers,
    curFrom,
    curTo,
    priFrom,
    priTo,
    compareActive,
  ]);

  const loadConditionTotals = useCallback(async () => {
    if (!portfolioDealers.length || !curFrom || !curTo) {
      setConditionTotalsRows([]);
      setConditionSplitReady(false);
      return;
    }

    const gen = conditionGenRef.current + 1;
    conditionGenRef.current = gen;
    const isStale = () => conditionGenRef.current !== gen;

    setConditionSplitReady(false);
    try {
      // Always use the fast all-channel totals RPC. Channel filter is applied
      // in the KPI by scaling with that channel's share of VDP (matrix).
      const rows = await fetchAllDealersConditionTotals({
        dealers: portfolioDealers,
        from: curFrom,
        to: curTo,
        channel: null,
        onCancelCheck: () => isStale(),
      });
      if (isStale()) return;
      setConditionTotalsRows(rows);
      setConditionSplitReady(true);
    } catch {
      if (!isStale()) {
        setConditionTotalsRows([]);
        setConditionSplitReady(true);
      }
    }
  }, [portfolioDealers, curFrom, curTo]);

  useEffect(() => {
    if (dealersLoading) return undefined;
    loadMatrix();
    return () => {
      cancelRef.current = true;
    };
  }, [dealersLoading, loadMatrix]);

  useEffect(() => {
    if (dealersLoading) return undefined;
    loadConditionTotals();
    return undefined;
  }, [dealersLoading, loadConditionTotals]);

  const activeMatrix = metric === 'vdp' ? vdpCur : pageCur;
  const priorMatrix = metric === 'vdp' ? vdpPri : pagePri;

  const channelGrid = useMemo(
    () => buildChannelGrid(activeMatrix.rows, activeMatrix.columns),
    [activeMatrix]
  );

  const priorByDealer = useMemo(
    () => indexRowsByDealer(priorMatrix.rows),
    [priorMatrix]
  );

  const channelValue = useCallback((row, channelName) => {
    if (!row || channelName == null) return 0;
    if (channelName === 'all') return Math.round(Number(row.total) || 0);
    return Math.round(Number(sliceMapForRow(row).get(channelName)?.value) || 0);
  }, []);

  const channelOptions = useMemo(
    () =>
      channelGrid.allChannelTotals.map((ch) => ({
        id: ch.id,
        name: ch.name,
      })),
    [channelGrid]
  );

  useEffect(() => {
    if (
      channelId !== 'all' &&
      channelOptions.length > 0 &&
      !channelOptions.some((c) => c.id === channelId)
    ) {
      setChannelId('all');
    }
  }, [channelId, channelOptions]);

  const channelLabel =
    channelId === 'all'
      ? 'All Channels'
      : channelOptions.find((c) => c.id === channelId)?.name || 'All Channels';

  const filterScopeLabel = channelLabel;

  const dealerFilterOptions = useMemo(() => {
    const rows = channelGrid.dealerRows || [];
    return rows
      .map((row) => ({
        id: dealerKey(row.dealer),
        name: row.dealer?.name || 'Unnamed',
      }))
      .filter((o) => o.id)
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [channelGrid.dealerRows]);

  const selectedDealerIdSet = useMemo(() => {
    if (!selectedDealerIds.length) return null;
    return new Set(selectedDealerIds);
  }, [selectedDealerIds]);

  // Drop selections that disappeared after data reload / channel filter
  useEffect(() => {
    if (!selectedDealerIds.length || !dealerFilterOptions.length) return;
    const valid = new Set(dealerFilterOptions.map((o) => o.id));
    const next = selectedDealerIds.filter((id) => valid.has(id));
    if (next.length !== selectedDealerIds.length) setSelectedDealerIds(next);
  }, [dealerFilterOptions, selectedDealerIds]);

  const filteredDealerRows = useMemo(() => {
    let rows;
    if (channelId === 'all') {
      rows = channelGrid.dealerRows;
    } else {
      const idx = channelGrid.columns.indexOf(channelId);
      if (idx < 0) {
        rows = channelGrid.dealerRows;
      } else {
        rows = channelGrid.dealerRows.map((row) => ({
          ...row,
          cells: row.cells.map((v, i) => (i === idx ? v : 0)),
          total: row.cells[idx] || 0,
        }));
      }
    }
    if (!selectedDealerIdSet) return rows;
    return rows.filter((row) => selectedDealerIdSet.has(dealerKey(row.dealer)));
  }, [channelGrid, channelId, selectedDealerIdSet]);

  const onChannelSort = useCallback((key, dir) => {
    setChannelSort((prev) => {
      if (dir === 1 || dir === -1) return { k: key, dir };
      if (prev.k === key) return { k: key, dir: -prev.dir };
      // Name defaults A→Z; numeric columns default high→low
      return { k: key, dir: key === 'name' ? 1 : -1 };
    });
  }, []);

  const sortedChannelRows = useMemo(() => {
    const ctx = {
      channelId,
      channelGrid,
      priorByDealer,
      channelValue,
    };
    return [...filteredDealerRows].sort((a, b) => {
      const av = channelMatrixSortValue(a, channelSort.k, ctx);
      const bv = channelMatrixSortValue(b, channelSort.k, ctx);
      if (typeof av === 'string' || typeof bv === 'string') {
        return String(av).localeCompare(String(bv)) * channelSort.dir;
      }
      return (Number(av) - Number(bv)) * channelSort.dir;
    });
  }, [
    filteredDealerRows,
    channelSort,
    channelId,
    channelGrid,
    priorByDealer,
    channelValue,
  ]);

  const displayChannels =
    channelId === 'all'
      ? channelGrid.allChannelTotals
      : channelGrid.allChannelTotals.filter((c) => c.id === channelId);

  const displayAllTotals = useMemo(() => {
    const channels = displayChannels.map((ch) => {
      const idx = channelGrid.columns.indexOf(ch.id);
      let total = 0;
      for (const row of filteredDealerRows) {
        total +=
          channelId === 'all'
            ? Number(row.cells[idx]) || 0
            : Number(row.total) || 0;
      }
      return { id: ch.id, name: ch.name, color: ch.color, total };
    });
    const total = filteredDealerRows.reduce(
      (s, row) => s + (Number(row.total) || 0),
      0
    );
    return { channels, total };
  }, [displayChannels, filteredDealerRows, channelGrid.columns, channelId]);

  const priorAllTotals = useMemo(() => {
    if (!compareActive) {
      return { channels: [], total: 0 };
    }
    const priorRows = (priorMatrix.rows || []).filter((row) => {
      if (!selectedDealerIdSet) return true;
      return selectedDealerIdSet.has(dealerKey(row.dealer));
    });
    let total = 0;
    const channels = displayChannels.map((ch) => {
      let sum = 0;
      for (const row of priorRows) {
        sum += channelValue(row, ch.id);
      }
      total += sum;
      return { id: ch.id, total: sum };
    });
    if (channelId !== 'all') {
      total = channels[0]?.total || 0;
    } else {
      total = 0;
      for (const row of priorRows) {
        total += Math.round(Number(row.total) || 0);
      }
    }
    return { channels, total };
  }, [
    compareActive,
    displayChannels,
    priorMatrix.rows,
    channelValue,
    channelId,
    selectedDealerIdSet,
  ]);

  const topChannel = useMemo(() => {
    const list =
      channelId === 'all'
        ? channelGrid.allChannelTotals
        : displayAllTotals.channels;
    return [...list].sort((a, b) => b.total - a.total)[0];
  }, [channelGrid, channelId, displayAllTotals]);

  const conditionKpi = useMemo(() => {
    const portfolioIds = new Set(
      (portfolioDealers || [])
        .map((d) => String(d.ga4CustomerId || '').trim())
        .filter(Boolean)
    );

    const byClient = new Map(); // client_id -> { new, used, unknown }
    for (const row of conditionTotalsRows) {
      const id = String(row.client_id || '').trim();
      if (!id) continue;
      if (selectedDealerIdSet) {
        if (!selectedDealerIdSet.has(id)) continue;
      } else if (portfolioIds.size && !portfolioIds.has(id)) {
        continue;
      }
      if (!byClient.has(id)) {
        byClient.set(id, { new: 0, used: 0, unknown: 0 });
      }
      const bucket = String(row.condition_bucket || '').toLowerCase();
      const views = Number(row.views) || 0;
      const slot = byClient.get(id);
      if (bucket.startsWith('new')) slot.new += views;
      else if (bucket.startsWith('used')) slot.used += views;
      else slot.unknown += views;
    }

    // When a channel is selected, scale each dealer's New/Used/Unknown by that
    // dealer's share of VDP on the selected channel (matrix), so the KPI stays
    // in sync with VDP Views without a slow channel join.
    const channelIdx =
      channelId === 'all' ? -1 : channelGrid.columns.indexOf(channelId);

    let newTotal = 0;
    let usedTotal = 0;
    let unknownTotal = 0;

    if (channelIdx < 0) {
      for (const slot of byClient.values()) {
        newTotal += slot.new;
        usedTotal += slot.used;
        unknownTotal += slot.unknown;
      }
    } else {
      for (const row of channelGrid.dealerRows || []) {
        const id = dealerKey(row.dealer);
        if (!id) continue;
        if (selectedDealerIdSet && !selectedDealerIdSet.has(id)) continue;
        const slot = byClient.get(id);
        if (!slot) continue;
        const dealerAll = Number(row.total) || 0;
        const dealerCh = Number(row.cells?.[channelIdx]) || 0;
        const scale = dealerAll > 0 ? dealerCh / dealerAll : 0;
        newTotal += slot.new * scale;
        usedTotal += slot.used * scale;
        unknownTotal += slot.unknown * scale;
      }
      newTotal = Math.round(newTotal);
      usedTotal = Math.round(usedTotal);
      unknownTotal = Math.round(unknownTotal);
    }

    return {
      newTotal,
      usedTotal,
      unknownTotal,
      combined: newTotal + usedTotal,
      ready: conditionSplitReady,
    };
  }, [
    conditionTotalsRows,
    selectedDealerIdSet,
    portfolioDealers,
    conditionSplitReady,
    channelId,
    channelGrid.columns,
    channelGrid.dealerRows,
  ]);

  const dealerSummaryRows = useMemo(() => {
    const pageCurMap = indexRowsByDealer(pageCur.rows);
    const pagePriMap = indexRowsByDealer(pagePri.rows);
    const vdpCurMap = indexRowsByDealer(vdpCur.rows);
    const vdpPriMap = indexRowsByDealer(vdpPri.rows);

    const keys = new Set([
      ...pageCurMap.keys(),
      ...vdpCurMap.keys(),
    ]);

    const rows = [];
    for (const key of keys) {
      const curPage = pageCurMap.get(key);
      const priPage = pagePriMap.get(key);
      const curVdp = vdpCurMap.get(key);
      const priVdp = vdpPriMap.get(key);
      const dealer =
        curPage?.dealer || curVdp?.dealer || priPage?.dealer || priVdp?.dealer;
      if (!dealer) continue;

      const pv1 = totalForRow(curPage, channelId);
      const pv0 = totalForRow(priPage, channelId);
      const vdp1 = totalForRow(curVdp, channelId);
      const vdp0 = totalForRow(priVdp, channelId);

      rows.push({
        id: key,
        dealer,
        name: dealer.name || 'Unnamed',
        vertical: dealer.dealerCategory || '—',
        pv1,
        pv0,
        pvmom: safeDiv(pv1 - pv0, pv0) * 100,
        vdp1,
        vdp0,
        vdpmom: safeDiv(vdp1 - vdp0, vdp0) * 100,
        rate: safeDiv(vdp1, pv1) * 100,
        error: curPage?.error || curVdp?.error || null,
      });
    }

    rows.sort((a, b) => {
      const av = a[sort.k];
      const bv = b[sort.k];
      if (typeof av === 'string') return av.localeCompare(bv) * sort.dir;
      return (av - bv) * sort.dir;
    });

    if (!selectedDealerIdSet) return rows;
    return rows.filter((r) => selectedDealerIdSet.has(r.id));
  }, [pageCur, pagePri, vdpCur, vdpPri, channelId, sort, selectedDealerIdSet]);

  const singleDealerId =
    selectedDealerIds.length === 1 ? selectedDealerIds[0] : null;
  const singleDealerRow = useMemo(() => {
    if (!singleDealerId) return null;
    return (
      filteredDealerRows.find((r) => dealerKey(r.dealer) === singleDealerId) ||
      null
    );
  }, [filteredDealerRows, singleDealerId]);

  /** Graph only: 1 dealer → bar views by channel; else line by dealer (incl. channel filter). */
  const chartMode = singleDealerId ? 'channel-bar' : 'dealer-line';

  const chartData = useMemo(() => {
    if (chartMode === 'channel-bar' && singleDealerRow) {
      const labels = channelGrid.columns || [];
      const curVals = labels.map((_, i) => Number(singleDealerRow.cells[i]) || 0);
      const priorRaw = priorByDealer.get(dealerKey(singleDealerRow.dealer));
      const priorVals = labels.map((name) => channelValue(priorRaw, name));

      const datasets = [
        {
          label: curLabel,
          data: curVals,
          backgroundColor: '#2563eb',
          borderColor: '#2563eb',
          borderRadius: 4,
          maxBarThickness: 42,
        },
      ];

      if (compareActive) {
        datasets.push({
          label: priLabel,
          data: priorVals,
          backgroundColor: '#94a3b8',
          borderColor: '#94a3b8',
          borderRadius: 4,
          maxBarThickness: 42,
        });
      }

      return { labels, datasets };
    }

    const ordered = [...filteredDealerRows]
      .filter((r) => !r.error)
      .sort((a, b) => b.total - a.total)
      .slice(0, 10);

    const labels = ordered.map((r) => r.dealer?.name || 'Dealer');
    const curVals = ordered.map((r) => r.total);
    const priorVals = ordered.map((r) =>
      totalForRow(priorByDealer.get(dealerKey(r.dealer)), channelId)
    );

    const datasets = [
      {
        label: curLabel,
        data: curVals,
        borderColor: '#2563eb',
        backgroundColor: 'rgba(37,99,235,.08)',
        fill: !compareActive,
        tension: 0.3,
        pointRadius: 3,
        pointHoverRadius: 5,
        pointBackgroundColor: '#2563eb',
        pointBorderColor: '#2563eb',
        borderWidth: 2.5,
      },
    ];

    if (compareActive) {
      datasets.push({
        label: priLabel,
        data: priorVals,
        borderColor: '#94a3b8',
        backgroundColor: 'transparent',
        borderDash: [5, 4],
        fill: false,
        tension: 0.3,
        pointRadius: 2,
        pointHoverRadius: 4,
        pointBackgroundColor: '#94a3b8',
        pointBorderColor: '#94a3b8',
        borderWidth: 2,
      });
    }

    return { labels, datasets };
  }, [
    chartMode,
    singleDealerRow,
    channelGrid.columns,
    filteredDealerRows,
    curLabel,
    priLabel,
    compareActive,
    channelId,
    priorByDealer,
    channelValue,
  ]);

  const chartOptions = useMemo(
    () => ({
      plugins: {
        legend: {
          display: true,
          position: 'bottom',
          labels: { boxWidth: 12, font: { size: 11 } },
        },
        tooltip: {
          callbacks: {
            label: (ctx) => `${ctx.dataset.label}: ${fmt(ctx.parsed.y)}`,
          },
        },
      },
      scales: {
        x: {
          ticks: {
            maxRotation: 45,
            minRotation: 45,
            autoSkip: false,
            font: { size: 10 },
            color: '#64748b',
          },
          grid: { display: false },
        },
        y: {
          beginAtZero: true,
          ticks: { callback: (v) => fmt(v), color: '#64748b' },
          grid: { color: 'rgba(148, 163, 184, 0.25)' },
        },
      },
    }),
    []
  );

  const chartWidth = Math.max(
    720,
    (chartData.labels?.length || 0) *
      (chartMode === 'channel-bar'
        ? compareActive
          ? 72
          : 64
        : compareActive
          ? 72
          : 56)
  );

  const chartTitle =
    chartMode === 'channel-bar'
      ? `${metricLabel} by Channel — ${
          singleDealerRow?.dealer?.name || 'Dealer'
        } · ${filterScopeLabel}`
      : `${metricLabel} by Dealer — Top 10 · ${filterScopeLabel}`;

  const chartSub = compareActive
    ? chartMode === 'channel-bar'
      ? `${curLabel} vs ${priLabel} (${compareModeLabel}) · bar by channel for selected dealer`
      : `${curLabel} vs ${priLabel} (${compareModeLabel}) · filtered to ${filterScopeLabel} · top 10 dealers`
    : chartMode === 'channel-bar'
      ? `${curLabel} · bar by channel for selected dealer`
      : `${curLabel} · filtered to ${filterScopeLabel} · top 10 dealers`;

  const openDealer = (dealer) => {
    if (dealer) pickClient(dealer);
    setLoading(true);
    setProgress({ completed: 0, total: compareActive ? 4 : 2 });
    router.push('/dashboard/overview');
  };

  const onSort = (k) => {
    setSort((prev) => ({
      k,
      dir: prev.k === k ? -prev.dir : k === 'name' ? 1 : -1,
    }));
  };

  const isBusy = dealersLoading || loading;
  const loadPercent = progress?.total
    ? Math.round((Number(progress.completed) / Number(progress.total)) * 100)
    : isBusy
      ? 0
      : null;
  const CHANNEL_COL_W = compareActive ? 110 : 150;
  const DEALER_COL_W = 200;
  const TOTAL_COL_W = compareActive ? 112 : 100;
  const freezeCols = compareActive ? 2 : 1;
  const channelValueCols = displayChannels.length * (compareActive ? 2 : 1);
  const tableMinWidth =
    DEALER_COL_W +
    TOTAL_COL_W * freezeCols +
    Math.max(channelValueCols, 1) * CHANNEL_COL_W;

  const periodSub = compareActive
    ? `${metricLabel} · ${curLabel} vs ${priLabel} (${compareModeLabel}) · filtered to ${filterScopeLabel} — click a dealer to open it.`
    : `${metricLabel}, ${curLabel} · filtered to ${filterScopeLabel} — click a dealer to open it.`;

  return (
    <div className={`vdp-view${isBusy ? ' vdp-view--card-loading' : ''}`}>
      <VdpLoadingCard active={isBusy} percent={loadPercent} />
      <Toolbar>
        <ToolbarGroup label="Metric">
          <Seg
            value={metric}
            options={METRIC_OPTS}
            onChange={(next) => {
              setMetric(next);
              setSort({ k: 'name', dir: 1 });
              setChannelSort({ k: 'name', dir: 1 });
            }}
          />
        </ToolbarGroup>
        <div className="vdp-toolbar-spacer" aria-hidden="true" />
        <ToolbarGroup>
          <DealerMultiFilter
            options={dealerFilterOptions}
            selectedIds={selectedDealerIds}
            onChange={setSelectedDealerIds}
            disabled={isBusy || !dealerFilterOptions.length}
            showLabel={false}
          />
        </ToolbarGroup>
        <ToolbarGroup>
          <Seg
            value={compareMode}
            options={VDP_COMPARE_MODES}
            onChange={toggleCompareMode}
          />
        </ToolbarGroup>
        <ToolbarGroup>
          <ChannelDropdown
            value={channelId}
            options={channelOptions}
            onChange={setChannelId}
            disabled={isBusy && !channelOptions.length}
          />
        </ToolbarGroup>
      </Toolbar>

      <div className="vdp-kpi-grid" style={{ gridTemplateColumns: 'repeat(5, minmax(0, 1fr))' }}>
        <Kpi
          label="Dealers Tracked"
          value={filteredDealerRows.length}
          sub={
            dealerCategoryFilter
              ? `${filterScopeLabel} · ${dealerCategoryFilter}`
              : filterScopeLabel
          }
        />
        <Kpi
          label={`${metricLabel} · ${curLabel}`}
          value={fmt(displayAllTotals.total)}
          sub={filterScopeLabel}
        />
        <Kpi
          label={`New + Used · ${curLabel}`}
          value={conditionKpi.ready ? fmt(conditionKpi.combined) : '…'}
          sub={
            conditionKpi.ready
              ? `New ${fmt(conditionKpi.newTotal)} · Used ${fmt(conditionKpi.usedTotal)} · Unknown ${fmt(conditionKpi.unknownTotal)}`
              : 'Loading condition split…'
          }
        />
        <Kpi
          label={`Top Channel · ${curLabel}`}
          value={topChannel?.name || '—'}
          sub={
            topChannel
              ? `${fmt(topChannel.total)} ${metricLabel.toLowerCase()}`
              : ''
          }
        />
        <Kpi
          label="Data source"
          value="Live API"
          sub={error ? 'Partial / check warning' : 'mv_ga4_channel_* · All Dealers'}
        />
      </div>

      {(dealersError || error) && (
        <div
          className="vdp-card"
          style={{
            marginBottom: 16,
            borderColor: '#fecaca',
            background: '#fef2f2',
            color: '#991b1b',
            fontSize: 13,
          }}
        >
          {dealersError || error}
        </div>
      )}

      <Card
        title={chartTitle}
        sub={chartSub}
        style={{ marginBottom: 16 }}
      >
        {!(chartData.labels || []).length ? (
          <div style={{ color: 'var(--vdp-muted)', fontSize: 13, padding: 12 }}>
            {chartMode === 'channel-bar'
              ? 'No channel data for this dealer.'
              : 'No dealer data for this period.'}
          </div>
        ) : (
          <div className="vdp-chart-scroll">
            <div
              className="vdp-chart-scroll-inner"
              style={{ width: chartWidth, minWidth: '100%' }}
            >
              <VdpChart
                type={chartMode === 'channel-bar' ? 'bar' : 'line'}
                data={chartData}
                options={chartOptions}
                fill
                height={280}
              />
            </div>
          </div>
        )}
      </Card>

      <Card
        title={`Channel Breakdown by Dealer — ${filterScopeLabel}`}
        sub={periodSub}
        style={{ marginBottom: 16 }}
      >
        {!channelGrid.dealerRows.length ? (
          <div style={{ color: 'var(--vdp-muted)', fontSize: 13, padding: 12 }}>
            No dealer channel data for this period.
            {!portfolioDealers.length
              ? ' No active dealers with GA4 IDs found.'
              : ''}
          </div>
        ) : (
          <>
            <div
              className={`vdp-channel-matrix vdp-table-scroll--10${
                compareActive ? ' vdp-channel-matrix--compare' : ''
              }`}
              style={{
                ['--freeze-dealer-w']: `${DEALER_COL_W}px`,
                ['--freeze-total-w']: `${TOTAL_COL_W}px`,
                ['--matrix-table-w']: `${tableMinWidth}px`,
              }}
            >
              <table
                className={`vdp-table vdp-table--channel-matrix${
                  compareActive ? ' vdp-table--channel-compare' : ''
                }`}
              >
                <colgroup>
                  <col className="vdp-col-dealer" style={{ width: DEALER_COL_W }} />
                  {compareActive ? (
                    <>
                      <col className="vdp-col-total" style={{ width: TOTAL_COL_W }} />
                      <col className="vdp-col-total" style={{ width: TOTAL_COL_W }} />
                    </>
                  ) : (
                    <col className="vdp-col-total" style={{ width: TOTAL_COL_W }} />
                  )}
                  {Array.from({ length: channelValueCols }).map((_, i) => (
                    <col key={i} style={{ width: CHANNEL_COL_W }} />
                  ))}
                </colgroup>
                <thead>
                  {compareActive ? (
                    <>
                      <tr>
                        <SortableTh
                          className="vdp-sticky-col vdp-sticky-col--0"
                          rowSpan={2}
                          sortKey="name"
                          channelSort={channelSort}
                          onChannelSort={onChannelSort}
                        >
                          Dealer
                        </SortableTh>
                        <th
                          className="vdp-th-group vdp-th-pair-end vdp-sticky-col vdp-sticky-col--total-head"
                          colSpan={2}
                        >
                          Total
                        </th>
                        {displayChannels.map((ch) => (
                          <th
                            key={ch.id}
                            colSpan={2}
                            className="vdp-th-group vdp-th-pair-end"
                          >
                            <span
                              className="vdp-legend-swatch"
                              style={{ background: ch.color }}
                            />
                            {ch.name}
                          </th>
                        ))}
                      </tr>
                      <tr>
                        <SortableTh
                          className="vdp-th-sub col-cur vdp-sticky-col vdp-sticky-col--1"
                          sortKey="total"
                          channelSort={channelSort}
                          onChannelSort={onChannelSort}
                        >
                          Current
                        </SortableTh>
                        <SortableTh
                          className="vdp-th-sub col-prev vdp-th-pair-end vdp-sticky-col vdp-sticky-col--2"
                          sortKey="totalPri"
                          channelSort={channelSort}
                          onChannelSort={onChannelSort}
                        >
                          Prior
                        </SortableTh>
                        {displayChannels.map((ch) => (
                          <Fragment key={ch.id}>
                            <SortableTh
                              className="vdp-th-sub col-cur"
                              sortKey={`ch:${ch.id}`}
                              channelSort={channelSort}
                              onChannelSort={onChannelSort}
                            >
                              Current
                            </SortableTh>
                            <SortableTh
                              className="vdp-th-sub col-prev vdp-th-pair-end"
                              sortKey={`chPri:${ch.id}`}
                              channelSort={channelSort}
                              onChannelSort={onChannelSort}
                            >
                              Prior
                            </SortableTh>
                          </Fragment>
                        ))}
                      </tr>
                    </>
                  ) : (
                    <tr>
                      <SortableTh
                        className="vdp-sticky-col vdp-sticky-col--0"
                        sortKey="name"
                        channelSort={channelSort}
                        onChannelSort={onChannelSort}
                      >
                        Dealer
                      </SortableTh>
                      <SortableTh
                        className="right vdp-sticky-col vdp-sticky-col--1"
                        sortKey="total"
                        channelSort={channelSort}
                        onChannelSort={onChannelSort}
                      >
                        Total
                      </SortableTh>
                      {displayChannels.map((ch) => (
                        <SortableTh
                          key={ch.id}
                          className="right"
                          sortKey={`ch:${ch.id}`}
                          channelSort={channelSort}
                          onChannelSort={onChannelSort}
                        >
                          <span
                            className="vdp-legend-swatch"
                            style={{ background: ch.color }}
                          />
                          {ch.name}
                        </SortableTh>
                      ))}
                    </tr>
                  )}
                </thead>
                <tbody>
                  {sortedChannelRows.map(({ dealer, cells, total, error: rowError }) => {
                    const shownCells =
                      channelId === 'all'
                        ? cells
                        : [cells[channelGrid.columns.indexOf(channelId)] || 0];
                    const priorRow = priorByDealer.get(dealerKey(dealer));
                    const priorTotal =
                      channelId === 'all'
                        ? Math.round(Number(priorRow?.total) || 0)
                        : channelValue(priorRow, channelId);
                    return (
                      <tr
                        key={dealer?.id || dealer?.ga4CustomerId || dealer?.name}
                        className="vdp-row-click"
                        onClick={() => openDealer(dealer)}
                      >
                        <td className="vdp-dealer-name vdp-sticky-col vdp-sticky-col--0">
                          {dealer?.name || 'Unnamed'}
                          {dealer?.dealerCategory ? (
                            <span className="vdp-vert-tag">
                              {dealer.dealerCategory}
                            </span>
                          ) : null}
                          {rowError ? (
                            <span className="vdp-vert-tag" style={{ color: '#dc2626' }}>
                              {rowError}
                            </span>
                          ) : null}
                        </td>
                        {compareActive ? (
                          <>
                            <td
                              className="right mono col-cur vdp-sticky-col vdp-sticky-col--1"
                              style={{ fontWeight: 700 }}
                            >
                              {fmt(total)}
                            </td>
                            <td
                              className="right mono col-prev vdp-sticky-col vdp-sticky-col--2"
                              style={{ fontWeight: 700 }}
                            >
                              {fmt(priorTotal)}
                            </td>
                          </>
                        ) : (
                          <td
                            className="right mono vdp-sticky-col vdp-sticky-col--1"
                            style={{ fontWeight: 700 }}
                          >
                            {fmt(total)}
                          </td>
                        )}
                        {compareActive
                          ? displayChannels.map((ch) => {
                              const curIdx = channelGrid.columns.indexOf(ch.id);
                              const curVal =
                                channelId === 'all'
                                  ? cells[curIdx] || 0
                                  : shownCells[0] || 0;
                              const priVal = channelValue(priorRow, ch.id);
                              return (
                                <Fragment key={ch.id}>
                                  <td className="right mono col-cur">
                                    {fmt(curVal)}
                                  </td>
                                  <td className="right mono col-prev">
                                    {fmt(priVal)}
                                  </td>
                                </Fragment>
                              );
                            })
                          : shownCells.map((v, i) => (
                              <td key={i} className="right mono">
                                {fmt(v)}
                              </td>
                            ))}
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr>
                    <td className="vdp-sticky-col vdp-sticky-col--0">
                      {selectedDealerIdSet ? 'Selected dealers' : 'All Dealers'}
                    </td>
                    {compareActive ? (
                      <>
                        <td
                          className="right mono col-cur vdp-sticky-col vdp-sticky-col--1"
                        >
                          {fmt(displayAllTotals.total)}
                        </td>
                        <td
                          className="right mono col-prev vdp-sticky-col vdp-sticky-col--2"
                        >
                          {fmt(priorAllTotals.total)}
                        </td>
                      </>
                    ) : (
                      <td
                        className="right mono vdp-sticky-col vdp-sticky-col--1"
                      >
                        {fmt(displayAllTotals.total)}
                      </td>
                    )}
                    {compareActive
                      ? displayAllTotals.channels.map((ct) => {
                          const pri = priorAllTotals.channels.find(
                            (c) => c.id === ct.id
                          );
                          return (
                            <Fragment key={ct.id}>
                              <td className="right mono col-cur">
                                {fmt(ct.total)}
                              </td>
                              <td className="right mono col-prev">
                                {fmt(pri?.total || 0)}
                              </td>
                            </Fragment>
                          );
                        })
                      : displayAllTotals.channels.map((ct) => (
                          <td key={ct.id} className="right mono">
                            {fmt(ct.total)}
                          </td>
                        ))}
                  </tr>
                </tfoot>
              </table>
            </div>
            {filteredDealerRows.length > 10 && (
              <div className="vdp-scroll-hint">
                Showing 10 of {filteredDealerRows.length} dealers — scroll for more
              </div>
            )}
          </>
        )}
      </Card>

      <Card
        title={
          <>
            All Dealers — {filterScopeLabel}{' '}
            <span style={{ color: 'var(--vdp-muted)', fontWeight: 400, fontSize: 12 }}>
              — click a row to open that dealer
            </span>
          </>
        }
        sub={
          compareActive
            ? `Comparing ${curLabel} to ${priLabel} (${compareModeLabel}) · filtered to ${filterScopeLabel}`
            : `${curLabel} · select MoM or PoP to compare · filtered to ${filterScopeLabel}`
        }
      >
        {!dealerSummaryRows.length ? (
          <div style={{ color: 'var(--vdp-muted)', fontSize: 13, padding: 12 }}>
            No dealer comparison data for this period.
          </div>
        ) : (
          <>
            <div className="vdp-table-scroll vdp-table-scroll--10">
              <table className="vdp-table">
                <thead>
                  <tr>
                    {(
                      metric === 'page'
                        ? compareActive
                          ? [
                              ['name', 'Dealer'],
                              // ['vertical', 'Vertical'],
                              ['pv1', 'Page Views (Current)'],
                              ['pv0', 'Page Views (Prior)'],
                              ['pvmom', comparePctLabel],
                            ]
                          : [
                              ['name', 'Dealer'],
                              // ['vertical', 'Vertical'],
                              ['pv1', 'Page Views'],
                            ]
                        : compareActive
                          ? [
                              ['name', 'Dealer'],
                              // ['vertical', 'Vertical'],
                              ['vdp1', 'VDP Views (Current)'],
                              ['vdp0', 'VDP Views (Prior)'],
                              ['vdpmom', comparePctLabel],
                              ['rate', 'VDP Rate'],
                            ]
                          : [
                              ['name', 'Dealer'],
                              // ['vertical', 'Vertical'],
                              ['vdp1', 'VDP Views'],
                              ['rate', 'VDP Rate'],
                            ]
                    ).map(([k, label]) => (
                      <th
                        key={k}
                        className={`${['pv1', 'pv0', 'pvmom', 'vdp1', 'vdp0', 'vdpmom', 'rate'].includes(k) ? 'right' : ''} ${sort.k === k ? 'sorted' : ''}`}
                        onClick={() => onSort(k)}
                      >
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {dealerSummaryRows.map((r) => (
                    <tr
                      key={r.id}
                      className="vdp-row-click"
                      onClick={() => openDealer(r.dealer)}
                    >
                      <td className="vdp-dealer-name">
                        {r.name}
                        {r.error ? (
                          <span className="vdp-vert-tag" style={{ color: '#dc2626' }}>
                            {r.error}
                          </span>
                        ) : null}
                      </td>
                      {/* <td>{r.vertical}</td> */}
                      {metric === 'page' ? (
                        <>
                          <td className="right mono">{fmt(r.pv1)}</td>
                          {compareActive && (
                            <>
                              <td className="right mono">{fmt(r.pv0)}</td>
                              <td className={`right vdp-delta ${momClass(r.pvmom / 100)}`}>
                                {r.pv0 < 1 ? '—' : pct(r.pvmom)}
                              </td>
                            </>
                          )}
                        </>
                      ) : (
                        <>
                          <td className="right mono">{fmt(r.vdp1)}</td>
                          {compareActive && (
                            <>
                              <td className="right mono">{fmt(r.vdp0)}</td>
                              <td className={`right vdp-delta ${momClass(r.vdpmom / 100)}`}>
                                {r.vdp0 < 1 ? '—' : pct(r.vdpmom)}
                              </td>
                            </>
                          )}
                          <td className="right mono">{r.rate.toFixed(1)}%</td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {dealerSummaryRows.length > 10 && (
              <div className="vdp-scroll-hint">
                Showing 10 of {dealerSummaryRows.length} dealers — scroll for more
              </div>
            )}
          </>
        )}
      </Card>
    </div>
  );
}
