'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Panel, PanelHeader, PanelBody } from '@/components/dashboard/Panel';
import Delta from '@/components/dashboard/Delta';
import { useClient } from '@/components/dashboard/ClientContext';
import { useOverview } from '@/components/dashboard/overview/OverviewDataContext';
import {
  compareEntryForDealer,
  compareLookupFromRows,
  fetchAllDealersChannelMatrix,
  sliceMapForRow,
} from '@/lib/api/allDealerChannelMatrix';
import { pctChange } from '@/lib/overview/comparePeriod';
import { useAllDealerMatrix } from './AllDealerMatrixContext';

const TAB_PAGE_TYPE = {
  vdp: 'VDP',
  srp: 'SRP',
  all: 'ALL',
};

const TAB_LABEL = {
  vdp: 'VDP',
  srp: 'SRP',
  all: 'All Pages',
};

function dealerIncludedOnAllDealersTab(dealer, tabId) {
  // Default on (legacy All Dealers behavior). Switch OFF in Admin → Dealers to hide.
  if (tabId === 'vdp') return dealer?.showAllDealersVdp !== false;
  if (tabId === 'all') return dealer?.showAllDealersAll !== false;
  if (tabId === 'srp') return dealer?.showAllDealersSrp !== false;
  return true;
}

function ChannelHeader({ name }) {
  const parts = String(name || '')
    .split(/\s*\+\s*/)
    .map((part) => part.trim())
    .filter(Boolean);

  return (
    <div className="adc-col-head" title={name}>
      <span className="adc-col-label">
        {parts.length <= 1 ? (
          name
        ) : (
          parts.map((part, index) => (
            <span key={`${part}-${index}`} className="adc-col-label-line">
              {part}
              {index < parts.length - 1 ? ' +' : ''}
            </span>
          ))
        )}
      </span>
    </div>
  );
}

function shortMonthLabel(periodLabel) {
  if (!periodLabel) return '';
  const raw = String(periodLabel).trim();
  // "July 2026" / "Jul 2026"
  const monthYear = raw.match(/^([A-Za-z]{3,9})\s+(\d{4})$/);
  if (monthYear) {
    return `${monthYear[1].slice(0, 3)} ${monthYear[2]}`;
  }
  // "May 1, 2026 – May 31, 2026" / "May 1, 2026"
  const rangeStart = raw.match(/^([A-Za-z]{3,9})\s+\d{1,2},?\s+(\d{4})/);
  if (rangeStart) {
    return `${rangeStart[1].slice(0, 3)} ${rangeStart[2]}`;
  }
  return raw.length > 8 ? `${raw.slice(0, 8)}…` : raw;
}

function CompareValueCell({
  current,
  compare,
  showCompareStack,
  comparePending,
  currentLabel,
  compareLabel,
  deltaLabel = 'MoM',
}) {
  const cur = Number(current) || 0;
  const cmp = Number(compare) || 0;

  if (!showCompareStack) {
    if (cur <= 0) return <span className="adc-cell-empty">—</span>;
    return (
      <div className="adc-cell">
        <span className="adc-cell-views">{cur.toLocaleString()}</span>
      </div>
    );
  }

  if (!comparePending && cur <= 0 && cmp <= 0) {
    return <span className="adc-cell-empty">—</span>;
  }

  const curTag = shortMonthLabel(currentLabel) || 'Current';
  const prevTag = shortMonthLabel(compareLabel) || 'Previous';

  return (
    <div className="adc-compare-stack">
      <div className="adc-compare-line">
        <span className="adc-compare-lbl" title={currentLabel}>
          {curTag}
        </span>
        <span className="adc-compare-num adc-compare-num--cur">
          {cur > 0 ? cur.toLocaleString() : '—'}
        </span>
      </div>
      <div className="adc-compare-line">
        <span className="adc-compare-lbl" title={compareLabel}>
          {prevTag}
        </span>
        <span className="adc-compare-num adc-compare-num--prev">
          {comparePending ? (
            <span className="adc-compare-pending">…</span>
          ) : (
            cmp.toLocaleString()
          )}
        </span>
      </div>
      <div className="adc-compare-line adc-compare-line--pct">
        <span className="adc-compare-lbl">{deltaLabel}</span>
        <span className="adc-compare-pct">
          {comparePending ? (
            <span className="adc-compare-pending">…</span>
          ) : (
            <Delta value={pctChange(cur, cmp)} size={10} />
          )}
        </span>
      </div>
    </div>
  );
}

