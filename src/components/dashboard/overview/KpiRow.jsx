'use client';

import { useMemo, useState } from 'react';
import KpiCard from '../KpiCard';
import Delta from '../Delta';
import { useOverview } from './OverviewDataContext';
import { pctChange } from '@/lib/overview/comparePeriod';

const TAB_LABELS = {
  all:   'All Pages',
  vdp:   'VDP',
  srp:   'SRP',
  home:  'Homepage',
  other: 'Other',
};

const COLOR_CUR = '#4f86f7';
const COLOR_CMP = '#57cfa1';
const BAR_COLORS = ['#4f86f7', '#57cfa1', '#748ab2', '#f2be22', '#e8806f', '#8f7af6'];

function fmt(n) {
  return Number(n || 0).toLocaleString();
}

function dayLabel(iso) {
  if (!iso) return '';
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso.slice(5);
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: '2-digit',
    weekday: 'short',
  });
}

function compact(n) {
  return Intl.NumberFormat('en', {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(Number(n || 0));
}

function buildYTicks(max) {
  const cap = Math.max(Number(max) || 0, 1);
  if (cap <= 4) {
    return Array.from({ length: cap + 1 }, (_, i) => cap - i);
  }
  const raw = [1, 0.75, 0.5, 0.25, 0].map((r) => Math.round(cap * r));
  const ticks = [];
  for (const v of raw) {
    if (ticks.length === 0 || ticks[ticks.length - 1] !== v) ticks.push(v);
  }
  return ticks;
}

function toLinePoints(values, max, width = 1000, height = 220) {
  if (!values.length) return '';
  if (values.length === 1) {
    const y = height - (values[0] / max) * height;
    return `${(width / 2).toFixed(2)},${y.toFixed(2)}`;
  }
  return values
    .map((value, i) => {
      const x = (i / Math.max(values.length - 1, 1)) * width;
      const y = height - (value / max) * height;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(' ');
}

function dayLabelShort(iso) {
  if (!iso) return '';
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso.slice(5);
  const month = d.toLocaleDateString('en-US', { month: 'short' });
  const day = String(d.getDate()).padStart(2, '0');
  return `${month}-${day}`;
}

function buildDisplaySeries(dateList, series) {
  return (series || []).map((value, index) => ({
    date: dateList[index],
    value: Number(value) || 0,
  }));
}

function buildPairedSeries(dateList, series, compareDateList, compareSeries) {
  const cur = buildDisplaySeries(dateList, series);
  const cmp = buildDisplaySeries(compareDateList, compareSeries);
  const len = Math.max(cur.length, cmp.length, 1);
  return Array.from({ length: len }, (_, i) => ({
    curDate: cur[i]?.date,
    cmpDate: cmp[i]?.date,
    curValue: cur[i]?.value ?? 0,
    cmpValue: cmp[i]?.value ?? 0,
    label: cur[i]?.date ? dayLabelShort(cur[i].date) : `Day ${i + 1}`,
  }));
}

const DENSE_CHART_DAY_THRESHOLD = 16;

export default function KpiRow() {
  const {
    tab,
    totals,
    compareTotals,
    lyTotals,
    loading,
    seriesByTab,
    dateList,
    compareEnabled,
    compareSeriesByTab,
    compareDateList,
    compareLoading,
    vdpFiltersLoading,
    currentPeriodLabel,
    comparePeriodLabel,
  } = useOverview();

  // VDP Views total is independent of Channel Breakdown (filtered daily/total RPCs).
  const views = totals?.[tab] || 0;
  const compareViews = compareTotals?.[tab] || 0;
  const mom = pctChange(views, compareViews);
  const yoy = pctChange(views, lyTotals?.[tab] || 0);
  const series = useMemo(() => seriesByTab?.[tab] || [], [seriesByTab, tab]);
  const compareSeries = useMemo(
    () => compareSeriesByTab?.[tab] || [],
    [compareSeriesByTab, tab]
  );
  const viewsLabel = `${TAB_LABELS[tab] || 'Page'} Views`;
  const kpiLoading = loading || (tab === 'vdp' && vdpFiltersLoading);
  const kpiCompareLoading = compareLoading || (tab === 'vdp' && vdpFiltersLoading);

  return (
    <KpiRowChart
      tab={tab}
      viewsLabel={viewsLabel}
      views={views}
      compareViews={compareViews}
      loading={kpiLoading}
      compareLoading={kpiCompareLoading}
      dateList={dateList}
      compareDateList={compareDateList}
      series={series}
      compareSeries={compareSeries}
      compareEnabled={compareEnabled}
      currentPeriodLabel={currentPeriodLabel}
      comparePeriodLabel={comparePeriodLabel}
      mom={mom}
      yoy={yoy}
    />
  );
}

function KpiRowChart({
  tab,
  viewsLabel,
  views,
  compareViews,
  loading,
  compareLoading,
  dateList,
  compareDateList,
  series,
  compareSeries,
  compareEnabled,
  currentPeriodLabel,
  comparePeriodLabel,
  mom,
  yoy,
}) {
  const [chartMode, setChartMode] = useState('bar');
  const totalDelta = pctChange(views, compareViews);
  const gradientId = `kpi-line-area-${tab}`;

  const displaySeries = useMemo(
    () => buildDisplaySeries(dateList, series),
    [dateList, series]
  );
  const pairedSeries = useMemo(
    () => buildPairedSeries(dateList, series, compareDateList, compareSeries),
    [dateList, series, compareDateList, compareSeries]
  );

  const chartSeries = compareEnabled ? pairedSeries : displaySeries;
  const isDenseChart = chartSeries.length >= DENSE_CHART_DAY_THRESHOLD;
  const isSingleDay = chartSeries.length === 1;

  const max = useMemo(() => {
    if (compareEnabled) {
      const vals = pairedSeries.flatMap((d) => [d.curValue, d.cmpValue]);
      const mx = vals.length ? Math.max(...vals) : 0;
      return mx > 0 ? mx : 1;
    }
    const mx = displaySeries.length ? Math.max(...displaySeries.map((d) => d.value)) : 0;
    return mx > 0 ? mx : 1;
  }, [compareEnabled, pairedSeries, displaySeries]);

  const yTicks = useMemo(() => buildYTicks(max), [max]);
  const curLinePoints = useMemo(
    () => toLinePoints(pairedSeries.map((d) => d.curValue), max),
    [pairedSeries, max]
  );
  const cmpLinePoints = useMemo(
    () => toLinePoints(pairedSeries.map((d) => d.cmpValue), max),
    [pairedSeries, max]
  );
  const singleLinePoints = useMemo(
    () => toLinePoints(displaySeries.map((d) => d.value), max),
    [displaySeries, max]
  );

  const viewsDisplay = loading && !views ? '…' : fmt(views);
  const compareDisplay = compareLoading && !compareViews ? '…' : fmt(compareViews);

  return (
    <div className="kpi-stack">
      {compareEnabled ? (
        <div className="kpi-compare-totals">
          <div className="kpi-compare-total-row">
            <span className="kpi-compare-total-dot" style={{ background: COLOR_CUR }} />
            <span className="kpi-compare-total-label">{currentPeriodLabel}</span>
            <span className="kpi-compare-total-value">{viewsDisplay}</span>
          </div>
          <div className="kpi-compare-total-row">
            <span className="kpi-compare-total-dot" style={{ background: COLOR_CMP }} />
            <span className="kpi-compare-total-label">{comparePeriodLabel}</span>
            <span className="kpi-compare-total-value">{compareDisplay}</span>
          </div>
          <div className="kpi-compare-total-delta">
            Change <Delta value={totalDelta} />
          </div>
        </div>
      ) : (
        <div className="kpi-row">
          <KpiCard label={viewsLabel} value={viewsDisplay} mom={mom} yoy={yoy} color="var(--acc)" />
        </div>
      )}

      <div className="kpi-inline-chart">
        <div className="kpi-inline-head kpi-inline-head--compare">
          <div className="kpi-inline-head-left">
            <div className="kpi-inline-title">{viewsLabel} by Date</div>
          </div>
          <div className="kpi-inline-head-right">
            {compareEnabled && (
              <div className="kpi-chart-legend">
                <span className="kpi-chart-legend-item">
                  <span className="kpi-chart-legend-dot" style={{ background: COLOR_CUR }} />
                  {currentPeriodLabel}
                </span>
                <span className="kpi-chart-legend-item">
                  <span className="kpi-chart-legend-dot" style={{ background: COLOR_CMP }} />
                  {comparePeriodLabel}
                </span>
              </div>
            )}
            <div className="chart-mode" role="group" aria-label="Chart type">
              <button
                type="button"
                className={`cm-btn ${chartMode === 'bar' ? 'active' : ''}`}
                onClick={() => setChartMode('bar')}
                aria-pressed={chartMode === 'bar'}
              >
                Bar
              </button>
              <button
                type="button"
                className={`cm-btn ${chartMode === 'line' ? 'active' : ''}`}
                onClick={() => setChartMode('line')}
                aria-pressed={chartMode === 'line'}
              >
                Line
              </button>
            </div>
          </div>
        </div>

        <div className="kpi-big-chart">
          <div className="kpi-big-y">
            {yTicks.map((tick, i) => (
              <div key={`y-${i}-${tick}`} className="kpi-big-y-row">
                <span>{compact(tick)}</span>
              </div>
            ))}
          </div>

          <div className={`kpi-inline-plot ${isDenseChart ? 'kpi-inline-plot--dense' : ''}`}>
            {chartMode === 'bar' ? (
              <div
                className={[
                  'kpi-inline-bar-wrap',
                  isDenseChart ? 'kpi-inline-bar-wrap--dense' : '',
                  isSingleDay ? 'kpi-inline-bar-wrap--single' : '',
                  compareEnabled ? 'kpi-inline-bar-wrap--paired' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
              >
                <div
                  className={[
                    'kpi-inline-bars',
                    isDenseChart ? 'kpi-inline-bars--dense' : '',
                    isSingleDay ? 'kpi-inline-bars--single' : '',
                    compareEnabled ? 'kpi-inline-bars--paired' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                >
                  {compareEnabled
                    ? pairedSeries.map((item, index) => {
                        const hCur = Math.max(2, Math.round((item.curValue / max) * 200));
                        const hCmp = Math.max(2, Math.round((item.cmpValue / max) * 200));
                        return (
                          <div key={`pair-${item.curDate || index}`} className="kpi-inline-col kpi-inline-col--paired">
                            <div className="kpi-compare-bar-pair">
                              <div
                                className="kpi-inline-bar kpi-inline-bar--cur"
                                style={{ height: hCur, background: COLOR_CUR }}
                                title={`${currentPeriodLabel}: ${fmt(item.curValue)}`}
                              >
                                <div className="kpi-inline-tip">{fmt(item.curValue)}</div>
                              </div>
                              <div
                                className="kpi-inline-bar kpi-inline-bar--cmp"
                                style={{ height: hCmp, background: COLOR_CMP }}
                                title={`${comparePeriodLabel}: ${fmt(item.cmpValue)}`}
                              >
                                <div className="kpi-inline-tip">{fmt(item.cmpValue)}</div>
                              </div>
                            </div>
                          </div>
                        );
                      })
                    : displaySeries.map((item, index) => {
                        const h = Math.max(2, Math.round((item.value / max) * 200));
                        return (
                          <div key={`${item.date || index}`} className="kpi-inline-col">
                            <div
                              className="kpi-inline-bar"
                              style={{ height: h, background: BAR_COLORS[index % BAR_COLORS.length] }}
                            >
                              <div className="kpi-inline-tip">{fmt(item.value)}</div>
                            </div>
                          </div>
                        );
                      })}
                </div>
                <div
                  className={[
                    'kpi-inline-bar-dates',
                    isDenseChart ? 'kpi-inline-bar-dates--dense' : '',
                    isSingleDay ? 'kpi-inline-bar-dates--single' : '',
                    compareEnabled ? 'kpi-inline-bar-dates--paired' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                >
                  {(compareEnabled ? pairedSeries : displaySeries).map((item, index) => (
                    <div
                      key={`date-${index}`}
                      className="kpi-inline-date"
                      title={
                        compareEnabled
                          ? `${dayLabel(item.curDate)} vs ${dayLabel(item.cmpDate)}`
                          : dayLabel(item.date)
                      }
                    >
                      {compareEnabled
                        ? item.label
                        : (isDenseChart ? dayLabelShort(item.date) : dayLabel(item.date))}
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="kpi-inline-line">
                <svg
                  width="100%"
                  height="220"
                  viewBox="0 0 1000 220"
                  preserveAspectRatio="none"
                  aria-label={`${viewsLabel} line chart`}
                >
                  {compareEnabled ? (
                    <>
                      <polyline
                        fill="none"
                        stroke={COLOR_CMP}
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeDasharray="6 4"
                        points={cmpLinePoints}
                      />
                      <polyline
                        fill="none"
                        stroke={COLOR_CUR}
                        strokeWidth="3"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        points={curLinePoints}
                      />
                    </>
                  ) : (
                    <>
                      <defs>
                        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={COLOR_CUR} stopOpacity="0.35" />
                          <stop offset="100%" stopColor={COLOR_CUR} stopOpacity="0.05" />
                        </linearGradient>
                      </defs>
                      <path
                        d={`M0,220 L${singleLinePoints.split(' ').join(' L')} L1000,220 Z`}
                        fill={`url(#${gradientId})`}
                      />
                      <polyline
                        fill="none"
                        stroke={COLOR_CUR}
                        strokeWidth="3"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        points={singleLinePoints}
                      />
                    </>
                  )}
                </svg>
                <div
                  className={[
                    'kpi-inline-line-dates',
                    isDenseChart ? 'kpi-inline-line-dates--dense' : '',
                    isSingleDay ? 'kpi-inline-line-dates--single' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  style={
                    isSingleDay
                      ? undefined
                      : {
                          gridTemplateColumns: `repeat(${Math.max(chartSeries.length, 1)}, minmax(0, 1fr))`,
                        }
                  }
                >
                  {(compareEnabled ? pairedSeries : displaySeries).map((item, index) => (
                    <div
                      key={`line-${index}`}
                      className="kpi-inline-date"
                      title={
                        compareEnabled
                          ? `${dayLabel(item.curDate)} vs ${dayLabel(item.cmpDate)}`
                          : dayLabel(item.date)
                      }
                    >
                      {compareEnabled
                        ? item.label
                        : (isDenseChart ? dayLabelShort(item.date) : dayLabel(item.date))}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
