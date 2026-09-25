'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { fetchChannelBreakdownBundle } from '@/lib/api/channelBreakdownFetch';
import {
  getChannelBreakdownCache,
  hasChannelBreakdownCache,
} from '@/lib/data/channelBreakdownCache';
import {
  channelFilterCacheSuffix,
  channelFiltersActive,
} from '@/lib/vdp/vdpFilterParams';
import ChartTopNSelect from '@/components/dashboard/ChartTopNSelect';
import { channelRowsToDonutData } from '@/lib/ga4/channelDisplay';
import {
  applyChannelGroupsToDonutItems,
  attachCompareValuesForGrouping,
} from '@/lib/ga4/channelGroups';
import { buildDonutCompareDeltas } from '@/lib/overview/comparePeriod';
import { formatViewsK } from '@/lib/format/viewsK';
import CompareBreakdownSection from '../CompareBreakdownSection';
import { useOverview } from './OverviewDataContext';
import BreakdownDonut from './BreakdownDonut';

const TAB_TO_FILTER = {
  all: 'ALL',
  vdp: 'VDP',
  srp: 'SRP',
  home: 'Home',
  other: 'Other',
};

const CENTER_LABEL = {
  all: 'ALL VIEWS',
  vdp: 'VDP VIEWS',
  srp: 'SRP VIEWS',
  home: 'HOMEPAGE VIEWS',
  other: 'OTHER VIEWS',
};

const PAGE_TYPE_TO_TAB = {
  All: 'all',
  VDP: 'vdp',
  SRP: 'srp',
  Homepage: 'home',
  Other: 'other',
};

function resolveTabId(pageTypeProp, tabFromContext) {
  if (pageTypeProp && PAGE_TYPE_TO_TAB[pageTypeProp]) {
    return PAGE_TYPE_TO_TAB[pageTypeProp];
  }
  return tabFromContext || 'all';
}

function useChannelBreakdownRows({
  clientId,
  from,
  to,
  pageTypeFilter,
  vdpFilters,
  tab,
  filterCacheSuffix,
  beginBreakdownLoad,
  endBreakdownLoad,
  reportBreakdownChunk,
  trackBreakdownLoad = true,
}) {
  const [rows, setRows] = useState(() =>
    clientId && from && to
      ? getChannelBreakdownCache(clientId, from, to, pageTypeFilter, filterCacheSuffix) || []
      : []
  );
  const [loading, setLoading] = useState(
    () =>
      Boolean(
        clientId
          && from
          && to
          && !hasChannelBreakdownCache(clientId, from, to, pageTypeFilter, filterCacheSuffix)
      )
  );
  const [error, setError] = useState(null);
  const rowsRef = useRef(rows);
  rowsRef.current = rows;

  useEffect(() => {
    if (!clientId || !from || !to) {
      setRows([]);
      setLoading(false);
      return undefined;
    }

    const cached = getChannelBreakdownCache(
      clientId,
      from,
      to,
      pageTypeFilter,
      filterCacheSuffix
    );
    if (cached) {
      setRows(cached);
      setLoading(false);
      setError(null);
      return undefined;
    }

    let cancelled = false;
    const initialLoad = rowsRef.current.length === 0;
    if (initialLoad) setLoading(true);
    setError(null);
    if (trackBreakdownLoad && initialLoad) beginBreakdownLoad?.();

    const invFiltered = channelFiltersActive(vdpFilters, tab);

    fetchChannelBreakdownBundle({
      clientId,
      from,
      to,
      pageTypeFilter,
      vdpFilters,
      tab,
      adaptiveChunks: true,
      preferServer: invFiltered,
      onCancelCheck: () => cancelled,
      onProgress: (partial, meta) => {
        if (cancelled) return;
        setRows(partial || []);
        if (trackBreakdownLoad && meta?.total > 1 && !meta?.fromCache) {
          reportBreakdownChunk?.(meta);
        }
        if (partial?.length) setLoading(false);
      },
    })
      .then((data) => {
        if (!cancelled) setRows(data || []);
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e?.message || 'Failed to load channel breakdown.');
          setRows([]);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
        if (trackBreakdownLoad && initialLoad) endBreakdownLoad?.();
      });

    return () => {
      cancelled = true;
    };
  }, [
    clientId,
    from,
    to,
    pageTypeFilter,
    vdpFilters,
    tab,
    filterCacheSuffix,
    beginBreakdownLoad,
    endBreakdownLoad,
    reportBreakdownChunk,
    trackBreakdownLoad,
  ]);

  return { rows, loading, error };
}

