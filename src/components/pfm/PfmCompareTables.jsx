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

/** "SEP 2026", or "JUN–SEP 2026" / "DEC 2025–JAN 2026" for multi-month ranges. */
export function shortMonthLabel(fromIso, toIso) {
  if (!fromIso || !toIso) return '';
  const part = (iso, withYear) => {
    const d = new Date(`${String(iso).slice(0, 10)}T12:00:00`);
    const m = d.toLocaleDateString('en-US', { month: 'short' }).toUpperCase();
    return withYear ? `${m} ${d.getFullYear()}` : m;
  };
  if (String(fromIso).slice(0, 7) === String(toIso).slice(0, 7)) {
    return part(fromIso, true);
  }
  const sameYear = String(fromIso).slice(0, 4) === String(toIso).slice(0, 4);
  return `${part(fromIso, !sameYear)}–${part(toIso, true)}`;
}

/** Month labels shown once per row; value cells stack the same three lines. */
function PeriodCell({ curShort, priShort, comparePctLabel }) {
  return (
    <td className="mx-period-cell">
      <div className="mx-lines">
        <span className="mx-lbl">{curShort}</span>
        <span className="mx-lbl">{priShort}</span>
        <span className="mx-lbl">{comparePctLabel}</span>
      </div>
    </td>
  );
}

function StackedValueCell({ cur, pri, delta, className = 'right mono', title }) {
  return (
    <td className={className} title={title}>
      <div className="mx-lines">
        <span className="mx-val mx-val--cur">{fmt(cur)}</span>
        <span className="mx-val">{fmt(pri)}</span>
        <span className="mx-val mx-val--delta">
          <Delta value={delta ?? pctChange(cur, pri)} />
        </span>
      </div>
    </td>
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
        {firstCols.map((c) => firstTh(c))}
        <th className="mx-period-col">Period</th>
        {metricKeys.map((k) => (
          <SortTh key={k} col={`${k}:cur`} sort={sort} onSort={onSort} className="right">
            {METRIC_LABELS[k]}
          </SortTh>
        ))}
      </tr>
    </thead>
  );
}

