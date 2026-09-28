'use client';

import { Fragment, useCallback, useMemo, useState } from 'react';
import { colorForChannel } from '@/lib/ga4/channelDisplay';
import { pctChange } from '@/lib/overview/comparePeriod';
import { fmt } from '@/lib/vdp/aggregates';
import Delta from '@/components/dashboard/Delta';

const PFM_SITE_ORIGIN = 'https://pureformen.com';

export const METRIC_LABELS = {
  views: 'Views',
  sessions: 'Sessions',
  conversions: 'Conversions',
  totalUsers: 'Total Users',
  newUsers: 'New Users',
  returningUsers: 'Returning Users',
};

export function pfmPageHref(pagePath) {
  const path = String(pagePath || '').trim();
  if (!path || path === '(not set)') return null;
  if (/^https?:\/\//i.test(path)) return path;
  return `${PFM_SITE_ORIGIN}${path.startsWith('/') ? path : `/${path}`}`;
}

export function returningUsers(totalUsers, newUsers) {
  return Math.max((Number(totalUsers) || 0) - (Number(newUsers) || 0), 0);
}

function emptyMetrics() {
  return {
    views: 0,
    sessions: 0,
    conversions: 0,
    totalUsers: 0,
    newUsers: 0,
    returningUsers: 0,
  };
}

function metricsFromRow(r) {
  const totalUsers = Number(r?.totalUsers) || 0;
  const newUsers = Number(r?.newUsers) || 0;
  return {
    views: Number(r?.views) || 0,
    sessions: Number(r?.sessions) || 0,
    conversions: Number(r?.conversions) || 0,
    totalUsers,
    newUsers,
    returningUsers: returningUsers(totalUsers, newUsers),
  };
}

function addMetrics(acc, m) {
  for (const k of Object.keys(acc)) acc[k] += m[k] || 0;
  return acc;
}

function deltaMetrics(cur, pri) {
  const out = {};
  for (const k of Object.keys(cur)) out[k] = pctChange(cur[k], pri[k]);
  return out;
}

function fmtDelta(n) {
  return `${n >= 0 ? '+' : ''}${n}%`;
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

/**
 * Sort state: `{ col, dir }` where col is a first-column key (e.g. 'label')
 * or `${metric}:${field}` with field cur | pri | delta. `null` = default order.
 */
function useTableSort() {
  const [sort, setSort] = useState(null);
  const onSort = useCallback((col, textCol = false) => {
    setSort((prev) => {
      if (!prev || prev.col !== col) return { col, dir: textCol ? 'asc' : 'desc' };
      const first = textCol ? 'asc' : 'desc';
      if (prev.dir === first) return { col, dir: first === 'asc' ? 'desc' : 'asc' };
      return null;
    });
  }, []);
  return [sort, onSort];
}

function sortRows(rows, sort, labelOf) {
  if (!sort) return rows;
  const mult = sort.dir === 'asc' ? 1 : -1;
  const out = [...rows];
  if (sort.col === 'label') {
    out.sort((a, b) => mult * String(labelOf(a)).localeCompare(String(labelOf(b))));
    return out;
  }
  const [metric, field] = sort.col.split(':');
  const val = (r) => {
    const v = Number(r[field]?.[metric]);
    return Number.isFinite(v) ? v : 0;
  };
  out.sort((a, b) => mult * (val(a) - val(b)));
  return out;
}

function SortTh({ col, sort, onSort, textCol, className, children, ...rest }) {
  const active = sort?.col === col;
  const arrow = active ? (sort.dir === 'asc' ? '▲' : '▼') : '↕';
  return (
    <th
      {...rest}
      className={`${className || ''} cmp-sort-th${active ? ' is-sorted' : ''}`}
      onClick={() => onSort(col, textCol)}
      aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
      title="Click to sort"
    >
      {children}
      <span className="cmp-sort-ind">{arrow}</span>
    </th>
  );
}

function CompareHead({
  firstCols,
  metricKeys,
  compareActive,
  curLabel,
  priLabel,
  comparePctLabel,
  sort,
  onSort,
}) {
  const firstTh = (c, extra = {}) =>
    c.sortCol ? (
      <SortTh
        key={c.key}
        col={c.sortCol}
        textCol
        sort={sort}
        onSort={onSort}
        className={c.className}
        {...extra}
      >
        {c.label}
      </SortTh>
    ) : (
      <th key={c.key} className={c.className} {...extra}>
        {c.label}
      </th>
    );

  if (!compareActive) {
    return (
      <thead>
        <tr>
          {firstCols.map((c) => firstTh(c))}
          {metricKeys.map((k) => (
            <SortTh key={k} col={`${k}:cur`} sort={sort} onSort={onSort} className="right">
              {METRIC_LABELS[k]}
            </SortTh>
          ))}
        </tr>
      </thead>
    );
  }
  return (
    <thead>
      <tr>
        {firstCols.map((c) => firstTh(c, { rowSpan: 2 }))}
        {metricKeys.map((k) => (
          <th key={k} className="center" colSpan={3}>
            {METRIC_LABELS[k]}
          </th>
        ))}
      </tr>
      <tr>
        {metricKeys.map((k) => (
          <Fragment key={k}>
            <SortTh col={`${k}:cur`} sort={sort} onSort={onSort} className="col-cur">
              {curLabel}
            </SortTh>
            <SortTh col={`${k}:pri`} sort={sort} onSort={onSort} className="col-prev">
              {priLabel}
            </SortTh>
            <SortTh col={`${k}:delta`} sort={sort} onSort={onSort} className="col-mom">
              {comparePctLabel}
            </SortTh>
          </Fragment>
        ))}
      </tr>
    </thead>
  );
}

function MetricCells({ metricKeys, compareActive, cur, pri, delta }) {
  if (compareActive) {
    return metricKeys.map((k) => (
      <MetricCompareCells key={k} cur={cur[k]} pri={pri[k]} delta={delta[k]} />
    ));
  }
  return metricKeys.map((k) => (
    <td key={k} className="right mono">
      {fmt(cur[k])}
    </td>
  ));
}

function useCopy(buildLines) {
  const [copied, setCopied] = useState(false);
  const onCopy = useCallback(() => {
    navigator.clipboard
      .writeText(buildLines().join('\n'))
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1800);
      })
      .catch(() => {});
  }, [buildLines]);
  return [copied, onCopy];
}

