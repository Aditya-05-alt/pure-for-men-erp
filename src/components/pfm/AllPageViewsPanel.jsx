'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { fetchPfmPageViews } from '@/lib/api/pfmPageViews';
import { enumerateDatesInclusive } from '@/lib/ga4/dateRange';
import { formatRangeLabel, pctChange } from '@/lib/overview/comparePeriod';
import { fmt, pct } from '@/lib/vdp/aggregates';
import VdpChart from '@/components/vdp/VdpChart';
import { Card, Kpi, Seg, Toolbar, ToolbarGroup } from '@/components/vdp/VdpUi';
import { VdpLoadingCard } from '@/components/vdp/VdpLoadingBanner';
import { useSoftLoadPercent } from '@/components/vdp/useSoftLoadPercent';
import {
  ChannelCompareTable,
  PageCompareTable,
  shortMonthLabel,
} from '@/components/pfm/PfmCompareTables';

const PAGE_METRIC_KEYS = [
  'views',
  'sessions',
  'totalUsers',
  'newUsers',
  'returningUsers',
];
const CHANNEL_METRIC_KEYS = ['views', 'totalUsers', 'newUsers', 'returningUsers'];
const PAGE_LIMITS = [5, 10, 25, 50, 100, 200];
const ALL_PAGES_LIMIT = 20000;