function MetricCells({ metricKeys, compareActive, cur, pri, delta, periodProps }) {
  if (compareActive) {
    return (
      <>
        <PeriodCell {...periodProps} />
        {metricKeys.map((k) => (
          <StackedValueCell key={k} cur={cur[k]} pri={pri[k]} delta={delta[k]} />
        ))}
      </>
    );
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

function tableClass(extra, compareActive) {
  return `cmp-tbl ${extra}${compareActive ? ' cmp-tbl--stacked' : ''}`;
}

/** Channel rows keyed by `channel_bucket`, cur/prior/Δ per metric when comparing. */
export function ChannelCompareTable({
  title,
  rows,
  priRows,
  metricKeys,
  curLabel,
  priLabel,
  curShort,
  priShort,
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

  const colCount = 1 + (compareActive ? 1 : 0) + metricKeys.length;
  const periodProps = {
    curShort: curShort || curLabel,
    priShort: priShort || priLabel,
    comparePctLabel,
  };

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
                    periodProps={periodProps}
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
                  periodProps={periodProps}
                />
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const MATRIX_METRIC_KEYS = ['views', 'newUsers', 'totalUsers', 'returningUsers'];
const OTHER_CHANNELS = 'Other';

/**
 * Product rows x channel column groups; each group has Views / New / Total /
 * Returning users. Channels not in `selectedChannels` roll into "Other".
 */
export function ProductChannelMatrixTable({
  title,
  sub,
  actions,
  rows,
  priRows,
  compareActive = false,
  curLabel,
  priLabel,
  curShort,
  priShort,
  comparePctLabel = 'MoM',
  productLimit = 5,
  /** Channel labels to show as groups (views-ranked order preferred). */
  selectedChannels = null,
  channelLimit = 3,
  labelMode = 'title',
  loading,
  emptyText = 'No product channel data for this period.',
  style,
}) {
  const { groups, productRows } = useMemo(() => {
    const channelViews = new Map();
    for (const r of rows || []) {
      channelViews.set(r.channel, (channelViews.get(r.channel) || 0) + (Number(r.views) || 0));
    }
    const channels = [...channelViews.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([ch]) => ch);
    const selectedList = Array.isArray(selectedChannels) ? selectedChannels : null;
    const selectedSet = new Set((selectedList || []).filter(Boolean));
    const shown =
      selectedList === null
        ? channelLimit === 'all'
          ? channels
          : channels.slice(0, Number(channelLimit) || 3)
        : channels.filter((ch) => selectedSet.has(ch));
    const hasOther = shown.length < channels.length;
    const groupNames = hasOther ? [...shown, OTHER_CHANNELS] : shown;
    const groupIndex = new Map(shown.map((ch, i) => [ch, i]));

    const byPath = new Map();
    for (const r of rows || []) {
      let p = byPath.get(r.pagePath);
      if (!p) {
        p = {
          pagePath: r.pagePath,
          pageTitle: r.pageTitle,
          groups: groupNames.map(() => emptyMetrics()),
          totalViews: 0,
        };
        byPath.set(r.pagePath, p);
      }
      if (!p.pageTitle && r.pageTitle) p.pageTitle = r.pageTitle;
      const gi = groupIndex.has(r.channel) ? groupIndex.get(r.channel) : groupNames.length - 1;
      const m = metricsFromRow(r);
      addMetrics(p.groups[gi], m);
      p.totalViews += m.views;
    }
    for (const p of byPath.values()) {
      for (const g of p.groups) g.returningUsers = returningUsers(g.totalUsers, g.newUsers);
    }

    const priByPath = new Map();
    if (compareActive) {
      const otherIdx = hasOther ? groupNames.length - 1 : -1;
      for (const r of priRows || []) {
        const gi = groupIndex.has(r.channel) ? groupIndex.get(r.channel) : otherIdx;
        if (gi < 0) continue;
        let groupsPri = priByPath.get(r.pagePath);
        if (!groupsPri) {
          groupsPri = groupNames.map(() => emptyMetrics());
          priByPath.set(r.pagePath, groupsPri);
        }
        addMetrics(groupsPri[gi], metricsFromRow(r));
      }
      for (const groupsPri of priByPath.values()) {
        for (const g of groupsPri) g.returningUsers = returningUsers(g.totalUsers, g.newUsers);
      }
    }

    const sorted = [...byPath.values()].sort(
      (a, b) => b.totalViews - a.totalViews || a.pagePath.localeCompare(b.pagePath)
    );
    const limited = productLimit === 'all' ? sorted : sorted.slice(0, productLimit);
    return {
      groups: groupNames.map((name, i) => ({
        key: `g${i}`,
        priKey: `p${i}`,
        name,
        color: name === OTHER_CHANNELS ? '#64748b' : colorForChannel(name, i),
      })),
      productRows: limited.map((p, i) => {
        const row = { rank: i + 1, pagePath: p.pagePath, pageTitle: p.pageTitle };
        const pri = priByPath.get(p.pagePath);
        p.groups.forEach((g, gi) => {
          row[`g${gi}`] = g;
          row[`p${gi}`] = pri?.[gi] || emptyMetrics();
        });
        return row;
      }),
    };
  }, [rows, priRows, compareActive, productLimit, channelLimit, selectedChannels]);

  const totals = useMemo(() => {
    const out = {};
    for (const g of groups) {
      const t = emptyMetrics();
      const tp = emptyMetrics();
      for (const r of productRows) {
        addMetrics(t, r[g.key]);
        addMetrics(tp, r[g.priKey]);
      }
      t.returningUsers = returningUsers(t.totalUsers, t.newUsers);
      tp.returningUsers = returningUsers(tp.totalUsers, tp.newUsers);
      out[g.key] = t;
      out[g.priKey] = tp;
    }
    return out;
  }, [groups, productRows]);

  const labelOf = useCallback(
    (r) =>
      labelMode === 'url' ? r.pagePath : String(r.pageTitle || '').trim() || r.pagePath,
    [labelMode]
  );

  const [sort, onSort] = useTableSort();
  const sortedRows = useMemo(() => {
    if (sort?.col === 'rank') {
      return sort.dir === 'asc' ? productRows : [...productRows].reverse();
    }
    return sortRows(productRows, sort, labelOf);
  }, [productRows, sort, labelOf]);

  const buildLines = useCallback(() => {
    const header = [
      '#',
      labelMode === 'url' ? 'URL' : 'Product',
      ...groups.flatMap((g) =>
        MATRIX_METRIC_KEYS.flatMap((k) =>
          compareActive
            ? [
                `${g.name} ${METRIC_LABELS[k]} ${curLabel}`,
                `${g.name} ${METRIC_LABELS[k]} ${priLabel}`,
                `${g.name} ${METRIC_LABELS[k]} ${comparePctLabel}`,
              ]
            : [`${g.name} ${METRIC_LABELS[k]}`]
        )
      ),
    ];
    const vals = (r) =>
      groups.flatMap((g) =>
        MATRIX_METRIC_KEYS.flatMap((k) =>
          compareActive
            ? [
                r[g.key][k],
                r[g.priKey][k],
                fmtDelta(pctChange(r[g.key][k], r[g.priKey][k])),
              ]
            : [r[g.key][k]]
        )
      );
    const lines = [header.join('\t')];
    sortedRows.forEach((r) => lines.push([r.rank, labelOf(r), ...vals(r)].join('\t')));
    lines.push(['', 'Total', ...vals(totals)].join('\t'));
    return lines;
  }, [groups, sortedRows, totals, labelMode, labelOf, compareActive, curLabel, priLabel, comparePctLabel]);
  const [copied, onCopy] = useCopy(buildLines);

  const colCount = 2 + (compareActive ? 1 : 0) + groups.length * MATRIX_METRIC_KEYS.length;
  const periodCell = compareActive ? (
    <PeriodCell
      curShort={curShort || curLabel}
      priShort={priShort || priLabel}
      comparePctLabel={comparePctLabel}
    />
  ) : null;
  const groupCellClass = (gi, k) =>
    `right mono${gi % 2 ? ' mx-grp-alt' : ''}${k === MATRIX_METRIC_KEYS[0] ? ' mx-grp-start' : ''}`;
  const renderCell = (src, g, gi, k) => {
    const cur = src[g.key][k];
    if (!compareActive) {
      return (
        <td key={`${g.key}-${k}`} className={groupCellClass(gi, k)}>
          {fmt(cur)}
        </td>
      );
    }
    const pri = src[g.priKey][k];
    return (
      <StackedValueCell
        key={`${g.key}-${k}`}
        cur={cur}
        pri={pri}
        className={groupCellClass(gi, k)}
        title={`${curLabel}: ${fmt(cur)}\n${priLabel}: ${fmt(pri)}`}
      />
    );
  };

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
      <div
        className={`cmp-table-wrap cmp-table-wrap--pages${
          productLimit === 'all' ? ' cmp-table-wrap--scroll cmp-table-wrap--rows-10' : ''
        }`}
      >
        <table
          className={`cmp-tbl cmp-tbl--pages cmp-tbl--matrix${
            compareActive ? ' cmp-tbl--matrix--compare' : ''
          }`}
        >
          <thead>
            <tr>
              <SortTh col="rank" textCol sort={sort} onSort={onSort} rowSpan={2} className="cmp-rank-col">
                #
              </SortTh>
              <SortTh col="label" textCol sort={sort} onSort={onSort} rowSpan={2} className="cmp-page-col">
                {labelMode === 'url' ? 'URL' : 'Product'}
              </SortTh>
              {compareActive ? (
                <th rowSpan={2} className="mx-period-col">
                  Period
                </th>
              ) : null}
              {groups.map((g, gi) => (
                <th
                  key={g.key}
                  colSpan={MATRIX_METRIC_KEYS.length}
                  className={`center mx-grp-head mx-grp-start${gi % 2 ? ' mx-grp-alt' : ''}`}
                >
                  <span className="cmp-channel-dot mx-grp-dot" style={{ background: g.color }} />
                  {g.name}
                </th>
              ))}
            </tr>
            <tr>
              {groups.map((g, gi) => (
                <Fragment key={g.key}>
                  {MATRIX_METRIC_KEYS.map((k) => (
                    <SortTh
                      key={k}
                      col={`${k}:${g.key}`}
                      sort={sort}
                      onSort={onSort}
                      className={groupCellClass(gi, k)}
                    >
                      {METRIC_LABELS[k]}
                    </SortTh>
                  ))}
                </Fragment>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && sortedRows.length === 0 ? (
              <tr>
                <td colSpan={colCount} className="cmp-table-loading">
                  Loading product vs channel data…
                </td>
              </tr>
            ) : sortedRows.length === 0 ? (
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
                    </td>
                    {periodCell}
                    {groups.map((g, gi) =>
                      MATRIX_METRIC_KEYS.map((k) => renderCell(r, g, gi, k))
                    )}
                  </tr>
                );
              })
            )}
          </tbody>
          {!loading && sortedRows.length > 0 ? (
            <tfoot>
              <tr className="cmp-tbl-total-row cmp-tbl-total-row--plain">
                <td className="cmp-rank-col" />
                <td className="cmp-page-cell">Total</td>
                {periodCell}
                {groups.map((g, gi) =>
                  MATRIX_METRIC_KEYS.map((k) => renderCell(totals, g, gi, k))
                )}
              </tr>
            </tfoot>
          ) : null}
        </table>
      </div>
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
  curShort,
  priShort,
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

  const colCount = 2 + (compareActive ? 1 : 0) + metricKeys.length;
  const periodProps = {
    curShort: curShort || curLabel,
    priShort: priShort || priLabel,
    comparePctLabel,
  };

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
                      periodProps={periodProps}
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
                  periodProps={periodProps}
                />
              </tr>
            </tfoot>
          ) : null}
        </table>
      </div>
    </div>
  );
}
