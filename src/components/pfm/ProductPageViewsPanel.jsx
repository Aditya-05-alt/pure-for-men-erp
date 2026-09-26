'use client';

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { fetchPfmProductOverview } from '@/lib/api/pfmProductOverview';
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
import Delta from '@/components/dashboard/Delta';

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

const PFM_SITE_ORIGIN = 'https://pureformen.com';

function productPageHref(pagePath) {
  const path = String(pagePath || '').trim();
  if (!path || path === '(not set)') return null;
  if (/^https?:\/\//i.test(path)) return path;
  return `${PFM_SITE_ORIGIN}${path.startsWith('/') ? path : `/${path}`}`;
}

function formatMoney(n) {
  const v = Number(n) || 0;
  return v.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function TopProductsTable({ rows, scroll, labelMode = 'title' }) {
  if (!rows?.length) {
    return (
      <div style={{ color: 'var(--vdp-muted)', fontSize: 13, padding: 12 }}>
        No product page data for this period.
      </div>
    );
  }
  const showTitle = labelMode === 'title';
  const table = (
    <table className="vdp-table">
      <thead>
        <tr>
          <th>{showTitle ? 'Page title' : 'URL'}</th>
          <th className="right">Views</th>
          <th className="right">Conversions</th>
          <th className="right">Total Users</th>
          <th className="right">New Users</th>
          {/* <th className="right">Revenue</th> */}
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => {
          const href = productPageHref(r.pagePath);
          const label = showTitle
            ? String(r.pageTitle || '').trim() || r.pagePath
            : r.pagePath;
          return (
            <tr key={r.pagePath}>
              <td style={{ wordBreak: 'break-word', fontWeight: 500, lineHeight: 1.3 }}>
                {href ? (
                  <a
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="vdp-product-url"
                    title={showTitle ? `${label}\n${href}` : `Open ${href}`}
                  >
                    {label}
                  </a>
                ) : (
                  label
                )}
              </td>
              <td className="right mono">{fmt(r.views)}</td>
              <td className="right mono">{fmt(r.conversions)}</td>
              <td className="right mono">{fmt(r.totalUsers)}</td>
              <td className="right mono">{fmt(r.newUsers)}</td>
              {/* <td className="right mono">{formatMoney(r.revenue)}</td> */}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
  if (!scroll) return table;
  return <div className="vdp-top-vehicles-scroll">{table}</div>;
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

function emptyChannelMetrics() {
  return {
    views: 0,
    conversions: 0,
    totalUsers: 0,
    newUsers: 0,
  };
}

function metricsFromChannelRow(r) {
  return {
    views: Number(r?.views) || 0,
    conversions: Number(r?.conversions) || 0,
    totalUsers: Number(r?.totalUsers) || 0,
    newUsers: Number(r?.newUsers) || 0,
  };
}

function mergeChannelMetricComparison(curRows, priRows) {
  const curMap = new Map();
  const priMap = new Map();
  for (const r of curRows || []) {
    curMap.set(String(r.channel_bucket || '(not set)'), metricsFromChannelRow(r));
  }
  for (const r of priRows || []) {
    priMap.set(String(r.channel_bucket || '(not set)'), metricsFromChannelRow(r));
  }
  const keys = new Set([...curMap.keys(), ...priMap.keys()]);
  const rows = [...keys].map((ch) => {
    const cur = curMap.get(ch) || emptyChannelMetrics();
    const pri = priMap.get(ch) || emptyChannelMetrics();
    return {
      ch,
      cur,
      pri,
      delta: {
        views: pctChange(cur.views, pri.views),
        conversions: pctChange(cur.conversions, pri.conversions),
        totalUsers: pctChange(cur.totalUsers, pri.totalUsers),
        newUsers: pctChange(cur.newUsers, pri.newUsers),
      },
    };
  });
  rows.sort(
    (a, b) =>
      b.cur.views - a.cur.views ||
      b.pri.views - a.pri.views ||
      a.ch.localeCompare(b.ch)
  );

  const totalsCur = emptyChannelMetrics();
  const totalsPri = emptyChannelMetrics();
  for (const r of rows) {
    totalsCur.views += r.cur.views;
    totalsCur.conversions += r.cur.conversions;
    totalsCur.totalUsers += r.cur.totalUsers;
    totalsCur.newUsers += r.cur.newUsers;
    totalsPri.views += r.pri.views;
    totalsPri.conversions += r.pri.conversions;
    totalsPri.totalUsers += r.pri.totalUsers;
    totalsPri.newUsers += r.pri.newUsers;
  }

  return {
    rows,
    totals: {
      cur: totalsCur,
      pri: totalsPri,
      delta: {
        views: pctChange(totalsCur.views, totalsPri.views),
        conversions: pctChange(totalsCur.conversions, totalsPri.conversions),
        totalUsers: pctChange(totalsCur.totalUsers, totalsPri.totalUsers),
        newUsers: pctChange(totalsCur.newUsers, totalsPri.newUsers),
      },
    },
  };
}

function MetricCompareCells({ cur, pri, delta }) {
  return (
    <>
      <td className="col-cur mono">{fmt(cur)}</td>
      <td className="col-prev mono">{fmt(pri)}</td>
      <td className="col-mom">
        <Delta value={delta} />
      </td>
    </>
  );
}

function ProductChannelTable({
  rows,
  priRows,
  curLabel,
  priLabel,
  compareActive,
  comparePctLabel = 'MoM',
  loading,
}) {
  const [copied, setCopied] = useState(false);

  const comparison = useMemo(
    () => mergeChannelMetricComparison(rows || [], priRows || []),
    [rows, priRows]
  );

  const channelRows = useMemo(() => {
    if (compareActive) {
      return (comparison.rows || []).map((r, i) => ({
        ...r,
        color: colorForChannel(r.ch, i),
      }));
    }
    return (rows || []).map((r, i) => ({
      ch: r.channel_bucket || '(not set)',
      cur: metricsFromChannelRow(r),
      color: colorForChannel(r.channel_bucket || '(not set)', i),
    }));
  }, [compareActive, comparison.rows, rows]);

  const totals = useMemo(() => {
    if (compareActive) return comparison.totals;
    const cur = channelRows.reduce(
      (acc, r) => {
        acc.views += r.cur.views;
        acc.conversions += r.cur.conversions;
        acc.totalUsers += r.cur.totalUsers;
        acc.newUsers += r.cur.newUsers;
        return acc;
      },
      emptyChannelMetrics()
    );
    return { cur };
  }, [compareActive, comparison.totals, channelRows]);

  const colCount = compareActive ? 13 : 5;
  const metricKeys = ['views', 'conversions', 'totalUsers', 'newUsers'];
  const metricLabels = {
    views: 'Views',
    conversions: 'Conversions',
    totalUsers: 'Total Users',
    newUsers: 'New Users',
  };

  const fmtDelta = (n) => `${n >= 0 ? '+' : ''}${n}%`;

  const onCopy = useCallback(() => {
    const lines = [];
    if (compareActive) {
      lines.push(
        [
          'Channel',
          ...metricKeys.flatMap((k) => [
            `${metricLabels[k]} ${curLabel}`,
            `${metricLabels[k]} ${priLabel}`,
            `${metricLabels[k]} ${comparePctLabel}`,
          ]),
        ].join('\t')
      );
      channelRows.forEach((r) => {
        lines.push(
          [
            r.ch,
            ...metricKeys.flatMap((k) => [
              r.cur[k],
              r.pri[k],
              fmtDelta(r.delta[k]),
            ]),
          ].join('\t')
        );
      });
      lines.push(
        [
          'Total',
          ...metricKeys.flatMap((k) => [
            totals.cur[k],
            totals.pri[k],
            fmtDelta(totals.delta[k]),
          ]),
        ].join('\t')
      );
    } else {
      lines.push(
        ['Channel', 'Views', 'Conversions', 'Total Users', 'New Users'].join(
          '\t'
        )
      );
      channelRows.forEach((r) => {
        lines.push(
          [
            r.ch,
            r.cur.views,
            r.cur.conversions,
            r.cur.totalUsers,
            r.cur.newUsers,
          ].join('\t')
        );
      });
      lines.push(
        [
          'Total',
          totals.cur.views,
          totals.cur.conversions,
          totals.cur.totalUsers,
          totals.cur.newUsers,
        ].join('\t')
      );
    }
    navigator.clipboard
      .writeText(lines.join('\n'))
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1800);
      })
      .catch(() => {});
  }, [
    channelRows,
    totals,
    compareActive,
    curLabel,
    priLabel,
    comparePctLabel,
  ]);

  return (
    <div className="vdp-card vdp-cmp-panel" style={{ marginTop: 16 }}>
      <div className="vdp-cmp-head">
        <div>
          <h3>
            Product Views by Channel
            {compareActive ? ' — Period Comparison' : ''}
          </h3>
          <div className="vdp-cardsub" style={{ marginBottom: 0 }}>
            {compareActive
              ? `${curLabel} vs ${priLabel} · ${comparePctLabel} · all metrics`
              : `${curLabel} · GA4 session channels · Conversions (key events)`}
          </div>
        </div>
        <div className="vdp-cmp-head-actions">
          {compareActive ? (
            <span className="vdp-cmp-badge">Copy-ready</span>
          ) : null}
          <button
            type="button"
            className={`vdp-cmp-copy ${copied ? 'copied' : ''}`}
            onClick={onCopy}
            disabled={loading}
          >
            {copied ? 'Copied!' : 'Copy table'}
          </button>
        </div>
      </div>

      <div className="cmp-table-wrap">
        <table
          className={`cmp-tbl cmp-tbl--channels${
            compareActive ? ' cmp-tbl--period-compare cmp-tbl--multi-metric' : ''
          }`}
        >
          <thead>
            {compareActive ? (
              <>
                <tr>
                  <th rowSpan={2}>Channel</th>
                  {metricKeys.map((k) => (
                    <th key={k} className="center" colSpan={3}>
                      {metricLabels[k]}
                    </th>
                  ))}
                </tr>
                <tr>
                  {metricKeys.map((k) => (
                    <Fragment key={k}>
                      <th className="col-cur">{curLabel}</th>
                      <th className="col-prev">{priLabel}</th>
                      <th className="col-mom">{comparePctLabel}</th>
                    </Fragment>
                  ))}
                </tr>
              </>
            ) : (
              <tr>
                <th>Channel</th>
                <th className="right">Views</th>
                <th className="right">Conversions</th>
                <th className="right">Total Users</th>
                <th className="right">New Users</th>
              </tr>
            )}
          </thead>
          <tbody>
            {loading && channelRows.length === 0 ? (
              <tr>
                <td colSpan={colCount} className="cmp-table-loading">
                  Loading channel data…
                </td>
              </tr>
            ) : channelRows.length === 0 ? (
              <tr>
                <td colSpan={colCount} className="cmp-table-loading">
                  No product channel data for this period.
                </td>
              </tr>
            ) : (
              channelRows.map((r) => (
                <tr key={r.ch}>
                  <td>
                    <div className="cmp-channel-cell">
                      <div
                        className="cmp-channel-dot"
                        style={{ background: r.color }}
                      />
                      <span>{r.ch}</span>
                    </div>
                  </td>
                  {compareActive ? (
                    metricKeys.map((k) => (
                      <MetricCompareCells
                        key={k}
                        cur={r.cur[k]}
                        pri={r.pri[k]}
                        delta={r.delta[k]}
                      />
                    ))
                  ) : (
                    <>
                      <td className="right mono">{fmt(r.cur.views)}</td>
                      <td className="right mono">{fmt(r.cur.conversions)}</td>
                      <td className="right mono">{fmt(r.cur.totalUsers)}</td>
                      <td className="right mono">{fmt(r.cur.newUsers)}</td>
                    </>
                  )}
                </tr>
              ))
            )}
            {!loading && channelRows.length > 0 ? (
              <tr className="cmp-tbl-total-row cmp-tbl-total-row--plain">
                <td>Total</td>
                {compareActive ? (
                  metricKeys.map((k) => (
                    <MetricCompareCells
                      key={k}
                      cur={totals.cur[k]}
                      pri={totals.pri[k]}
                      delta={totals.delta[k]}
                    />
                  ))
                ) : (
                  <>
                    <td className="right mono">{fmt(totals.cur.views)}</td>
                    <td className="right mono">{fmt(totals.cur.conversions)}</td>
                    <td className="right mono">{fmt(totals.cur.totalUsers)}</td>
                    <td className="right mono">{fmt(totals.cur.newUsers)}</td>
                  </>
                )}
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      {compareActive ? (
        <div className="vdp-cmp-foot">
          <div className="vdp-cmp-legend">
            <span className="leg-cur" /> {curLabel}
            <span className="leg-prev" /> {priLabel}
          </div>
          <div className="vdp-cmp-note">
            {comparePctLabel}: {curLabel} vs {priLabel}
          </div>
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
  const [error, setError] = useState(null);
  const [topMode, setTopMode] = useState('5');
  const [labelMode, setLabelMode] = useState('title');
  const cancelRef = useRef(false);
  const genRef = useRef(0);

  const compareActive = compareMode === 'mom' || compareMode === 'pop';
  const showCompare = Boolean(priorFrom && priorTo);
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
      const json = await fetchPfmProductOverview({
        from,
        to,
        priorFrom,
        priorTo,
        limit: 200,
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
  }, [from, to, priorFrom, priorTo]);

  useEffect(() => {
    load();
    return () => {
      cancelRef.current = true;
    };
  }, [load]);

  const loadPercent = useSoftLoadPercent(loading);

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
  const displayProductsPri =
    topMode === 'all'
      ? data?.productsPrior || []
      : (data?.productsPrior || []).slice(0, 5);
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

          <div className="vdp-grid-2 vdp-grid-2--equal vdp-grid-2--overview">
            <Card
              title={topTitle}
              sub={`${curLabel} · current`}
              actions={topActions}
            >
              <TopProductsTable
                rows={displayProducts}
                scroll={topMode === 'all'}
                labelMode={labelMode}
              />
            </Card>
            <Card
              title={topTitle}
              sub={`${priLabel} · prior`}
              actions={topActions}
            >
              <TopProductsTable
                rows={displayProductsPri}
                scroll={topMode === 'all'}
                labelMode={labelMode}
              />
            </Card>
          </div>

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

          <Card
            title={topTitle}
            sub="Current period · chipper_pfm_ga4_data"
            actions={topActions}
            style={{ marginBottom: 16 }}
          >
            <TopProductsTable
              rows={displayProducts}
              scroll={topMode === 'all'}
              labelMode={labelMode}
            />
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

      <ProductChannelTable
        rows={data?.channelsCurrent || []}
        priRows={data?.channelsPrior || []}
        curLabel={curLabel}
        priLabel={priLabel}
        compareActive={compareActive && showCompare}
        comparePctLabel={comparePctLabel}
        loading={loading}
      />
    </div>
  );
}
