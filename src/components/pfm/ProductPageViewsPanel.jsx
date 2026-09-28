'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  fetchPfmProductChannelMatrix,
  fetchPfmProductOverview,
} from '@/lib/api/pfmProductOverview';
import { enumerateDatesInclusive } from '@/lib/ga4/dateRange';
import { colorForChannel } from '@/lib/ga4/channelDisplay';
import {
  formatRangeLabel,
  pctChange,
} from '@/lib/overview/comparePeriod';
import { fmt, safeDiv } from '@/lib/vdp/aggregates';
import VdpChart from '@/components/vdp/VdpChart';
import { Card, Kpi, Seg, Toolbar, ToolbarGroup } from '@/components/vdp/VdpUi';
import { VdpLoadingCard } from '@/components/vdp/VdpLoadingBanner';
import { useSoftLoadPercent } from '@/components/vdp/useSoftLoadPercent';
import {
  // ChannelCompareTable,
  PageCompareTable,
  ProductChannelMatrixTable,
  shortMonthLabel,
} from '@/components/pfm/PfmCompareTables';

const PRODUCT_METRIC_KEYS = [
  'views',
  // 'conversions',
  'totalUsers',
  'newUsers',
  'returningUsers',
];

function formatShortDay(iso) {
  if (!iso) return '';
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return String(iso).slice(5);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function buildSourceChart(rows, label, color) {
  const sorted = [...(rows || [])].sort(
    (a, b) => (Number(b.views) || 0) - (Number(a.views) || 0)
  );
  return {
    labels: sorted.map((r) => String(r.channel_bucket || '(not set)')),
    datasets: [
      {
        label,
        data: sorted.map((r) => Number(r.views) || 0),
        backgroundColor: color,
        borderRadius: 4,
      },
    ],
  };
}

function buildSourceCompareChart(
  curRows,
  priRows,
  curLabel,
  priLabel,
  curColor = '#2563eb',
  priColor = '#858B9A'
) {
  const curMap = {};
  for (const r of curRows || []) {
    const key = String(r.channel_bucket || '(not set)');
    curMap[key] = (curMap[key] || 0) + (Number(r.views) || 0);
  }
  const priMap = {};
  for (const r of priRows || []) {
    const key = String(r.channel_bucket || '(not set)');
    priMap[key] = (priMap[key] || 0) + (Number(r.views) || 0);
  }
  const labels = [
    ...new Set([...Object.keys(curMap), ...Object.keys(priMap)]),
  ].sort(
    (a, b) =>
      Math.max(curMap[b] || 0, priMap[b] || 0) -
      Math.max(curMap[a] || 0, priMap[a] || 0)
  );
  return {
    labels,
    datasets: [
      {
        label: `${curLabel} (current)`,
        data: labels.map((k) => curMap[k] || 0),
        backgroundColor: curColor,
        borderRadius: 4,
      },
      {
        label: `${priLabel} (prior)`,
        data: labels.map((k) => priMap[k] || 0),
        backgroundColor: priColor,
        borderRadius: 4,
      },
    ],
  };
}

function buildShapeChart(shape) {
  return {
    labels: ['Direct', 'Collection'],
    datasets: [
      {
        data: [Number(shape?.direct) || 0, Number(shape?.collection) || 0],
        backgroundColor: ['#16a34a', '#3730a3'],
        borderWidth: 0,
      },
    ],
  };
}

function ShapeLegend({ chart }) {
  const data = chart?.datasets?.[0]?.data || [];
  const direct = Number(data[0]) || 0;
  const collection = Number(data[1]) || 0;
  const total = direct + collection;
  const dPct = total > 0 ? Math.round((direct / total) * 100) : 0;
  const cPct = total > 0 ? Math.round((collection / total) * 100) : 0;
  return (
    <div className="vdp-newused-legend">
      <div className="vdp-newused-legend-item">
        <span className="vdp-legend-swatch" style={{ background: '#16a34a' }} />
        <span className="vdp-newused-legend-label">Direct</span>
        <span className="vdp-newused-legend-val mono">
          {fmt(direct)} ({dPct}%)
        </span>
      </div>
      <div className="vdp-newused-legend-item">
        <span className="vdp-legend-swatch" style={{ background: '#3730a3' }} />
        <span className="vdp-newused-legend-label">Collection</span>
        <span className="vdp-newused-legend-val mono">
          {fmt(collection)} ({cPct}%)
        </span>
      </div>
    </div>
  );
}

function TopProductsLimitSelect({ value, onChange }) {
  return (
    <select
      className="vdp-top-vehicles-select"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label="Top products limit"
    >
      <option value="5">Top 5</option>
      <option value="all">All</option>
    </select>
  );
}

function TopProductsLabelSelect({ value, onChange }) {
  return (
    <select
      className="vdp-top-vehicles-select"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label="Product label mode"
    >
      <option value="title">Page titles</option>
      <option value="url">URL</option>
    </select>
  );
}

function MatrixChannelMultiSelect({ options, value, onChange }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const selected = Array.isArray(value) ? value : [];
  const selectedSet = useMemo(() => new Set(selected), [selected]);

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

  const toggle = (channel) => {
    if (selectedSet.has(channel)) {
      onChange(selected.filter((c) => c !== channel));
    } else {
      onChange([...selected, channel]);
    }
  };

  const top3 = options.slice(0, 3).map((o) => o.channel);
  const all = options.map((o) => o.channel);
  const triggerLabel = !options.length
    ? 'No channels'
    : selected.length === 0
      ? 'Select channels'
      : selected.length === options.length
        ? `All channels (${selected.length})`
        : selected.length <= 2
          ? selected.join(', ')
          : `${selected.length} channels selected`;

  return (
    <div className="pfm-channel-multi" ref={rootRef}>
      <button
        type="button"
        className={`pfm-channel-multi-trigger${open ? ' is-open' : ''}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Channels shown"
        onClick={() => setOpen((o) => !o)}
      >
        <span className="pfm-channel-multi-text">{triggerLabel}</span>
        <span className="pfm-channel-multi-arr" aria-hidden>
          {open ? '▴' : '▾'}
        </span>
      </button>
      {open ? (
        <div
          className="pfm-channel-multi-pop"
          role="listbox"
          aria-label="Channels"
          aria-multiselectable="true"
        >
          <div className="pfm-channel-multi-actions">
            <button type="button" onClick={() => onChange(top3)}>
              Top 3
            </button>
            <button type="button" onClick={() => onChange(all)}>
              Select all
            </button>
            <button type="button" onClick={() => onChange([])}>
              Clear
            </button>
            <span className="pfm-channel-multi-count">
              {selected.length} selected
            </span>
          </div>
          <ul className="pfm-channel-multi-list">
            {options.map((o) => {
              const checked = selectedSet.has(o.channel);
              return (
                <li key={o.channel}>
                  <label className="pfm-channel-multi-item">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggle(o.channel)}
                    />
                    <span className="pfm-channel-multi-name">{o.channel}</span>
                    <span className="pfm-channel-multi-views mono">
                      {fmt(o.views)}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </div>
  );
}


export default function ProductPageViewsPanel({
  from,
  to,
  priorFrom,
  priorTo,
  curLabel,
  priLabel,
  compareMode,
  onCompareModeChange,
}) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [overlayBusy, setOverlayBusy] = useState(false);
  const [error, setError] = useState(null);
  const [topMode, setTopMode] = useState('5');
  const [labelMode, setLabelMode] = useState('title');
  const [matrix, setMatrix] = useState(null);
  const [matrixLoading, setMatrixLoading] = useState(false);
  const [matrixError, setMatrixError] = useState(null);
  const [matrixChannels, setMatrixChannels] = useState([]);
  const [matrixLabelMode, setMatrixLabelMode] = useState('title');
  const [appliedCompare, setAppliedCompare] = useState(false);
  const matrixDefaultKeyRef = useRef('');
  const cancelRef = useRef(false);
  const genRef = useRef(0);
  const matrixGenRef = useRef(0);

  const compareActive = compareMode === 'mom' || compareMode === 'pop';
  const showCompare = Boolean(priorFrom && priorTo);
  const comparePctLabel = compareMode === 'pop' ? 'PoP' : 'MoM';
  const compareModeLabel =
    compareMode === 'pop'
      ? 'PoP · same dates last month'
      : compareMode === 'mom'
        ? 'MoM · full last month'
        : 'Compare';

  // Show the loader before MoM/PoP layout work paints (avoids a frozen blank UI).
  useLayoutEffect(() => {
    setOverlayBusy(true);
    setLoading(true);
    setMatrixLoading(true);
  }, [compareMode, from, to, priorFrom, priorTo]);

  const load = useCallback(async () => {
    if (!from || !to || !priorFrom || !priorTo) {
      setData(null);
      setLoading(false);
      return;
    }
    const gen = genRef.current + 1;
    genRef.current = gen;
    cancelRef.current = false;
    setLoading(true);
    setOverlayBusy(true);
    setError(null);

    try {
      const json = await fetchPfmProductOverview({
        from,
        to,
        priorFrom,
        priorTo,
        limit: 10000,
      });
      if (cancelRef.current || genRef.current !== gen) return;
      setData(json);
    } catch (err) {
      if (cancelRef.current || genRef.current !== gen) return;
      setError(err?.message || 'Failed to load product overview.');
      setData(null);
    } finally {
      if (!cancelRef.current && genRef.current === gen) setLoading(false);
    }
  }, [from, to, priorFrom, priorTo, compareMode]);

  useEffect(() => {
    load();
    return () => {
      cancelRef.current = true;
    };
  }, [load]);

  useEffect(() => {
    if (!from || !to) {
      setMatrix(null);
      setMatrixLoading(false);
      return undefined;
    }
    const gen = matrixGenRef.current + 1;
    matrixGenRef.current = gen;
    const ctrl = new AbortController();
    setMatrixLoading(true);
    setOverlayBusy(true);
    setMatrixError(null);
    fetchPfmProductChannelMatrix({
      from,
      to,
      priorFrom,
      priorTo,
      signal: ctrl.signal,
    })
      .then((json) => {
        if (matrixGenRef.current !== gen) return;
        setMatrix({ rows: json?.rows || [], rowsPrior: json?.rowsPrior || [] });
      })
      .catch((err) => {
        if (err?.name === 'AbortError') return;
        if (matrixGenRef.current !== gen) return;
        setMatrixError(err?.message || 'Failed to load product vs channel data.');
        setMatrix(null);
      })
      .finally(() => {
        if (!ctrl.signal.aborted && matrixGenRef.current === gen) {
          setMatrixLoading(false);
        }
      });
    return () => ctrl.abort();
  }, [from, to, priorFrom, priorTo, compareMode]);

  // Apply compare layout only after both fetches finish and the loader has painted.
  useEffect(() => {
    if (loading || matrixLoading) return undefined;
    const id = requestAnimationFrame(() => {
      setAppliedCompare(compareActive && showCompare);
      setOverlayBusy(false);
    });
    return () => cancelAnimationFrame(id);
  }, [loading, matrixLoading, compareActive, showCompare, data, matrix]);

  const matrixChannelOptions = useMemo(() => {
    const views = new Map();
    for (const r of matrix?.rows || []) {
      const ch = r.channel || '(not set)';
      views.set(ch, (views.get(ch) || 0) + (Number(r.views) || 0));
    }
    return [...views.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([channel, channelViews]) => ({ channel, views: channelViews }));
  }, [matrix]);

  // Default to top 3 channels by views whenever the period (or channel set) changes.
  useEffect(() => {
    if (!matrixChannelOptions.length) {
      setMatrixChannels([]);
      matrixDefaultKeyRef.current = '';
      return;
    }
    const key = `${from}|${to}|${matrixChannelOptions.map((o) => o.channel).join('\u0001')}`;
    if (matrixDefaultKeyRef.current === key) return;
    matrixDefaultKeyRef.current = key;
    setMatrixChannels(matrixChannelOptions.slice(0, 3).map((o) => o.channel));
  }, [from, to, matrixChannelOptions]);

  const busy = loading || matrixLoading || overlayBusy;
  const loadPercent = useSoftLoadPercent(busy);

  const productCur = data?.totals?.productCurrent || 0;
  const productPri = data?.totals?.productPrior || 0;
  const pageCur = data?.totals?.pageCurrent || 0;
  const pagePri = data?.totals?.pagePrior || 0;
  const productMom = data?.totals?.productMom ?? pctChange(productCur, productPri);

  const rateCur = safeDiv(productCur, pageCur) * 100;
  const ratePri = safeDiv(productPri, pagePri) * 100;

  const curDates = useMemo(
    () => (from && to ? enumerateDatesInclusive(from, to) : []),
    [from, to]
  );
  const priDates = useMemo(
    () =>
      priorFrom && priorTo ? enumerateDatesInclusive(priorFrom, priorTo) : [],
    [priorFrom, priorTo]
  );
  const dayCount = curDates.length || 1;
  const avgPerDay = Math.round(productCur / dayCount);

  const shapeCur = data?.shapeCurrent || { direct: 0, collection: 0, other: 0 };
  const shapePri = data?.shapePrior || { direct: 0, collection: 0, other: 0 };
  const directCollectionCur = (shapeCur.direct || 0) + (shapeCur.collection || 0);
  const directCollectionPri =
    (shapePri.direct || 0) + (shapePri.collection || 0);
  const shapeMom = pctChange(directCollectionCur, directCollectionPri);

  const dailyCurMap = useMemo(() => {
    const m = {};
    for (const r of data?.dailyCurrent || []) m[r.date] = r.views;
    return m;
  }, [data]);
  const dailyPriMap = useMemo(() => {
    const m = {};
    for (const r of data?.dailyPrior || []) m[r.date] = r.views;
    return m;
  }, [data]);

  const lineData = useMemo(() => {
    const dailySeries = (dates, map) =>
      dates.map((d) => Number(map[d]) || 0);

    if (compareActive) {
      const n = Math.max(curDates.length, priDates.length, 1);
      const labels = Array.from({ length: n }, (_, i) => `Day ${i + 1}`);
      return {
        labels,
        datasets: [
          {
            label: curLabel || 'Current',
            data: dailySeries(curDates, dailyCurMap).concat(
              Array(Math.max(0, n - curDates.length)).fill(null)
            ),
            borderColor: '#2563eb',
            backgroundColor: 'rgba(37,99,235,.08)',
            fill: true,
            tension: 0.3,
            spanGaps: false,
            pointRadius: curDates.length <= 45 ? 2 : 0,
            borderWidth: 2.5,
          },
          {
            label: priLabel || 'Prior',
            data: dailySeries(priDates, dailyPriMap).concat(
              Array(Math.max(0, n - priDates.length)).fill(null)
            ),
            borderColor: '#94a3b8',
            backgroundColor: 'rgba(148,163,184,.08)',
            fill: true,
            tension: 0.3,
            spanGaps: false,
            pointRadius: 0,
            borderWidth: 2,
          },
        ],
      };
    }
    return {
      labels: curDates.map(formatShortDay),
      datasets: [
        {
          label: curLabel || formatRangeLabel(from, to),
          data: dailySeries(curDates, dailyCurMap),
          borderColor: '#2563eb',
          backgroundColor: 'rgba(37,99,235,.08)',
          fill: true,
          tension: 0.3,
          spanGaps: false,
          pointRadius: curDates.length <= 45 ? 2 : 0,
          pointHoverRadius: 6,
          borderWidth: 2.5,
        },
      ],
    };
  }, [
    compareActive,
    curDates,
    priDates,
    dailyCurMap,
    dailyPriMap,
    curLabel,
    priLabel,
    from,
    to,
  ]);

  const lineOptions = useMemo(
    () => ({
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: {
          position: 'bottom',
          labels: { boxWidth: 12, font: { size: 11 } },
        },
      },
      scales: {
        x: {
          ticks: {
            maxRotation: 45,
            minRotation: 45,
            font: { size: 10 },
            autoSkip: curDates.length > 62,
          },
        },
        y: { beginAtZero: true, ticks: { callback: (v) => fmt(v) } },
      },
    }),
    [curDates.length]
  );

  const sourceChart = useMemo(
    () => buildSourceChart(data?.channelsCurrent, 'Product Views', '#2563eb'),
    [data]
  );
  const sourceCompareChart = useMemo(
    () =>
      buildSourceCompareChart(
        data?.channelsCurrent,
        data?.channelsPrior,
        curLabel,
        priLabel
      ),
    [data, curLabel, priLabel]
  );
  const sourceOptions = useMemo(
    () => ({
      plugins: {
        legend: {
          position: 'bottom',
          labels: { boxWidth: 12, font: { size: 11 } },
        },
      },
      scales: {
        x: { ticks: { font: { size: 10 }, maxRotation: 45, minRotation: 45 } },
        y: { beginAtZero: true, ticks: { callback: (v) => fmt(v) } },
      },
    }),
    []
  );

  const shapeChart = useMemo(() => buildShapeChart(shapeCur), [shapeCur]);
  const shapePriChart = useMemo(() => buildShapeChart(shapePri), [shapePri]);
  const donutOptions = useMemo(
    () => ({
      plugins: { legend: { display: false } },
      cutout: '62%',
    }),
    []
  );

  const allProducts = data?.productsCurrent || [];
  const displayProducts =
    topMode === 'all' ? allProducts : allProducts.slice(0, 5);
  const tableCompare = appliedCompare;
  const curShort = shortMonthLabel(from, to);
  const priShort = shortMonthLabel(priorFrom, priorTo);
  const topTitle =
    topMode === 'all'
      ? 'All Products by Views'
      : 'Top 5 Products by Views';
  const topActions = (
    <div className="vdp-top-products-actions">
      <TopProductsLabelSelect value={labelMode} onChange={setLabelMode} />
      <TopProductsLimitSelect value={topMode} onChange={setTopMode} />
    </div>
  );

  return (
    <div className={`vdp-view${busy ? ' vdp-view--card-loading' : ''}`}>
      <VdpLoadingCard
        active={busy}
        percent={loadPercent}
        freeze
        label={
          compareActive || compareMode
            ? 'Updating comparison…'
            : 'Loading...'
        }
      />

      <Toolbar>
        <ToolbarGroup label="Compare">
          <Seg
            value={compareMode}
            options={[
              { value: 'pop', label: 'PoP' },
              { value: 'mom', label: 'MoM' },
            ]}
            onChange={onCompareModeChange}
          />
        </ToolbarGroup>
        <ToolbarGroup label="Period">
          <span className="vdp-period-hint">
            {compareActive
              ? `${curLabel} vs ${priLabel} (${compareModeLabel})`
              : curLabel}
          </span>
        </ToolbarGroup>
      </Toolbar>

      {error ? (
        <div
          className="vdp-card vdp-alert-error"
          style={{ marginBottom: 16, fontSize: 13 }}
        >
          {error}
        </div>
      ) : null}

      <div className="vdp-kpi-grid">
        <Kpi
          label={`Product Views · ${curLabel}`}
          value={fmt(productCur)}
          delta={showCompare ? productMom : null}
          sub={
            showCompare
              ? `vs ${fmt(productPri)} (${priLabel})`
              : curLabel
          }
        />
        <Kpi
          label="Product Rate (Product / Page Views)"
          value={`${rateCur.toFixed(1)}%`}
          delta={showCompare ? rateCur - ratePri : null}
          sub={
            showCompare
              ? `vs ${ratePri.toFixed(1)}% prior`
              : 'Current period'
          }
          isPP
        />
        <Kpi
          label="Avg Product Views / Day"
          value={fmt(avgPerDay)}
          sub={`${dayCount} day${dayCount === 1 ? '' : 's'} in period`}
        />
        <Kpi
          label="Direct + Collection"
          value={fmt(directCollectionCur)}
          delta={showCompare ? shapeMom : null}
          sub={
            showCompare
              ? `Other ${fmt(shapeCur.other || 0)} vs ${fmt(shapePri.other || 0)} (${priLabel})`
              : `Other ${fmt(shapeCur.other || 0)} · Path share below`
          }
        />
      </div>

      {compareActive ? (
        <>
          <Card
            className="vdp-card--chart"
            title="Daily Product Views"
            sub={`Views per day · ${curLabel} vs ${priLabel}`}
            style={{ marginBottom: 16 }}
          >
            <VdpChart type="line" data={lineData} options={lineOptions} height={180} />
          </Card>

          {/* Source + Direct/Collection charts — hidden for now
          <Card
            className="vdp-card--chart"
            title="Product Views by Source"
            sub={`${curLabel} vs ${priLabel} · product pages only`}
            style={{ marginBottom: 16 }}
          >
            {!sourceCompareChart.labels.length ? (
              <div style={{ color: 'var(--vdp-muted)', fontSize: 13, padding: 12 }}>
                No channel data for this period.
              </div>
            ) : (
              <VdpChart
                type="bar"
                data={sourceCompareChart}
                options={sourceOptions}
                height={200}
              />
            )}
          </Card>

          <div className="vdp-grid-2 vdp-grid-2--equal vdp-grid-2--overview">
            <Card
              title="Direct vs Collection — Product Share"
              sub={`${curLabel} · current`}
            >
              {!(shapeCur.direct || shapeCur.collection) ? (
                <div style={{ color: 'var(--vdp-muted)', fontSize: 13, padding: 12 }}>
                  No Direct/Collection product data.
                </div>
              ) : (
                <>
                  <VdpChart
                    type="doughnut"
                    data={shapeChart}
                    options={donutOptions}
                    height={150}
                  />
                  <ShapeLegend chart={shapeChart} />
                </>
              )}
            </Card>
            <Card
              title="Direct vs Collection — Product Share"
              sub={`${priLabel} · prior`}
            >
              {!(shapePri.direct || shapePri.collection) ? (
                <div style={{ color: 'var(--vdp-muted)', fontSize: 13, padding: 12 }}>
                  No Direct/Collection product data.
                </div>
              ) : (
                <>
                  <VdpChart
                    type="doughnut"
                    data={shapePriChart}
                    options={donutOptions}
                    height={150}
                  />
                  <ShapeLegend chart={shapePriChart} />
                </>
              )}
            </Card>
          </div>
          */}
        </>
      ) : (
        <>
          <Card
            className="vdp-card--chart"
            title="Daily Product Views"
            sub={`Views per day · ${curLabel}`}
            style={{ marginBottom: 16 }}
          >
            <VdpChart type="line" data={lineData} options={lineOptions} height={180} />
          </Card>

          {/* Source + Direct/Collection charts — hidden for now
          <div className="vdp-grid-2 vdp-grid-2--overview">
            <Card
              title="Product Views by Source"
              sub={`${curLabel} · product pages only`}
            >
              {!sourceChart.labels.length ? (
                <div style={{ color: 'var(--vdp-muted)', fontSize: 13, padding: 12 }}>
                  No channel data for this period.
                </div>
              ) : (
                <VdpChart
                  type="bar"
                  data={sourceChart}
                  options={sourceOptions}
                  height={160}
                />
              )}
            </Card>
            <Card
              title="Direct vs Collection — Product Share"
              sub="Current period · chipper_pfm_ga4_data"
            >
              {!(shapeCur.direct || shapeCur.collection) ? (
                <div style={{ color: 'var(--vdp-muted)', fontSize: 13, padding: 12 }}>
                  No Direct/Collection product data.
                </div>
              ) : (
                <>
                  <VdpChart
                    type="doughnut"
                    data={shapeChart}
                    options={donutOptions}
                    height={150}
                  />
                  <ShapeLegend chart={shapeChart} />
                </>
              )}
            </Card>
          </div>
          */}
        </>
      )}

      <PageCompareTable
        title={`${topTitle}${tableCompare ? ' — Period Comparison' : ''}`}
        sub={
          tableCompare
            ? `${curLabel} vs ${priLabel} · ${comparePctLabel} · compared by URL`
            : `${curLabel} · product pages`
        }
        actions={topActions}
        rows={displayProducts}
        priRows={data?.productsPrior || []}
        metricKeys={PRODUCT_METRIC_KEYS}
        curLabel={curLabel}
        priLabel={priLabel}
        curShort={curShort}
        priShort={priShort}
        compareActive={tableCompare}
        comparePctLabel={comparePctLabel}
        labelMode={labelMode}
        scroll={topMode === 'all'}
        loading={loading}
        emptyText="No product page data for this period."
      />

      {matrixError ? (
        <div
          className="vdp-card vdp-alert-error"
          style={{ marginBottom: 16, fontSize: 13 }}
        >
          {matrixError}
        </div>
      ) : null}

      <ProductChannelMatrixTable
        title="Product vs Channel — All Products"
        sub={
          tableCompare
            ? `${curLabel} vs ${priLabel} · ${comparePctLabel} · split by GA4 channel`
            : `${curLabel} · product page views and users split by GA4 channel`
        }
        actions={
          <div className="vdp-top-products-actions">
            <TopProductsLabelSelect
              value={matrixLabelMode}
              onChange={setMatrixLabelMode}
            />
            <MatrixChannelMultiSelect
              options={matrixChannelOptions}
              value={matrixChannels}
              onChange={setMatrixChannels}
            />
          </div>
        }
        rows={matrix?.rows || []}
        priRows={matrix?.rowsPrior || []}
        compareActive={tableCompare}
        curLabel={curLabel}
        priLabel={priLabel}
        curShort={curShort}
        priShort={priShort}
        comparePctLabel={comparePctLabel}
        productLimit="all"
        selectedChannels={matrixChannels}
        labelMode={matrixLabelMode}
        loading={matrixLoading}
      />

      {/* Product Views by Channel — Period Comparison — hidden for now
      <ChannelCompareTable
        title="Product Views by Channel"
        rows={data?.channelsCurrent || []}
        priRows={data?.channelsPrior || []}
        metricKeys={PRODUCT_METRIC_KEYS}
        curLabel={curLabel}
        priLabel={priLabel}
        curShort={curShort}
        priShort={priShort}
        compareActive={tableCompare}
        comparePctLabel={comparePctLabel}
        loading={loading}
        emptyText="No product channel data for this period."
      />
      */}
    </div>
  );
}