function ChannelDonutDisplay({
  rows,
  loading,
  error,
  clientId,
  periodLabel,
  centerLabel,
  chartTopN,
  overviewLoading,
  baselineDonutData,
}) {
  const allData = useMemo(() => channelRowsToDonutData(rows), [rows]);
  const chartData = useMemo(() => {
    if (chartTopN == null) return allData;
    return allData.slice(0, chartTopN);
  }, [allData, chartTopN]);

  const listData = useMemo(() => {
    if (!baselineDonutData) {
      return applyChannelGroupsToDonutItems(allData);
    }
    const withCmp = attachCompareValuesForGrouping(allData, baselineDonutData);
    const { items } = buildDonutCompareDeltas(withCmp, baselineDonutData);
    return applyChannelGroupsToDonutItems(items);
  }, [allData, baselineDonutData]);

  const { totalDelta } = useMemo(() => {
    if (!baselineDonutData) return { totalDelta: null };
    return buildDonutCompareDeltas(allData, baselineDonutData);
  }, [allData, baselineDonutData]);

  const leafTotal = useMemo(
    () => allData.reduce((sum, row) => sum + (Number(row.value) || 0), 0),
    [allData]
  );

  const chartTotal = useMemo(
    () => chartData.reduce((sum, row) => sum + (Number(row.value) || 0), 0),
    [chartData]
  );

  const centerDisplay = formatViewsK(chartTotal);

  const showSkeleton = loading && rows.length === 0;

  return (
    <BreakdownDonut
      title={periodLabel}
      data={listData}
      chartData={chartData}
      centerLabel={centerLabel}
      centerValue={centerDisplay}
      totalViews={leafTotal}
      totalLabel="Total"
      totalDelta={totalDelta}
      loading={showSkeleton || (!clientId && overviewLoading)}
      error={error}
      skeletonRows={8}
      listScrollable
    />
  );
}

function ChannelDonutPane({
  clientId,
  from,
  to,
  pageTypeFilter,
  tab,
  vdpFilters,
  filterCacheSuffix,
  periodLabel,
  centerLabel,
  chartTopN,
  overviewLoading,
  beginBreakdownLoad,
  endBreakdownLoad,
  reportBreakdownChunk,
  trackBreakdownLoad,
  baselineDonutData,
}) {
  const { rows, loading, error } = useChannelBreakdownRows({
    clientId,
    from,
    to,
    pageTypeFilter,
    vdpFilters,
    tab,
    filterCacheSuffix,
    beginBreakdownLoad,
    endBreakdownLoad,
    reportBreakdownChunk,
    trackBreakdownLoad,
  });

  return (
    <ChannelDonutDisplay
      rows={rows}
      loading={loading}
      error={error}
      clientId={clientId}
      periodLabel={periodLabel}
      centerLabel={centerLabel}
      chartTopN={chartTopN}
      overviewLoading={overviewLoading}
      baselineDonutData={baselineDonutData}
    />
  );
}

function ChannelDonutCompare({
  clientId,
  from,
  to,
  compareFrom,
  compareTo,
  pageTypeFilter,
  tab,
  vdpFilters,
  filterCacheSuffix,
  currentPeriodLabel,
  comparePeriodLabel,
  centerLabel,
  overviewLoading,
  beginBreakdownLoad,
  endBreakdownLoad,
  reportBreakdownChunk,
}) {
  const [chartTopN, setChartTopN] = useState(null);

  const compareFetch = useChannelBreakdownRows({
    clientId,
    from: compareFrom,
    to: compareTo,
    pageTypeFilter,
    vdpFilters,
    tab,
    filterCacheSuffix,
    beginBreakdownLoad,
    endBreakdownLoad,
    reportBreakdownChunk,
    trackBreakdownLoad: true,
  });

  const currentFetch = useChannelBreakdownRows({
    clientId,
    from,
    to,
    pageTypeFilter,
    vdpFilters,
    tab,
    filterCacheSuffix,
    beginBreakdownLoad,
    endBreakdownLoad,
    reportBreakdownChunk,
    trackBreakdownLoad: true,
  });

  const compareAllData = useMemo(
    () => channelRowsToDonutData(compareFetch.rows),
    [compareFetch.rows]
  );

  return (
    <CompareBreakdownSection
      title="Channel Breakdown"
      headerExtra={
        <div className="make-breakdown-head-controls">
          <ChartTopNSelect
            value={chartTopN}
            onChange={setChartTopN}
            ariaLabel="Channel chart limit"
          />
        </div>
      }
    >
      <ChannelDonutDisplay
        rows={compareFetch.rows}
        loading={compareFetch.loading}
        error={compareFetch.error}
        clientId={clientId}
        periodLabel={comparePeriodLabel}
        centerLabel={centerLabel}
        chartTopN={chartTopN}
        overviewLoading={overviewLoading}
      />
      <ChannelDonutDisplay
        rows={currentFetch.rows}
        loading={currentFetch.loading}
        error={currentFetch.error}
        clientId={clientId}
        periodLabel={currentPeriodLabel}
        centerLabel={centerLabel}
        chartTopN={chartTopN}
        overviewLoading={overviewLoading}
        baselineDonutData={compareAllData}
      />
    </CompareBreakdownSection>
  );
}