function copyLines({ firstHeaders, metricKeys, compareActive, curLabel, priLabel, comparePctLabel, rows, totals, firstValues }) {
  const header = compareActive
    ? metricKeys.flatMap((k) => [
        `${METRIC_LABELS[k]} ${curLabel}`,
        `${METRIC_LABELS[k]} ${priLabel}`,
        `${METRIC_LABELS[k]} ${comparePctLabel}`,
      ])
    : metricKeys.map((k) => METRIC_LABELS[k]);
  const values = (r) =>
    compareActive
      ? metricKeys.flatMap((k) => [r.cur[k], r.pri[k], fmtDelta(r.delta[k])])
      : metricKeys.map((k) => r.cur[k]);
  const lines = [[...firstHeaders, ...header].join('\t')];
  rows.forEach((r, i) => lines.push([...firstValues(r, i), ...values(r)].join('\t')));
  lines.push(
    [...firstHeaders.map((_, i) => (i === firstHeaders.length - 1 ? 'Total' : '')), ...values(totals)].join('\t')
  );
  return lines;
}

function PanelHead({ title, sub, actions, compareActive, copied, onCopy, loading }) {
  return (
    <div className="vdp-cmp-head">
      <div>
        <h3>{title}</h3>
        <div className="vdp-cardsub" style={{ marginBottom: 0 }}>
          {sub}
        </div>
      </div>
      <div className="vdp-cmp-head-actions">
        {actions}
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
  );
}

function PanelFoot({ compareActive, curLabel, priLabel, comparePctLabel }) {
  if (!compareActive) return null;
  return (
    <div className="vdp-cmp-foot">
      <div className="vdp-cmp-legend">
        <span className="leg-cur" /> {curLabel}
        <span className="leg-prev" /> {priLabel}
      </div>
      <div className="vdp-cmp-note">
        {comparePctLabel}: {curLabel} vs {priLabel}
      </div>
    </div>
  );
}

function tableClass(extra, compareActive) {
  return `cmp-tbl ${extra}${
    compareActive ? ' cmp-tbl--period-compare cmp-tbl--multi-metric' : ''
  }`;
}