export default function AllDealerChannelTable() {
  const { dealers, loading: dealersLoading, dealerCategoryFilter } = useClient();
  const { setSnapshot } = useAllDealerMatrix();
  const {
    tab,
    from,
    to,
    compareEnabled,
    compareFrom,
    compareTo,
    currentPeriodLabel,
    comparePeriodLabel,
  } = useOverview();
  const [matrixRows, setMatrixRows] = useState([]);
  const [compareMatrixRows, setCompareMatrixRows] = useState([]);
  const [columns, setColumns] = useState([]);
  const [loading, setLoading] = useState(false);
  const [compareLoading, setCompareLoading] = useState(false);
  const [error, setError] = useState(null);
  const [progress, setProgress] = useState(null);
  const cancelRef = useRef(false);
  const loadGenRef = useRef(0);
  const columnsRef = useRef([]);

  const pageTypeFilter = TAB_PAGE_TYPE[tab] || 'ALL';
  const portfolioDealers = useMemo(
    () => (dealers || []).filter((d) => dealerIncludedOnAllDealersTab(d, tab)),
    [dealers, tab]
  );
  const panelTitle = dealerCategoryFilter
    ? `${TAB_LABEL[tab] || 'Page'} views by channel — all ${dealerCategoryFilter} dealers`
    : `${TAB_LABEL[tab] || 'Page'} views by channel — all dealers`;
  const showCompare = compareEnabled && compareFrom && compareTo;
  const compareDeltaLabel = useMemo(() => {
    if (!from || !compareFrom) return 'MoM';
    const curYear = String(from).slice(0, 4);
    const cmpYear = String(compareFrom).slice(0, 4);
    return curYear !== cmpYear ? 'YoY' : 'MoM';
  }, [from, compareFrom]);
  const isBusy = loading || compareLoading;
  /** Show MoM/YoY stack only after both periods finished (no mid-load flicker). */
  const showCompareStack = showCompare && !isBusy;
  const dataReady = !isBusy && matrixRows.length > 0;

  const shellRows = useMemo(() => {
    const rows = (portfolioDealers || [])
      .filter((d) => d?.name)
      .map((dealer) => ({
        dealer,
        slices: [],
        total: 0,
        error: null,
      }));
    rows.sort((a, b) => String(a.dealer.name).localeCompare(String(b.dealer.name)));
    return rows;
  }, [portfolioDealers]);

  /** Dealers + headers show immediately; numeric data only after full load. */
  const displayRows = dataReady ? matrixRows : shellRows;
  const displayColumns = columns.length ? columns : columnsRef.current;

  const compareByDealer = useMemo(
    () => compareLookupFromRows(compareMatrixRows),
    [compareMatrixRows]
  );

  const loadMatrix = useCallback(async () => {
    if (!portfolioDealers?.length || !from || !to) {
      setMatrixRows([]);
      setCompareMatrixRows([]);
      setColumns([]);
      columnsRef.current = [];
      return;
    }

    const loadGen = loadGenRef.current + 1;
    loadGenRef.current = loadGen;
    cancelRef.current = false;

    setLoading(true);
    setCompareLoading(Boolean(showCompare));
    setMatrixRows([]);
    setCompareMatrixRows([]);
    setError(null);
    setProgress({ completed: 0, total: 1 });

    const isStale = () => cancelRef.current || loadGenRef.current !== loadGen;

    const progressCurrent = { completed: 0, total: 1 };
    const progressCompare = { completed: 0, total: 1 };

    const publishProgress = () => {
      if (isStale()) return;
      if (showCompare) {
        setProgress({
          completed: progressCurrent.completed + progressCompare.completed,
          total: progressCurrent.total + progressCompare.total,
        });
        return;
      }
      setProgress({
        completed: progressCurrent.completed,
        total: progressCurrent.total,
      });
    };

    try {
      const currentPromise = fetchAllDealersChannelMatrix({
        dealers: portfolioDealers,
        from,
        to,
        pageTypeFilter,
        onProgress: (p) => {
          progressCurrent.completed = p.completed;
          progressCurrent.total = Math.max(1, p.total);
          publishProgress();
        },
        onCancelCheck: () => isStale(),
      });

      const comparePromise = showCompare
        ? fetchAllDealersChannelMatrix({
            dealers: portfolioDealers,
            from: compareFrom,
            to: compareTo,
            pageTypeFilter,
            onProgress: (p) => {
              progressCompare.completed = p.completed;
              progressCompare.total = Math.max(1, p.total);
              publishProgress();
            },
            onCancelCheck: () => isStale(),
          })
        : Promise.resolve({ rows: [], columns: [], warning: null });

      const [current, compare] = await Promise.all([currentPromise, comparePromise]);

      if (isStale()) return;

      const mergedColumns = [...new Set([
        ...(current.columns || []),
        ...(compare.columns || []),
      ])];
      const nextColumns = mergedColumns.length
        ? mergedColumns
        : current.columns || [];

      columnsRef.current = nextColumns;
      setMatrixRows(current.rows || []);
      setCompareMatrixRows(showCompare ? compare.rows || [] : []);
      setColumns(nextColumns);
      setError(current.warning || compare.warning || null);
    } catch (err) {
      if (!isStale()) {
        setError(err?.message || 'Failed to load dealer channel data.');
        setMatrixRows([]);
        setCompareMatrixRows([]);
      }
    } finally {
      if (!isStale()) {
        setLoading(false);
        setCompareLoading(false);
        setProgress(null);
      }
    }
  }, [
    portfolioDealers,
    from,
    to,
    pageTypeFilter,
    showCompare,
    compareFrom,
    compareTo,
  ]);

  useEffect(() => {
    if (dealersLoading) return undefined;
    loadMatrix();
    return () => {
      cancelRef.current = true;
    };
  }, [dealersLoading, loadMatrix]);

  const exportReady = dataReady && displayColumns.length > 0;

  useEffect(() => {
    setSnapshot({
      matrixRows,
      compareMatrixRows,
      columns: displayColumns,
      loading: dealersLoading || loading,
      compareLoading,
      ready: exportReady,
    });
  }, [
    matrixRows,
    compareMatrixRows,
    displayColumns,
    dealersLoading,
    loading,
    compareLoading,
    exportReady,
    setSnapshot,
  ]);

  const showEmpty =
    !isBusy && !error && !dealersLoading && shellRows.length === 0;
  const showTable = !dealersLoading && displayRows.length > 0;

  const loadingLabel = 'Loading…';

  return (
    <div className="content all-dealer-overview-content">
      <Panel className="all-dealer-channel-panel">
        <PanelHeader
          title={panelTitle}
          badge={
            showCompare
              ? {
                  label: `${currentPeriodLabel} · ${comparePeriodLabel} · MoM`,
                  bg: 'var(--s3)',
                  color: 'var(--t2)',
                }
              : undefined
          }
        />
        <PanelBody className="all-dealer-channel-body">
          {isBusy && (
            <div
              className="adc-nav-progress adc-nav-progress--table-top"
              role="progressbar"
              aria-label="Loading"
              aria-busy="true"
            >
              <div className="adc-nav-progress-bar" />
            </div>
          )}
          {error && (
            <div className="donut-err" role="alert">
              {error}
            </div>
          )}
          {showEmpty && (
            <div className="local-empty-state">
              <p className="local-empty-title">No dealer channel data</p>
              <p className="local-empty-sub">
                {dealerCategoryFilter && !dealers?.length
                  ? `No active dealers are tagged as ${dealerCategoryFilter}. Pick another category or set categories in Admin → Dealers.`
                  : !portfolioDealers.length
                    ? `No dealers enabled for All Dealers → ${TAB_LABEL[tab] || tab}. Turn on AD ${tab === 'all' ? 'All' : String(tab).toUpperCase()} in Admin → Dealers.`
                    : 'Adjust the date range or confirm dealers have GA4 IDs configured.'}
              </p>
            </div>
          )}
          {showTable && (
            <div className={`adc-table-stage${isBusy ? ' adc-table-stage--busy' : ''}`}>
              <div className="adc-table-wrap">
                <table
                  className={`tbl adc-table${showCompareStack ? ' adc-table--compare' : ''}${isBusy ? ' adc-table--loading' : ''}`}
                >
                  <thead>
                    <tr>
                      <th className="adc-th-dealer">Dealers</th>
                      <th className="adc-th-total">Total Views</th>
                      {displayColumns.map((name) => (
                        <th key={name} className="adc-th-channel">
                          <ChannelHeader name={name} />
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {displayRows.map((row) => {
                      const sliceMap = dataReady ? sliceMapForRow(row) : new Map();
                      const compareEntry = dataReady
                        ? compareEntryForDealer(compareByDealer, row.dealer)
                        : null;
                      const compareTotal = compareEntry?.total ?? 0;

                      return (
                        <tr key={row.dealer.id}>
                          <td className="adc-td-dealer">
                            <span className="adc-dealer-name" title={row.dealer.name}>
                              {row.dealer.name}
                            </span>
                            {dataReady && row.error && (
                              <span className="adc-dealer-err" title={row.error}>
                                !
                              </span>
                            )}
                          </td>
                          <td className="adc-td-total">
                            {!dataReady || row.error ? (
                              <span className="adc-cell-empty">—</span>
                            ) : (
                              <CompareValueCell
                                current={row.total}
                                compare={compareTotal}
                                showCompareStack={showCompareStack}
                                comparePending={false}
                                currentLabel={currentPeriodLabel}
                                compareLabel={comparePeriodLabel}
                                deltaLabel={compareDeltaLabel}
                              />
                            )}
                          </td>
                          {displayColumns.map((colName) => (
                            <td key={`${row.dealer.id}-${colName}`} className="adc-td-channel">
                              {!dataReady ? (
                                <span className="adc-cell-empty">—</span>
                              ) : (
                                <CompareValueCell
                                  current={sliceMap.get(colName)?.value}
                                  compare={compareEntry?.channels?.get(colName)?.value}
                                  showCompareStack={showCompareStack}
                                  comparePending={false}
                                  currentLabel={currentPeriodLabel}
                                  compareLabel={comparePeriodLabel}
                                  deltaLabel={compareDeltaLabel}
                                />
                              )}
                            </td>
                          ))}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {isBusy && (
                <div className="adc-table-overlay" role="status" aria-live="polite" aria-busy="true">
                  <div className="adc-table-loader">
                    <span className="adc-table-spinner" aria-hidden />
                    <span className="adc-table-loader-text">{loadingLabel}</span>
                  </div>
                </div>
              )}
            </div>
          )}
        </PanelBody>
      </Panel>
    </div>
  );
}