function formatShortDay(iso) {
  const d = new Date(`${iso}T12:00:00`);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function PagesLimitSelect({ value, onChange }) {
  return (
    <select
      className="vdp-top-vehicles-select"
      value={value}
      onChange={(e) =>
        onChange(e.target.value === 'all' ? 'all' : Number(e.target.value))
      }
      aria-label="Top pages limit"
    >
      {PAGE_LIMITS.map((n) => (
        <option key={n} value={n}>
          Top {n}
        </option>
      ))}
      <option value="all">All</option>
    </select>
  );
}

function PagesLabelSelect({ value, onChange }) {
  return (
    <select
      className="vdp-top-vehicles-select"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label="Page label mode"
    >
      <option value="title">Page titles</option>
      <option value="url">URL</option>
      <option value="both">Title + URL</option>
    </select>
  );
}

export default function AllPageViewsPanel({
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
  const [error, setError] = useState(null);
  const [limit, setLimit] = useState(5);
  const [labelMode, setLabelMode] = useState('title');
  const cancelRef = useRef(false);
  const genRef = useRef(0);

  const compareActive = compareMode === 'mom' || compareMode === 'pop';
  const showCompare = Boolean(priorFrom && priorTo);
  const tableCompare = compareActive && showCompare;
  const curShort = shortMonthLabel(from, to);
  const priShort = shortMonthLabel(priorFrom, priorTo);
  const comparePctLabel = compareMode === 'pop' ? 'PoP' : 'MoM';
  const compareModeLabel =
    compareMode === 'pop'
      ? 'PoP · same dates last month'
      : compareMode === 'mom'
        ? 'MoM · full last month'
        : 'Compare';

  const load = useCallback(async () => {
    if (!from || !to || !priorFrom || !priorTo) {
      setData(null);
      return;
    }
    const gen = genRef.current + 1;
    genRef.current = gen;
    cancelRef.current = false;
    setLoading(true);
    setError(null);

    try {
      const json = await fetchPfmPageViews({
        from,
        to,
        priorFrom,
        priorTo,
        limit: limit === 'all' ? ALL_PAGES_LIMIT : limit,
      });
      if (cancelRef.current || genRef.current !== gen) return;
      setData(json);
    } catch (err) {
      if (cancelRef.current || genRef.current !== gen) return;
      setError(err?.message || 'Failed to load page views.');
      setData(null);
    } finally {
      if (!cancelRef.current && genRef.current === gen) setLoading(false);
    }
  }, [from, to, priorFrom, priorTo, limit]);

  useEffect(() => {
    load();
    return () => {
      cancelRef.current = true;
    };
  }, [load]);

  const loadPercent = useSoftLoadPercent(loading);

  const curDates = useMemo(
    () => (from && to ? enumerateDatesInclusive(from, to) : []),
    [from, to]
  );
  const priDates = useMemo(
    () =>
      priorFrom && priorTo ? enumerateDatesInclusive(priorFrom, priorTo) : [],
    [priorFrom, priorTo]
  );

  const lineData = useMemo(() => {
    const toMap = (rows) => {
      const m = {};
      for (const r of rows || []) m[r.date] = r.views;
      return m;
    };
    const curMap = toMap(data?.dailyCurrent);
    const priMap = toMap(data?.dailyPrior);
    const series = (dates, map) => dates.map((d) => Number(map[d]) || 0);

    const current = {
      label: curLabel || formatRangeLabel(from, to),
      borderColor: '#3b82f6',
      backgroundColor: 'rgba(59,130,246,.12)',
      fill: true,
      tension: 0.3,
      spanGaps: false,
      pointRadius: curDates.length <= 45 ? 2 : 0,
      pointHoverRadius: 6,
      borderWidth: 2.5,
    };

    if (tableCompare) {
      const n = Math.max(curDates.length, priDates.length, 1);
      const pad = (arr) => arr.concat(Array(Math.max(0, n - arr.length)).fill(null));
      return {
        labels: Array.from({ length: n }, (_, i) => `Day ${i + 1}`),
        datasets: [
          { ...current, data: pad(series(curDates, curMap)) },
          {
            label: priLabel || 'Prior',
            data: pad(series(priDates, priMap)),
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
      datasets: [{ ...current, data: series(curDates, curMap) }],
    };
  }, [data, tableCompare, curDates, priDates, curLabel, priLabel, from, to]);

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

  const curTotal = data?.totals?.current || 0;
  const priTotal = data?.totals?.prior || 0;
  const delta = pctChange(curTotal, priTotal);
  const hasDaily = (data?.dailyCurrent || []).length > 0;

  const pagesActions = (
    <div className="vdp-top-products-actions">
      <PagesLabelSelect value={labelMode} onChange={setLabelMode} />
      <PagesLimitSelect value={limit} onChange={setLimit} />
    </div>
  );

  return (
    <div className={`vdp-view${loading ? ' vdp-view--card-loading' : ''}`}>
      <VdpLoadingCard active={loading} percent={loadPercent} />

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
            {tableCompare
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

      <div className="vdp-kpi-grid vdp-kpi-grid--3" style={{ marginBottom: 16 }}>
        <Kpi
          label={`Page Views · ${curLabel}`}
          value={fmt(curTotal)}
          delta={delta}
          sub={`vs ${fmt(priTotal)} (${priLabel})`}
        />
        <Kpi
          label={`Prior · ${priLabel}`}
          value={fmt(priTotal)}
          sub={compareModeLabel}
        />
        <Kpi
          label={`${comparePctLabel} change`}
          value={pct(delta)}
          delta={delta}
          sub={`${curLabel} vs ${priLabel}`}
        />
      </div>

      <Card
        className="vdp-card--chart"
        title="Daily Page Views"
        sub={
          tableCompare
            ? `Views per day · ${curLabel} vs ${priLabel}`
            : `Views per day · ${curLabel}`
        }
        style={{ marginBottom: 16 }}
      >
        {!hasDaily && !loading ? (
          <div style={{ color: 'var(--vdp-muted)', fontSize: 13, padding: 12 }}>
            No daily views for this period.
          </div>
        ) : (
          <VdpChart type="line" data={lineData} options={lineOptions} height={180} />
        )}
      </Card>

      <PageCompareTable
        title={`${limit === 'all' ? 'All Pages' : `Top ${limit} Pages`} by Views${
          tableCompare ? ' — Period Comparison' : ''
        }`}
        sub={
          tableCompare
            ? `${curLabel} vs ${priLabel} · ${comparePctLabel} · compared by URL`
            : `${curLabel} · all pages`
        }
        actions={pagesActions}
        rows={data?.pagesCurrent || []}
        priRows={data?.pagesPriorByPath || []}
        metricKeys={PAGE_METRIC_KEYS}
        curLabel={curLabel}
        priLabel={priLabel}
        curShort={curShort}
        priShort={priShort}
        compareActive={tableCompare}
        comparePctLabel={comparePctLabel}
        labelMode={labelMode}
        scroll={limit === 'all' || limit > 10}
        loading={loading}
        emptyText="No pages for this period."
      />

      <ChannelCompareTable
        title="All Page Views by Channel"
        rows={data?.channelsCurrent || []}
        priRows={data?.channelsPrior || []}
        metricKeys={CHANNEL_METRIC_KEYS}
        curLabel={curLabel}
        priLabel={priLabel}
        curShort={curShort}
        priShort={priShort}
        compareActive={tableCompare}
        comparePctLabel={comparePctLabel}
        loading={loading}
        style={{ marginTop: 0 }}
      />
    </div>
  );
}