/** Channel rows keyed by `channel_bucket`, cur/prior/Δ per metric when comparing. */
export function ChannelCompareTable({
  title,
  rows,
  priRows,
  metricKeys,
  curLabel,
  priLabel,
  compareActive,
  comparePctLabel = 'MoM',
  loading,
  emptyText = 'No channel data for this period.',
  style,
}) {
  const channelRows = useMemo(() => {
    const curMap = new Map();
    const priMap = new Map();
    for (const r of rows || []) {
      curMap.set(String(r.channel_bucket || '(not set)'), metricsFromRow(r));
    }
    for (const r of priRows || []) {
      priMap.set(String(r.channel_bucket || '(not set)'), metricsFromRow(r));
    }
    const keys = compareActive
      ? new Set([...curMap.keys(), ...priMap.keys()])
      : new Set(curMap.keys());
    const out = [...keys].map((ch) => {
      const cur = curMap.get(ch) || emptyMetrics();
      const pri = priMap.get(ch) || emptyMetrics();
      return { ch, cur, pri, delta: deltaMetrics(cur, pri) };
    });
    out.sort(
      (a, b) =>
        b.cur.views - a.cur.views ||
        b.pri.views - a.pri.views ||
        a.ch.localeCompare(b.ch)
    );
    return out.map((r, i) => ({ ...r, color: colorForChannel(r.ch, i) }));
  }, [rows, priRows, compareActive]);

  const [sort, onSort] = useTableSort();
  const sortedRows = useMemo(
    () => sortRows(channelRows, sort, (r) => r.ch),
    [channelRows, sort]
  );

  const totals = useMemo(() => {
    const cur = emptyMetrics();
    const pri = emptyMetrics();
    for (const r of channelRows) {
      addMetrics(cur, r.cur);
      addMetrics(pri, r.pri);
    }
    return { cur, pri, delta: deltaMetrics(cur, pri) };
  }, [channelRows]);

  const buildLines = useCallback(
    () =>
      copyLines({
        firstHeaders: ['Channel'],
        firstValues: (r) => [r.ch],
        metricKeys,
        compareActive,
        curLabel,
        priLabel,
        comparePctLabel,
        rows: sortedRows,
        totals,
      }),
    [metricKeys, compareActive, curLabel, priLabel, comparePctLabel, sortedRows, totals]
  );
  const [copied, onCopy] = useCopy(buildLines);

  const colCount = 1 + metricKeys.length * (compareActive ? 3 : 1);

  return (
    <div className="vdp-card vdp-cmp-panel" style={{ marginTop: 16, ...style }}>
      <PanelHead
        title={`${title}${compareActive ? ' — Period Comparison' : ''}`}
        sub={
          compareActive
            ? `${curLabel} vs ${priLabel} · ${comparePctLabel} · all metrics`
            : `${curLabel} · GA4 session channels`
        }
        copied={copied}
        onCopy={onCopy}
        loading={loading}
      />
      <div className="cmp-table-wrap">
        <table className={tableClass('cmp-tbl--channels', compareActive)}>
          <CompareHead
            firstCols={[{ key: 'ch', label: 'Channel', sortCol: 'label' }]}
            metricKeys={metricKeys}
            compareActive={compareActive}
            curLabel={curLabel}
            priLabel={priLabel}
            comparePctLabel={comparePctLabel}
            sort={sort}
            onSort={onSort}
          />
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
                  {emptyText}
                </td>
              </tr>
            ) : (
              sortedRows.map((r) => (
                <tr key={r.ch}>
                  <td>
                    <div className="cmp-channel-cell">
                      <div className="cmp-channel-dot" style={{ background: r.color }} />
                      <span>{r.ch}</span>
                    </div>
                  </td>
                  <MetricCells
                    metricKeys={metricKeys}
                    compareActive={compareActive}
                    cur={r.cur}
                    pri={r.pri}
                    delta={r.delta}
                  />
                </tr>
              ))
            )}
            {!loading && channelRows.length > 0 ? (
              <tr className="cmp-tbl-total-row cmp-tbl-total-row--plain">
                <td>Total</td>
                <MetricCells
                  metricKeys={metricKeys}
                  compareActive={compareActive}
                  cur={totals.cur}
                  pri={totals.pri}
                  delta={totals.delta}
                />
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      <PanelFoot
        compareActive={compareActive}
        curLabel={curLabel}
        priLabel={priLabel}
        comparePctLabel={comparePctLabel}
      />
    </div>
  );
}

/**
 * One row per URL (current-period order); prior metrics are looked up by the
 * same `pagePath`, so a page missing in the prior period shows 0 there.
 */
