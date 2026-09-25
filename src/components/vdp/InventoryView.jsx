'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useClient } from '@/components/dashboard/ClientContext';
import { fetchInventoryPerformance } from '@/lib/api/inventoryPerformance';
import { colorForChannel } from '@/lib/ga4/channelDisplay';
import { fmt, safeDiv } from '@/lib/vdp/aggregates';
import { isAllDealerClient } from '@/lib/dashboard/allDealers';
import VdpChart from './VdpChart';
import { VdpLoadingCard } from './VdpLoadingBanner';
import { useVdpDateRange } from './VdpDateRangeContext';
import { useSoftLoadPercent } from './useSoftLoadPercent';
import { Card, Kpi, Toolbar, ToolbarGroup, VdpMultiFilter } from './VdpUi';

const COND_OPTS = [
  { value: 'New', label: 'New' },
  { value: 'Used', label: 'Used' },
];

const VISIBLE_ROWS = 15;

const CHART_LIMIT_OPTS = [
  { value: 'all', label: 'All' },
  { value: '15', label: 'Top 15' },
  { value: '10', label: 'Top 10' },
];

function chartLimitN(limit) {
  if (limit === '15') return 15;
  if (limit === '10') return 10;
  return null;
}

function applyChartLimit(rows, limit) {
  const n = chartLimitN(limit);
  return n == null ? rows : rows.slice(0, n);
}

const LOAD_STAGE_LABEL = {
  inventory: 'Loading inventory…',
  compare: 'Loading compare period…',
  filters: 'Loading filters…',
  channels: 'Loading channels…',
  done: 'Ready',
};

function conditionClass(condition) {
  const c = String(condition || '').toLowerCase();
  if (c.startsWith('new')) return 'new';
  if (c.startsWith('used')) return 'used';
  return 'used';
}

/** Days on lot (first_seen → last_seen; still-live units count through today). */
function fmtAge(age) {
  return age == null ? '—' : `${age}d`;
}

function channelSortValue(row, key) {
  if (String(key).startsWith('ch:')) {
    const name = String(key).slice(3);
    return Number(row.channelViews?.[name]) || 0;
  }
  return row[key];
}

