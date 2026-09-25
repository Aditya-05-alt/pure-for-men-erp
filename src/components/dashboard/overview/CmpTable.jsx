'use client';

import { useState, useMemo, useCallback, useEffect } from 'react';
import { Panel, PanelHeader, PanelBody } from '../Panel';
import Delta from '../Delta';
import ChannelGroupToggle from './ChannelGroupToggle';
import CompareBreakdownSection from '../CompareBreakdownSection';
import { useOverview } from './OverviewDataContext';
import { fetchChannelBreakdownBundle } from '@/lib/api/channelBreakdownFetch';
import { colorForChannel } from '@/lib/ga4/channelDisplay';
import {
  applyChannelGroupsToComparisonRows,
  filterByExpandedGroups,
} from '@/lib/ga4/channelGroups';
import { useChannelGroupExpansion } from '@/hooks/useChannelGroupExpansion';
import {
  mergeChannelComparison,
  sameMonthLastYearLabel,
  sameMonthLastYearRange,
} from '@/lib/overview/comparePeriod';

const TAB_TITLES = {
  all: 'All Pages',
  vdp: 'VDP',
  srp: 'SRP',
  home: 'Homepage',
  other: 'Other',
};

const VISIBLE_TABS = new Set(['all', 'vdp']);

function yoyCell(value, enabled) {
  if (!enabled) return <Delta value={0} />;
  return <Delta value={value ?? 0} />;
}