export function PageCompareTable({
  title,
  sub,
  actions,
  rows,
  priRows,
  metricKeys,
  curLabel,
  priLabel,
  compareActive,
  comparePctLabel = 'MoM',
  labelMode = 'title',
  scroll = false,
  loading,
  emptyText = 'No page data for this period.',
  style,
}) {
  const pageRows = useMemo(() => {
    const priMap = new Map();
    for (const r of priRows || []) priMap.set(String(r.pagePath), metricsFromRow(r));
    return (rows || []).map((r, i) => {
      const cur = metricsFromRow(r);
      const pri = priMap.get(String(r.pagePath)) || emptyMetrics();
      return {
        rank: i + 1,
        pagePath: r.pagePath,
        pageTitle: r.pageTitle,
        cur,
        pri,
        delta: deltaMetrics(cur, pri),
      };
    });
  }, [rows, priRows]);

  const totals = useMemo(() => {
    const cur = emptyMetrics();
    const pri = emptyMetrics();
    for (const r of pageRows) {
      addMetrics(cur, r.cur);
      addMetrics(pri, r.pri);
    }
    return { cur, pri, delta: deltaMetrics(cur, pri) };
  }, [pageRows]);

  const pageHeader = labelMode === 'url' ? 'URL' : 'Page';
  const labelOf = useCallback(
    (r) =>
      labelMode === 'url'
        ? r.pagePath
        : String(r.pageTitle || '').trim() || r.pagePath,
    [labelMode]
  );

  const [sort, onSort] = useTableSort();
  const sortedRows = useMemo(() => {
    if (sort?.col === 'rank') {
      return sort.dir === 'asc' ? pageRows : [...pageRows].reverse();
    }
    return sortRows(pageRows, sort, labelOf);
  }, [pageRows, sort, labelOf]);

  const buildLines = useCallback(
    () =>
      copyLines({
        firstHeaders: ['#', pageHeader],
        firstValues: (r) => [r.rank, labelOf(r)],
        metricKeys,
        compareActive,
        curLabel,
        priLabel,
        comparePctLabel,
        rows: sortedRows,
        totals,
      }),
    [pageHeader, labelOf, metricKeys, compareActive, curLabel, priLabel, comparePctLabel, sortedRows, totals]
  );
  const [copied, onCopy] = useCopy(buildLines);

  const colCount = 2 + metricKeys.length * (compareActive ? 3 : 1);

  return (
    <div className="vdp-card vdp-cmp-panel" style={{ marginBottom: 16, ...style }}>
      <PanelHead
        title={title}
        sub={sub}
        actions={actions}
        copied={copied}
        onCopy={onCopy}
        loading={loading}
      />
      <div className={`cmp-table-wrap cmp-table-wrap--pages${scroll ? ' cmp-table-wrap--scroll' : ''}`}>
        <table className={tableClass('cmp-tbl--pages', compareActive)}>
          <CompareHead
            firstCols={[
              { key: 'rank', label: '#', className: 'cmp-rank-col', sortCol: 'rank' },
              { key: 'page', label: pageHeader, className: 'cmp-page-col', sortCol: 'label' },
            ]}
            metricKeys={metricKeys}
            compareActive={compareActive}
            curLabel={curLabel}
            priLabel={priLabel}
            comparePctLabel={comparePctLabel}
            sort={sort}
            onSort={onSort}
          />
          <tbody>
            {loading && pageRows.length === 0 ? (
              <tr>
                <td colSpan={colCount} className="cmp-table-loading">
                  Loading page data…
                </td>
              </tr>
            ) : pageRows.length === 0 ? (
              <tr>
                <td colSpan={colCount} className="cmp-table-loading">
                  {emptyText}
                </td>
              </tr>
            ) : (
              sortedRows.map((r) => {
                const href = pfmPageHref(r.pagePath);
                const titleText = String(r.pageTitle || '').trim() || r.pagePath;
                const primary = labelMode === 'url' ? r.pagePath : titleText;
                return (
                  <tr key={r.pagePath}>
                    <td className="cmp-rank-col mono">{r.rank}</td>
                    <td className="cmp-page-cell">
                      {href ? (
                        <a
                          href={href}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="vdp-product-url"
                          title={`${titleText}\n${href}`}
                        >
                          {primary}
                        </a>
                      ) : (
                        primary
                      )}
                      {labelMode === 'both' && titleText !== r.pagePath ? (
                        <div className="cmp-page-path">{r.pagePath}</div>
                      ) : null}
                    </td>
                    <MetricCells
                      metricKeys={metricKeys}
                      compareActive={compareActive}
                      cur={r.cur}
                      pri={r.pri}
                      delta={r.delta}
                    />
                  </tr>
                );
              })
            )}
          </tbody>
          {!loading && pageRows.length > 0 ? (
            <tfoot>
              <tr className="cmp-tbl-total-row cmp-tbl-total-row--plain">
                <td />
                <td>Total</td>
                <MetricCells
                  metricKeys={metricKeys}
                  compareActive={compareActive}
                  cur={totals.cur}
                  pri={totals.pri}
                  delta={totals.delta}
                />
              </tr>
            </tfoot>
          ) : null}
        </table>
      </div>
      <PanelFoot
        compareActive={compareActive}
        curLabel={curLabel}
        priLabel={priLabel}
        comparePctLabel={comparePctLabel}
      />
    </div>
  );
}