export default function InventoryView() {
  const { client, loading: dealersLoading, isAllDealer } = useClient();
  const {
    from: curFrom,
    to: curTo,
    priorFrom: priFrom,
    priorTo: priTo,
    curLabel,
    priLabel,
  } = useVdpDateRange();
  const [makes, setMakes] = useState([]);
  const [conds, setConds] = useState([]);
  const [cats, setCats] = useState([]);
  const [channels, setChannels] = useState([]);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [sort, setSort] = useState({ k: 'vdp1', dir: -1 });
  const [rows, setRows] = useState([]);
  const [makeOptions, setMakeOptions] = useState([]);
  const [catOptions, setCatOptions] = useState([]);
  const [channelOptions, setChannelOptions] = useState([]);
  const [channelColumns, setChannelColumns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadPercent, setLoadPercent] = useState(0);
  const [loadLabel, setLoadLabel] = useState('Loading...');
  const [error, setError] = useState(null);
  const [makeLimit, setMakeLimit] = useState('all');
  const [catLimit, setCatLimit] = useState('all');
  const cancelRef = useRef(false);
  const loadGenRef = useRef(0);
  const searchTimer = useRef(null);

  const ga4Id = String(client?.ga4CustomerId || '').trim();
  const canLoad = Boolean(ga4Id) && !isAllDealerClient(client) && !isAllDealer;

  const load = useCallback(async () => {
    if (!canLoad || !curFrom || !curTo) {
      setRows([]);
      setMakeOptions([]);
      setCatOptions([]);
      setChannelOptions([]);
      setChannelColumns([]);
      setLoading(false);
      setLoadPercent(0);
      return;
    }

    const loadGen = loadGenRef.current + 1;
    loadGenRef.current = loadGen;
    cancelRef.current = false;
    const isStale = () => cancelRef.current || loadGenRef.current !== loadGen;

    setLoading(true);
    setLoadPercent(2);
    setLoadLabel('Loading inventory…');
    setChannelColumns([]);
    setChannelOptions([]);
    setError(null);

    try {
      const result = await fetchInventoryPerformance({
        clientId: ga4Id,
        from: curFrom,
        to: curTo,
        priorFrom: priFrom,
        priorTo: priTo,
        make: makes,
        condition: conds,
        category: cats,
        channel: channels,
        search,
        onCancelCheck: () => isStale(),
        onProgress: (prog) => {
          if (isStale()) return;
          const pct = Number(prog?.percent);
          if (!Number.isNaN(pct)) setLoadPercent(Math.max(2, Math.min(99, pct)));
          const stage = prog?.stage;
          if (stage && LOAD_STAGE_LABEL[stage]) {
            setLoadLabel(LOAD_STAGE_LABEL[stage]);
          }
        },
        onCoreReady: (core) => {
          if (isStale()) return;
          // Unlock UI as soon as inventory + age land — channels fill in behind.
          setRows(core.rows || []);
          setMakeOptions(core.makes || []);
          setCatOptions(core.categories || []);
          setChannelColumns([]);
          setChannelOptions([]);
          setLoadPercent(70);
          setLoadLabel('Loading channels…');
          setLoading(false);
        },
        onUpdate: (next) => {
          if (isStale()) return;
          setRows(next.rows || []);
          setMakeOptions(next.makes || []);
          setCatOptions(next.categories || []);
          if (Array.isArray(next.channelColumns)) {
            setChannelOptions(next.channels || []);
            setChannelColumns(next.channelColumns);
            if (next.channelColumns.length > 0) {
              setLoadPercent(100);
              setLoadLabel('Ready');
            }
          }
        },
      });
      if (isStale()) return;
      setRows(result.rows || []);
      setMakeOptions(result.makes || []);
      setCatOptions(result.categories || []);
      setChannelOptions(result.channels || []);
      setChannelColumns(result.channelColumns || []);
      setLoadPercent(100);
      setLoadLabel('Ready');
    } catch (err) {
      if (!isStale()) {
        setError(err?.message || 'Failed to load inventory performance.');
        setRows([]);
      }
    } finally {
      if (!isStale()) {
        setLoading(false);
        setLoadPercent(0);
      }
    }
  }, [canLoad, ga4Id, curFrom, curTo, priFrom, priTo, makes, conds, cats, channels, search]);

  useEffect(() => {
    if (dealersLoading) return undefined;
    load();
    return () => {
      cancelRef.current = true;
    };
  }, [dealersLoading, load]);

  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      setSearch(searchInput.trim());
    }, 300);
    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    };
  }, [searchInput]);

  const sorted = useMemo(() => {
    const list = [...rows];
    list.sort((a, b) => {
      const av = channelSortValue(a, sort.k);
      const bv = channelSortValue(b, sort.k);
      if (typeof av === 'string' || typeof bv === 'string') {
        return String(av ?? '').localeCompare(String(bv ?? '')) * sort.dir;
      }
      const an = av == null || Number.isNaN(Number(av)) ? null : Number(av);
      const bn = bv == null || Number.isNaN(Number(bv)) ? null : Number(bv);
      if (an == null && bn == null) return 0;
      if (an == null) return 1;
      if (bn == null) return -1;
      return (an - bn) * sort.dir;
    });
    return list;
  }, [rows, sort]);

  /** When Channel filter is set, show those columns; else all with traffic. */
  const visibleChannelColumns = useMemo(() => {
    if (channels.length > 0) {
      const selected = new Set(channels.map((c) => String(c)));
      const fromSelected = channelColumns.filter((c) => selected.has(c));
      // Keep any selected channels missing from traffic list (show as 0s).
      for (const c of channels) {
        if (!fromSelected.includes(c)) fromSelected.push(c);
      }
      return fromSelected;
    }
    return channelColumns;
  }, [channelColumns, channels]);

  const baseColumns = useMemo(
    () => [
      ['vin', 'VIN'],
      ['make', 'Make'],
      ['model', 'Model'],
      ['year', 'Year'],
      ['condition', 'Cond.'],
      ['category', 'Type'],
      ['age', 'Age'],
      ['vdp1', 'VDP (Current)'],
    ],
    []
  );

  const tableColumns = useMemo(
    () => [
      ...baseColumns,
      ...visibleChannelColumns.map((name) => [`ch:${name}`, name]),
    ],
    [baseColumns, visibleChannelColumns]
  );

  const totalVdp1 = sorted.reduce((s, r) => s + r.vdp1, 0);
  const totalVdp0 = sorted.reduce((s, r) => s + r.vdp0, 0);
  const zeroView = sorted.filter((r) => r.vdp1 < 1).length;

  /** Grand totals per channel column for the table footer. */
  const channelTotals = useMemo(() => {
    const totals = new Map(visibleChannelColumns.map((ch) => [ch, 0]));
    for (const r of sorted) {
      for (const ch of visibleChannelColumns) {
        totals.set(ch, totals.get(ch) + (Number(r.channelViews?.[ch]) || 0));
      }
    }
    return totals;
  }, [sorted, visibleChannelColumns]);

  const makeData = useMemo(() => {
    const byMake = new Map();
    for (const r of sorted) {
      const name = r.make || 'Unknown';
      if (!byMake.has(name)) {
        byMake.set(name, {
          name,
          neu: 0,
          used: 0,
          total: 0,
          neuUnits: 0,
          usedUnits: 0,
        });
      }
      const bucket = byMake.get(name);
      const views = Number(r.vdp1) || 0;
      const cond = String(r.condition || '').toLowerCase();
      if (cond.startsWith('new')) {
        bucket.neu += views;
        bucket.neuUnits += 1;
      } else {
        bucket.used += views;
        bucket.usedUnits += 1;
      }
      bucket.total += views;
    }

    const totals = applyChartLimit(
      [...byMake.values()]
        .filter((r) => r.total > 0)
        .sort((a, b) => b.total - a.total),
      makeLimit
    );

    const hasNew = totals.some((r) => r.neu > 0);
    const hasUsed = totals.some((r) => r.used > 0);
    const datasets = [];
    if (hasNew) {
      datasets.push({
        label: 'New',
        // null = skip drawing when that make has no New inventory
        data: totals.map((r) => (r.neu > 0 ? r.neu : null)),
        units: totals.map((r) => (r.neu > 0 ? r.neuUnits : 0)),
        backgroundColor: '#16a34a',
        borderRadius: 4,
        stack: 'cond',
      });
    }
    if (hasUsed) {
      datasets.push({
        label: 'Used',
        data: totals.map((r) => (r.used > 0 ? r.used : null)),
        units: totals.map((r) => (r.used > 0 ? r.usedUnits : 0)),
        backgroundColor: '#3730a3',
        borderRadius: 4,
        stack: 'cond',
      });
    }

    return {
      labels: totals.map((r) => r.name),
      datasets,
    };
  }, [sorted, makeLimit]);

  const makeOptionsChart = useMemo(
    () => ({
      layout: { padding: { top: 4, right: 8, bottom: 0, left: 0 } },
      // Nearest category column — works even when bars are 1px wide at the tail.
      interaction: { mode: 'index', intersect: false, axis: 'x' },
      hover: { mode: 'index', intersect: false, axis: 'x' },
      plugins: {
        legend: {
          position: 'bottom',
          labels: { boxWidth: 12, boxHeight: 12, padding: 12, font: { size: 11 } },
        },
        tooltip: {
          enabled: true,
          mode: 'index',
          intersect: false,
          position: 'nearest',
          filter: (item) => {
            const v = item.parsed?.y;
            return v != null && Number(v) > 0;
          },
          itemSort: (a, b) => (Number(b.parsed?.y) || 0) - (Number(a.parsed?.y) || 0),
          callbacks: {
            label: (ctx) => {
              const v = ctx.parsed?.y;
              if (v == null || Number(v) <= 0) return null;
              const units = Number(ctx.dataset.units?.[ctx.dataIndex]) || 0;
              return ` ${ctx.dataset.label}: ${fmt(v)} VDP views · ${fmt(units)} units`;
            },
          },
        },
      },
      scales: {
        x: {
          stacked: true,
          grid: { display: false },
          border: { display: false },
          ticks: {
            font: { size: 10 },
            color: '#64748b',
            maxRotation: 55,
            minRotation: 0,
            autoSkip: false,
          },
        },
        y: {
          stacked: true,
          beginAtZero: true,
          grid: { color: 'rgba(148, 163, 184, 0.25)', drawBorder: false },
          border: { display: false },
          ticks: {
            color: '#64748b',
            font: { size: 11 },
            callback: (v) => fmt(v),
          },
        },
      },
    }),
    []
  );

  const catNames = useMemo(() => {
    const fromRows = [...new Set(sorted.map((r) => r.category))];
    return catOptions.length ? catOptions : fromRows;
  }, [sorted, catOptions]);

  const catData = useMemo(() => {
    const totals = applyChartLimit(
      catNames
        .map((c) => {
          const inType = sorted.filter((r) => r.category === c);
          return {
            name: c,
            value: inType.reduce((s, r) => s + r.vdp1, 0),
            units: inType.length,
          };
        })
        .filter((r) => r.value > 0)
        .sort((a, b) => b.value - a.value),
      catLimit
    );

    const max = Math.max(...totals.map((r) => r.value), 1);
    return {
      labels: totals.map((r) => r.name),
      datasets: [
        {
          label: 'VDP Views',
          data: totals.map((r) => r.value),
          units: totals.map((r) => r.units),
          backgroundColor: totals.map((r) => {
            const t = r.value / max;
            return `rgba(8, 145, 178, ${0.45 + t * 0.5})`;
          }),
          borderColor: '#0e7490',
          borderWidth: 0,
          borderRadius: 8,
          borderSkipped: false,
          barThickness: 'flex',
          maxBarThickness: 28,
          categoryPercentage: 0.72,
          barPercentage: 0.9,
        },
      ],
    };
  }, [sorted, catNames, catLimit]);

  const catOptionsChart = useMemo(
    () => ({
      indexAxis: 'y',
      layout: { padding: { top: 4, right: 28, bottom: 4, left: 0 } },
      interaction: { mode: 'index', intersect: false, axis: 'y' },
      hover: { mode: 'index', intersect: false, axis: 'y' },
      plugins: {
        legend: { display: false },
        tooltip: {
          enabled: true,
          mode: 'index',
          intersect: false,
          position: 'nearest',
          backgroundColor: '#0f172a',
          titleFont: { size: 12, weight: '600' },
          bodyFont: { size: 12 },
          padding: 10,
          cornerRadius: 8,
          filter: (item) => {
            const v = item.parsed?.x;
            return v != null && Number(v) > 0;
          },
          callbacks: {
            label: (ctx) => {
              const v = ctx.parsed?.x;
              if (v == null || Number(v) <= 0) return null;
              const units = Number(ctx.dataset.units?.[ctx.dataIndex]) || 0;
              return ` ${fmt(v)} VDP views · ${fmt(units)} units`;
            },
          },
        },
      },
      scales: {
        x: {
          grid: { color: 'rgba(148, 163, 184, 0.25)', drawBorder: false },
          border: { display: false },
          ticks: {
            font: { size: 11 },
            color: '#64748b',
            callback: (v) => fmt(v),
            maxTicksLimit: 5,
          },
        },
        y: {
          grid: { display: false },
          border: { display: false },
          ticks: {
            font: { size: 11, weight: '500' },
            color: '#334155',
            autoSkip: false,
          },
        },
      },
    }),
    []
  );

  const onSort = (k, dir) => {
    setSort((prev) => {
      if (dir === 1 || dir === -1) return { k, dir };
      return {
        k,
        dir: prev.k === k ? -prev.dir : -1,
      };
    });
  };

  const isBusy = dealersLoading || loading;
  const softPercent = useSoftLoadPercent(isBusy);
  const overlayPercent = (() => {
    if (!isBusy) return null;
    if (dealersLoading) return softPercent ?? 5;
    const staged = Number(loadPercent) || 0;
    const soft = Number(softPercent) || 0;
    // Keep the percent climbing smoothly between stage jumps (same feel as other tabs).
    return Math.min(99, Math.max(staged, soft, 5));
  })();

  if (!dealersLoading && (!client || isAllDealer || !ga4Id)) {
    return (
      <div className="vdp-view">
        <div className="vdp-card" style={{ padding: 20 }}>
          <h3>Select a dealer</h3>
          <div className="vdp-cardsub" style={{ marginBottom: 0 }}>
            Open All Dealers and click a dealer, or pick one from the dealer bar above.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`vdp-view${isBusy ? ' vdp-view--card-loading' : ''}`}>
      <VdpLoadingCard
        active={isBusy}
        label={dealersLoading ? 'Loading dealers…' : loadLabel}
        percent={overlayPercent}
      />
      <Toolbar>
        <ToolbarGroup label="Channel">
          <VdpMultiFilter
            allLabel="All Channels"
            noun="channels"
            options={channelOptions}
            selected={channels}
            onChange={setChannels}
          />
        </ToolbarGroup>
        <ToolbarGroup label="Make">
          <VdpMultiFilter
            allLabel="All Makes"
            noun="makes"
            options={makeOptions}
            selected={makes}
            onChange={setMakes}
          />
        </ToolbarGroup>
        <ToolbarGroup label="Condition">
          <VdpMultiFilter
            allLabel="All"
            noun="conditions"
            options={COND_OPTS}
            selected={conds}
            onChange={setConds}
            searchable={false}
          />
        </ToolbarGroup>
        <ToolbarGroup label="Type">
          <VdpMultiFilter
            allLabel="All Types"
            noun="types"
            options={catOptions}
            selected={cats}
            onChange={setCats}
          />
        </ToolbarGroup>
        <ToolbarGroup label="Search">
          <input
            type="text"
            className="vdp-search"
            placeholder="VIN, model..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
        </ToolbarGroup>
      </Toolbar>

      {error && (
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
          {error}
        </div>
      )}

      <div className="vdp-kpi-grid">
        <Kpi
          label={`VDP Views · ${curLabel}`}
          value={fmt(totalVdp1)}
          delta={safeDiv(totalVdp1 - totalVdp0, totalVdp0) * 100}
          sub={`vs ${fmt(totalVdp0)} (${priLabel})`}
        />
        <Kpi
          label="Avg VDP Views / Vehicle"
          value={fmt(safeDiv(totalVdp1, sorted.length))}
          sub={`${fmt(sorted.length)} vehicles in view (incl. 0-view)`}
        />
        <Kpi
          label="Vehicles w/ 0 VDP Views"
          value={fmt(zeroView)}
          sub={
            zeroView > 0
              ? `${fmt(zeroView)} of ${fmt(sorted.length)} · consider photos / pricing`
              : 'All vehicles getting views'
          }
        />
      </div>

      <div className="vdp-grid-2 vdp-grid-2--inv">
        <Card
          className="vdp-card--chart"
          title="VDP Views by Make"
          sub="New vs Used · by VDP (current period)"
          actions={
            <select
              className="vdp-top-vehicles-select"
              value={makeLimit}
              onChange={(e) => setMakeLimit(e.target.value)}
              aria-label="Make chart limit"
            >
              {CHART_LIMIT_OPTS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          }
        >
          {!(makeData.labels || []).length ? (
            <div style={{ color: 'var(--vdp-muted)', fontSize: 13, padding: 12 }}>
              No make data for these filters.
            </div>
          ) : (
            <VdpChart
              key={`inv-make-${curFrom}-${curTo}-${makeLimit}-${makes.join(',')}-${conds.join(',')}-${(makeData.labels || []).join('|')}`}
              type="bar"
              data={makeData}
              options={makeOptionsChart}
              fill
              animate
            />
          )}
        </Card>
        <Card
          className="vdp-card--chart"
          title="VDP Views by Types"
          sub="Current comparison period"
          actions={
            <select
              className="vdp-top-vehicles-select"
              value={catLimit}
              onChange={(e) => setCatLimit(e.target.value)}
              aria-label="Type chart limit"
            >
              {CHART_LIMIT_OPTS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          }
        >
          {!(catData.labels || []).length ? (
            <div style={{ color: 'var(--vdp-muted)', fontSize: 13, padding: 12 }}>
              No type data for these filters.
            </div>
          ) : (
            <VdpChart
              key={`inv-cat-${curFrom}-${curTo}-${catLimit}-${cats.join(',')}-${(catData.labels || []).join('|')}`}
              type="bar"
              data={catData}
              options={catOptionsChart}
              fill
              animate
            />
          )}
        </Card>
      </div>

      <Card
        title={
          <>
            Inventory Detail{' '}
            <span style={{ color: 'var(--vdp-muted)', fontWeight: 400, fontSize: 12 }}>
              ({sorted.length} vehicles)
            </span>
          </>
        }
      >
        <>
            <div className="vdp-table-scroll vdp-table-scroll--15 vdp-table-scroll--total">
              <table
                className="vdp-table vdp-inv-detail"
                style={{
                  ['--inv-col-vin']: '168px',
                  ['--inv-col-make']: '110px',
                  ['--inv-col-model']: '120px',
                  ['--inv-col-year']: '56px',
                  ['--inv-col-cond']: '72px',
                  ['--inv-col-cat']: '120px',
                  ['--inv-col-age']: '56px',
                }}
              >
                <thead>
                  <tr>
                    {tableColumns.map(([k, label], colIdx) => {
                      const active = sort.k === k;
                      const isRight =
                        k === 'age' ||
                        k === 'vdp1' ||
                        String(k).startsWith('ch:');
                      const channelName = String(k).startsWith('ch:')
                        ? String(k).slice(3)
                        : null;
                      const freezeIdx = colIdx <= 6 ? colIdx : -1;
                      return (
                        <th
                          key={k}
                          className={`vdp-th-sortable ${isRight ? 'right' : ''} ${
                            active ? 'sorted' : ''
                          } ${
                            freezeIdx >= 0
                              ? `vdp-inv-sticky vdp-inv-sticky--${freezeIdx}`
                              : ''
                          }`}
                          onClick={() => onSort(k)}
                          title={channelName || label}
                        >
                          <div className="vdp-col-sort">
                            <span className="vdp-col-sort-label">
                              {channelName ? (
                                <>
                                  <span
                                    className="vdp-legend-swatch"
                                    style={{
                                      background: colorForChannel(
                                        channelName,
                                        visibleChannelColumns.indexOf(channelName)
                                      ),
                                      marginRight: 6,
                                      verticalAlign: 'middle',
                                    }}
                                  />
                                  {label}
                                </>
                              ) : (
                                label
                              )}
                            </span>
                            <span className="vdp-col-sort-arrows" aria-hidden="true">
                              <button
                                type="button"
                                className={active && sort.dir === 1 ? 'active' : ''}
                                aria-label={`Sort ${label} low to high`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onSort(k, 1);
                                }}
                              >
                                ▲
                              </button>
                              <button
                                type="button"
                                className={active && sort.dir === -1 ? 'active' : ''}
                                aria-label={`Sort ${label} high to low`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onSort(k, -1);
                                }}
                              >
                                ▼
                              </button>
                            </span>
                          </div>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {sorted.length === 0 ? (
                    <tr>
                      <td
                        colSpan={Math.max(8, tableColumns.length)}
                        style={{
                          textAlign: 'center',
                          color: 'var(--vdp-muted)',
                          padding: 20,
                        }}
                      >
                        No vehicles match these filters
                      </td>
                    </tr>
                  ) : (
                    sorted.map((r) => (
                      <tr key={r._key}>
                        <td className="mono vdp-inv-sticky vdp-inv-sticky--0">
                          {r.vin || r.stock || '—'}
                        </td>
                        <td className="vdp-inv-sticky vdp-inv-sticky--1">{r.make}</td>
                        <td className="vdp-inv-sticky vdp-inv-sticky--2">{r.model}</td>
                        <td className="vdp-inv-sticky vdp-inv-sticky--3">{r.year}</td>
                        <td className="vdp-inv-sticky vdp-inv-sticky--4">
                          <span className={`vdp-tag ${conditionClass(r.condition)}`}>
                            {r.condition}
                          </span>
                        </td>
                        <td className="vdp-inv-sticky vdp-inv-sticky--5">{r.category}</td>
                        <td className="right mono vdp-inv-sticky vdp-inv-sticky--6">
                          {fmtAge(r.age)}
                        </td>
                        <td className="right mono">{fmt(r.vdp1)}</td>
                        {visibleChannelColumns.map((ch) => {
                          const n = Number(r.channelViews?.[ch]) || 0;
                          return (
                            <td key={`${r._key}:${ch}`} className="right mono">
                              {n > 0 ? fmt(n) : '—'}
                            </td>
                          );
                        })}
                      </tr>
                    ))
                  )}
                </tbody>
                {sorted.length > 0 && (
                  <tfoot>
                    <tr>
                      <td className="vdp-inv-sticky vdp-inv-sticky--0">
                        Grand Total
                      </td>
                      <td className="vdp-inv-sticky vdp-inv-sticky--1" />
                      <td className="vdp-inv-sticky vdp-inv-sticky--2" />
                      <td className="vdp-inv-sticky vdp-inv-sticky--3" />
                      <td className="vdp-inv-sticky vdp-inv-sticky--4" />
                      <td className="vdp-inv-sticky vdp-inv-sticky--5" />
                      <td className="right mono vdp-inv-sticky vdp-inv-sticky--6" />
                      <td className="right mono">{fmt(totalVdp1)}</td>
                      {visibleChannelColumns.map((ch) => {
                        const n = Number(channelTotals.get(ch)) || 0;
                        return (
                          <td key={`total:${ch}`} className="right mono">
                            {n > 0 ? fmt(n) : '—'}
                          </td>
                        );
                      })}
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
            {sorted.length > VISIBLE_ROWS && (
              <div className="vdp-scroll-hint">
                Showing {VISIBLE_ROWS} of {sorted.length} vehicles — scroll for more
              </div>
            )}
          </>
      </Card>
    </div>
  );
}