function ChannelDonutSingle({
  clientId,
  from,
  to,
  pageTypeFilter,
  tab,
  vdpFilters,
  filterCacheSuffix,
  centerLabel,
  overviewLoading,
  beginBreakdownLoad,
  endBreakdownLoad,
  reportBreakdownChunk,
}) {
  const [chartTopN, setChartTopN] = useState(null);
  const { rows, loading, error } = useChannelBreakdownRows({
    clientId,
    from,
    to,
    pageTypeFilter,
    vdpFilters,
    tab,
    filterCacheSuffix,
    beginBreakdownLoad,
    endBreakdownLoad,
    reportBreakdownChunk,
  });

  const allData = useMemo(() => channelRowsToDonutData(rows), [rows]);
  const chartData = useMemo(() => {
    if (chartTopN == null) return allData;
    return allData.slice(0, chartTopN);
  }, [allData, chartTopN]);
  const listData = useMemo(
    () => applyChannelGroupsToDonutItems(allData),
    [allData]
  );

  const leafTotal = useMemo(
    () => allData.reduce((sum, row) => sum + (Number(row.value) || 0), 0),
    [allData]
  );

  const chartTotal = useMemo(
    () => chartData.reduce((sum, row) => sum + (Number(row.value) || 0), 0),
    [chartData]
  );

  const centerDisplay = formatViewsK(chartTotal);

  const showSkeleton = loading && rows.length === 0;

  return (
    <BreakdownDonut
      title="Channel Breakdown"
      data={listData}
      chartData={chartData}
      headerExtra={
        <div className="make-breakdown-head-controls">
          <ChartTopNSelect
            value={chartTopN}
            onChange={setChartTopN}
            ariaLabel="Channel chart limit"
          />
        </div>
      }
      centerLabel={centerLabel}
      centerValue={centerDisplay}
      totalViews={leafTotal}
      totalLabel="Total"
      loading={showSkeleton || (!clientId && overviewLoading)}
      error={error}
      skeletonRows={8}
      listScrollable
    />
  );
}

export default function ChannelDonut({
  clientId: clientIdProp,
  from: fromProp,
  to: toProp,
  pageType: pageTypeProp,
}) {
  const {
    tab,
    vdpFilters,
    clientKey,
    from: ctxFrom,
    to: ctxTo,
    loading: overviewLoading,
    compareEnabled,
    compareFrom,
    compareTo,
    currentPeriodLabel,
    comparePeriodLabel,
    beginBreakdownLoad,
    endBreakdownLoad,
    reportBreakdownChunk,
  } = useOverview();

  const tabId = resolveTabId(pageTypeProp, tab);
  const pageTypeFilter = TAB_TO_FILTER[tabId] || 'ALL';
  const centerLabel = CENTER_LABEL[tabId] || 'ALL VIEWS';
  // Location excluded from channel cache key / filters.
  const filterCacheSuffix = channelFilterCacheSuffix(vdpFilters, tabId);

  const clientId = clientIdProp ?? clientKey;
  const from = fromProp ?? ctxFrom;
  const to = toProp ?? ctxTo;

  const showCompare = compareEnabled && compareFrom && compareTo;

  if (showCompare) {
    return (
      <ChannelDonutCompare
        clientId={clientId}
        from={from}
        to={to}
        compareFrom={compareFrom}
        compareTo={compareTo}
        pageTypeFilter={pageTypeFilter}
        tab={tabId}
        vdpFilters={vdpFilters}
        filterCacheSuffix={filterCacheSuffix}
        currentPeriodLabel={currentPeriodLabel}
        comparePeriodLabel={comparePeriodLabel}
        centerLabel={centerLabel}
        overviewLoading={overviewLoading}
        beginBreakdownLoad={beginBreakdownLoad}
        endBreakdownLoad={endBreakdownLoad}
        reportBreakdownChunk={reportBreakdownChunk}
      />
    );
  }

  return (
    <ChannelDonutSingle
      clientId={clientId}
      from={from}
      to={to}
      pageTypeFilter={pageTypeFilter}
      tab={tabId}
      vdpFilters={vdpFilters}
      filterCacheSuffix={filterCacheSuffix}
      centerLabel={centerLabel}
      overviewLoading={overviewLoading}
      beginBreakdownLoad={beginBreakdownLoad}
      endBreakdownLoad={endBreakdownLoad}
      reportBreakdownChunk={reportBreakdownChunk}
    />
  );
}