export default function CmpTable() {
  const {
    tab,
    clientKey,
    from,
    to,
    compareEnabled,
    compareFrom,
    compareTo,
    currentPeriodLabel,
    comparePeriodLabel,
    vdpFilters,
    beginBreakdownLoad,
    endBreakdownLoad,
    vdpChannelCurRows,
    vdpChannelCmpRows,
    vdpChannelLyRows,
    vdpChannelLoading,
    vdpChannelError,
    vdpChannelComparison,
  } = useOverview();

  const [allCurRows, setAllCurRows] = useState([]);
  const [allCmpRows, setAllCmpRows] = useState([]);
  const [allLyCurRows, setAllLyCurRows] = useState(null);
  const [allLoading, setAllLoading] = useState(false);
  const [allError, setAllError] = useState(null);
  const [copied, setCopied] = useState(false);
  const { expanded, isExpanded, toggle } = useChannelGroupExpansion(false);

  const yoyEnabled = VISIBLE_TABS.has(tab);
  const panelTitle = `${TAB_TITLES[tab] || 'Page'} Views by Channel — Period Comparison`;
  const lyPeriodLabel = useMemo(
    () => sameMonthLastYearLabel(from, to),
    [from, to]
  );

  const { lyFrom, lyTo } = useMemo(
    () => sameMonthLastYearRange(from, to),
    [from, to]
  );

  useEffect(() => {
    if (
      tab !== 'all'
      || !clientKey
      || !from
      || !to
      || !compareFrom
      || !compareTo
    ) {
      setAllCurRows([]);
      setAllCmpRows([]);
      setAllLyCurRows(null);
      setAllLoading(false);
      return undefined;
    }

    let cancelled = false;
    let loadTracked = false;
    setAllLoading(true);
    setAllError(null);
    beginBreakdownLoad();
    loadTracked = true;

    const fetchOpts = {
      clientId: clientKey,
      pageTypeFilter: 'ALL',
      vdpFilters,
      tab: 'all',
      onCancelCheck: () => cancelled,
      adaptiveChunks: true,
    };

    const loadPeriod = (range) =>
      fetchChannelBreakdownBundle({
        ...fetchOpts,
        from: range.from,
        to: range.to,
      });

    (async () => {
      try {
        const current = await loadPeriod({ from, to });
        if (cancelled) return;
        setAllCurRows(current || []);

        const compare = await loadPeriod({ from: compareFrom, to: compareTo });
        if (cancelled) return;
        setAllCmpRows(compare || []);

        if (yoyEnabled && lyFrom && lyTo) {
          const lyCurrent = await loadPeriod({ from: lyFrom, to: lyTo });
          if (cancelled) return;
          setAllLyCurRows(lyCurrent || []);
        } else {
          setAllLyCurRows(null);
        }
      } catch (fetchError) {
        if (cancelled) return;
        setAllError(fetchError?.message || 'Failed to load comparison data.');
        setAllCurRows([]);
        setAllCmpRows([]);
        setAllLyCurRows(null);
      } finally {
        if (loadTracked) endBreakdownLoad();
        if (!cancelled) setAllLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    tab,
    yoyEnabled,
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

  const curRows = tab === 'vdp' ? vdpChannelCurRows : allCurRows;
  const cmpRows = tab === 'vdp' ? vdpChannelCmpRows : allCmpRows;
  const lyCurRows = tab === 'vdp' ? vdpChannelLyRows : allLyCurRows;
  const loading = tab === 'vdp' ? vdpChannelLoading : allLoading;
  const error = tab === 'vdp' ? vdpChannelError : allError;

  const { rows, totals } = useMemo(() => {
    if (tab === 'vdp' && vdpChannelComparison) {
      return vdpChannelComparison;
    }
    return mergeChannelComparison(curRows, cmpRows, lyCurRows);
  }, [tab, vdpChannelComparison, curRows, cmpRows, lyCurRows]);

  const rowsWithColors = useMemo(() => {
    const colored = rows.map((r, i) => ({ ...r, color: colorForChannel(r.ch, i) }));
    return applyChannelGroupsToComparisonRows(colored);
  }, [rows]);

  const visibleRows = useMemo(
    () => filterByExpandedGroups(rowsWithColors, expanded),
    [rowsWithColors, expanded]
  );

  const showGroupColumn = useMemo(
    () => rowsWithColors.some((r) => r.isGroupRollup && r.collapsible),
    [rowsWithColors]
  );

  const onCopy = useCallback(() => {
    const lines = [
      [
        'Channel',
        currentPeriodLabel,
        comparePeriodLabel,
        lyPeriodLabel,
        'MoM',
        'YoY',
      ].join('\t'),
    ];
    rowsWithColors.forEach((r) => {
      lines.push(
        [
          r.ch,
          r.cur,
          r.cmp,
          yoyEnabled ? r.ly ?? 0 : 0,
          `${r.delta >= 0 ? '+' : ''}${r.delta}%`,
          yoyEnabled
            ? `${(r.curYoyDelta ?? 0) >= 0 ? '+' : ''}${r.curYoyDelta ?? 0}%`
            : '0%',
        ].join('\t')
      );
    });
    lines.push(
      [
        'Total',
        totals.cur,
        totals.cmp,
        yoyEnabled ? totals.ly ?? 0 : 0,
        `${totals.delta >= 0 ? '+' : ''}${totals.delta}%`,
        yoyEnabled
          ? `${(totals.curYoyDelta ?? 0) >= 0 ? '+' : ''}${totals.curYoyDelta ?? 0}%`
          : '0%',
      ].join('\t')
    );
    navigator.clipboard
      .writeText(lines.join('\n'))
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1800);
      })
      .catch(() => {});
  }, [
    rowsWithColors,
    totals,
    yoyEnabled,
    currentPeriodLabel,
    comparePeriodLabel,
    lyPeriodLabel,
  ]);

  if (!VISIBLE_TABS.has(tab)) return null;

  const showSideBySide = tab === 'vdp' && compareEnabled && compareFrom && compareTo;

  const copyButton = (
    <button
      type="button"
      className={`copy-btn ${copied ? 'copied' : ''}`}
      onClick={onCopy}
      style={{ marginLeft: 'auto' }}
      disabled={loading || !!error}
    >
      {copied ? (
        <>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="20 6 9 17 4 12" />
          </svg>
          Copied!
        </>
      ) : (
        <>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="9" y="9" width="13" height="13" rx="2" />
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
          </svg>
          Copy table
        </>
      )}
    </button>
  );

  const renderPeriodTable = (periodLabel, valueKey, { showMom = false } = {}) => (
    <Panel className="make-breakdown-panel cmp-period-pane">
      <PanelHeader title={periodLabel} />
      <PanelBody className="cmp-period-pane-body">
        <div className="cmp-table-wrap">
          <table className="cmp-tbl cmp-tbl--period-pane">
            <thead>
              <tr>
                <th>Channel</th>
                <th>Views</th>
                {showMom && <th className="col-mom">MoM</th>}
              </tr>
            </thead>
            <tbody>
              {loading && visibleRows.length === 0 ? (
                <tr>
                  <td colSpan={showMom ? 3 : 2} className="cmp-table-loading">
                    Loading channel comparison…
                  </td>
                </tr>
              ) : (
                visibleRows.map((r) => (
                  <tr
                    key={`${valueKey}-${r.rowKey || r.ch}`}
                    className={
                      r.isGroupRollup
                        ? 'cmp-tbl-row--group-rollup'
                        : r.isGroupMember
                        ? 'cmp-tbl-row--group-member'
                        : undefined
                    }
                  >
                    <td>
                      <div
                        className={`cmp-channel-cell${r.isGroupMember ? ' cmp-channel-cell--member' : ''}`}
                      >
                        {showGroupColumn && (
                          r.isGroupRollup && r.collapsible ? (
                            <ChannelGroupToggle
                              expanded={isExpanded(r.groupKey)}
                              onToggle={() => toggle(r.groupKey)}
                              label={r.ch}
                            />
                          ) : (
                            <span className="cmp-channel-toggle-spacer" aria-hidden />
                          )
                        )}
                        <div
                          className="cmp-channel-dot"
                          style={{ background: r.color }}
                        />
                        <span>{r.ch}</span>
                      </div>
                    </td>
                    <td>{(r[valueKey] ?? 0).toLocaleString()}</td>
                    {showMom && (
                      <td className="col-mom">
                        <Delta value={r.delta} />
                      </td>
                    )}
                  </tr>
                ))
              )}
              {!loading && visibleRows.length > 0 && (
                <tr className="cmp-tbl-total-row">
                  <td>Total VDP</td>
                  <td>{(totals[valueKey] ?? 0).toLocaleString()}</td>
                  {showMom && (
                    <td className="col-mom">
                      <Delta value={totals.delta} />
                    </td>
                  )}
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </PanelBody>
    </Panel>
  );

  if (showSideBySide) {
    return (
      <CompareBreakdownSection title={panelTitle} headerExtra={copyButton}>
        {renderPeriodTable(comparePeriodLabel, 'cmp')}
        {renderPeriodTable(currentPeriodLabel, 'cur', { showMom: true })}
      </CompareBreakdownSection>
    );
  }

  return (
    <Panel className="cmp-table-panel">
      <PanelHeader
        title={panelTitle}
        badge={{ label: 'Copy-ready', bg: 'var(--acc-soft)', color: 'var(--acc)' }}
      >
        <span className="cmp-table-head-note">
          {`${currentPeriodLabel} · ${comparePeriodLabel} · ${lyPeriodLabel} · MoM · YoY`}
        </span>
        {copyButton}
      </PanelHeader>

      {error ? (
        <div className="cmp-table-error">{error}</div>
      ) : (
        <div className="cmp-table-wrap">
          <table className="cmp-tbl cmp-tbl--period-compare">
            <thead>
              <tr>
                <th>Channel</th>
                <th className="col-cur">{currentPeriodLabel}</th>
                <th className="col-prev">{comparePeriodLabel}</th>
                <th className="col-lyear">{lyPeriodLabel}</th>
                <th className="col-mom">MoM</th>
                <th className="col-yoy">YoY</th>
              </tr>
            </thead>
            <tbody>
              {loading && visibleRows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="cmp-table-loading">
                    Loading channel comparison…
                  </td>
                </tr>
              ) : (
                visibleRows.map((r) => (
                  <tr
                    key={r.rowKey || r.ch}
                    className={
                      r.isGroupRollup
                        ? 'cmp-tbl-row--group-rollup'
                        : r.isGroupMember
                        ? 'cmp-tbl-row--group-member'
                        : undefined
                    }
                  >
                    <td>
                      <div
                        className={`cmp-channel-cell${r.isGroupMember ? ' cmp-channel-cell--member' : ''}`}
                      >
                        {showGroupColumn && (
                          r.isGroupRollup && r.collapsible ? (
                            <ChannelGroupToggle
                              expanded={isExpanded(r.groupKey)}
                              onToggle={() => toggle(r.groupKey)}
                              label={r.ch}
                            />
                          ) : (
                            <span className="cmp-channel-toggle-spacer" aria-hidden />
                          )
                        )}
                        <div
                          className="cmp-channel-dot"
                          style={{ background: r.color }}
                        />
                        <span>{r.ch}</span>
                      </div>
                    </td>
                    <td className="col-cur">{r.cur.toLocaleString()}</td>
                    <td className="col-prev">{r.cmp.toLocaleString()}</td>
                    <td className="col-lyear">
                      {yoyEnabled ? (r.ly ?? 0).toLocaleString() : '0'}
                    </td>
                    <td className="col-mom">
                      <Delta value={r.delta} />
                    </td>
                    <td className="col-yoy">
                      {yoyCell(r.curYoyDelta, yoyEnabled)}
                    </td>
                  </tr>
                ))
              )}
              {!loading && visibleRows.length > 0 && (
                <tr className="cmp-tbl-total-row">
                  <td>Total {tab === 'vdp' ? 'VDP' : ''}</td>
                  <td className="col-cur">{totals.cur.toLocaleString()}</td>
                  <td className="col-prev">{totals.cmp.toLocaleString()}</td>
                  <td className="col-lyear">
                    {yoyEnabled ? (totals.ly ?? 0).toLocaleString() : '0'}
                  </td>
                  <td className="col-mom">
                    <Delta value={totals.delta} />
                  </td>
                  <td className="col-yoy">
                    {yoyCell(totals.curYoyDelta, yoyEnabled)}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <div className="cmp-table-foot">
        <div className="cmp-legend-swatch cmp-legend-swatch--cur" />
        {currentPeriodLabel}
        <div className="cmp-legend-swatch cmp-legend-swatch--prev" />
        {comparePeriodLabel}
        <div className="cmp-legend-swatch cmp-legend-swatch--lyear" />
        {lyPeriodLabel}
        <span className="cmp-table-foot-note">
          {`MoM: ${currentPeriodLabel} vs ${comparePeriodLabel} · YoY: ${currentPeriodLabel} vs ${lyPeriodLabel}`}
        </span>
      </div>
    </Panel>
  );
}
