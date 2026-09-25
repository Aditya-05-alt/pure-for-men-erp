'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import ChartTopNSelect from '@/components/dashboard/ChartTopNSelect';
import { fetchTopCampaignsBundle } from '@/lib/api/topCampaignsFetch';
import {
  getTopCampaignsCache,
  hasTopCampaignsCache,
} from '@/lib/data/topCampaignsCache';
import { vdpFilterCacheSuffix } from '@/lib/vdp/vdpFilterParams';
import { buildDonutCompareDeltas } from '@/lib/overview/comparePeriod';
import { formatViewsK } from '@/lib/format/viewsK';
import { useOverview } from './overview/OverviewDataContext';
import BreakdownDonut from '@/components/dashboard/overview/BreakdownDonut';

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

const CAMPAIGN_PALETTE = [
  '#34d399',
  '#60a5fa',
  '#a3e635',
  '#fb923c',
  '#8f7af6',
  '#f472b6',
  '#22d3ee',
  '#f2be22',
  '#e8806f',
  '#748ab2',
];

function normalizeRows(data) {
  const list = Array.isArray(data) ? data : data ? [data] : [];
  return list.map((row, index) => ({
    campaign: String(row.campaign ?? '(not set)'),
    views: Number(row.views ?? 0) || 0,
    pct: Number(row.pct ?? 0) || 0,
    rank: Number(row.rank ?? index + 1) || index + 1,
  }));
}

function colorForCampaign(index = 0) {
  return CAMPAIGN_PALETTE[index % CAMPAIGN_PALETTE.length];
}

function campaignRowsToDonutData(rows) {
  const sorted = [...(rows || [])].sort(
    (a, b) => (Number(b.views) || 0) - (Number(a.views) || 0)
  );

  return sorted
    .filter((row) => (Number(row.views) || 0) > 0)
    .map((row, index) => {
      const fullName = String(row.campaign ?? '(not set)');
      const name = fullName.length > 32 ? `${fullName.slice(0, 30)}…` : fullName;
      return {
        name,
        fullName,
        color: colorForCampaign(index),
        value: Number(row.views) || 0,
        pct: Number(row.pct) || 0,
      };
    });
}

function useTopCampaignsRows({
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
      ? normalizeRows(
          getTopCampaignsCache(clientId, from, to, pageTypeFilter, filterCacheSuffix) || []
        )
      : []
  );
  const [loading, setLoading] = useState(
    () =>
      Boolean(
        clientId
          && from
          && to
          && !hasTopCampaignsCache(clientId, from, to, pageTypeFilter, filterCacheSuffix)
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

    const cached = getTopCampaignsCache(
      clientId,
      from,
      to,
      pageTypeFilter,
      filterCacheSuffix
    );
    if (cached) {
      setRows(normalizeRows(cached));
      setLoading(false);
      setError(null);
      return undefined;
    }

    let cancelled = false;
    const initialLoad = rowsRef.current.length === 0;
    if (initialLoad) setLoading(true);
    setError(null);
    if (trackBreakdownLoad && initialLoad) beginBreakdownLoad?.();

    fetchTopCampaignsBundle({
      clientId,
      from,
      to,
      pageTypeFilter,
      vdpFilters,
      tab,
      onCancelCheck: () => cancelled,
      onProgress: (partial, meta) => {
        if (cancelled) return;
        setRows(normalizeRows(partial));
        if (trackBreakdownLoad && meta?.total > 1 && !meta?.fromCache) {
          reportBreakdownChunk?.(meta);
        }
        if (partial?.length) setLoading(false);
      },
    })
      .then((data) => {
        if (cancelled || data === undefined) return;
        setRows(normalizeRows(data));
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e?.message || 'Failed to load campaigns.');
        setRows([]);
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

function TopCampaignsDisplay({
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
  const allData = useMemo(() => campaignRowsToDonutData(rows), [rows]);
  const displayData = useMemo(() => {
    if (chartTopN == null) return allData;
    return allData.slice(0, chartTopN);
  }, [allData, chartTopN]);

  const { items: dataWithDelta, totalDelta } = useMemo(() => {
    if (!baselineDonutData) {
      return { items: displayData, totalDelta: null };
    }
    return buildDonutCompareDeltas(displayData, baselineDonutData);
  }, [displayData, baselineDonutData]);

  const displayedTotal = useMemo(
    () => dataWithDelta.reduce((sum, row) => sum + (Number(row.value) || 0), 0),
    [dataWithDelta]
  );

  const centerDisplay = formatViewsK(displayedTotal);

  const showSkeleton = loading && rows.length === 0;

  return (
    <BreakdownDonut
      title={periodLabel}
      data={dataWithDelta}
      centerLabel={centerLabel}
      centerValue={centerDisplay}
      totalViews={displayedTotal}
      totalLabel="Total"
      totalDelta={totalDelta}
      loading={showSkeleton || (!clientId && overviewLoading)}
      error={error}
      emptyMessage={!loading && !error && rows.length === 0 ? 'No campaign data for this period.' : null}
      skeletonRows={8}
      listScrollable
    />
  );
}

function TopCampaignsCompare({
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

  const compareFetch = useTopCampaignsRows({
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

  const currentFetch = useTopCampaignsRows({
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
    () => campaignRowsToDonutData(compareFetch.rows),
    [compareFetch.rows]
  );

  return (
    <div className="compare-donut-section">
      <div className="compare-donut-head">
        <div className="compare-donut-title">Campaign Breakdown</div>
        <div className="make-breakdown-head-controls">
          <ChartTopNSelect
            value={chartTopN}
            onChange={setChartTopN}
            ariaLabel="Campaign chart limit"
          />
        </div>
      </div>
      <div className="compare-donut-grid">
        <TopCampaignsDisplay
          rows={compareFetch.rows}
          loading={compareFetch.loading}
          error={compareFetch.error}
          clientId={clientId}
          periodLabel={comparePeriodLabel}
          centerLabel={centerLabel}
          chartTopN={chartTopN}
          overviewLoading={overviewLoading}
        />
        <TopCampaignsDisplay
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
      </div>
    </div>
  );
}

function TopCampaignsSingle({
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
  const { rows, loading, error } = useTopCampaignsRows({
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

  const allData = useMemo(() => campaignRowsToDonutData(rows), [rows]);
  const displayData = useMemo(() => {
    if (chartTopN == null) return allData;
    return allData.slice(0, chartTopN);
  }, [allData, chartTopN]);

  const displayedTotal = useMemo(
    () => displayData.reduce((sum, row) => sum + (Number(row.value) || 0), 0),
    [displayData]
  );

  const centerDisplay = formatViewsK(displayedTotal);

  const showSkeleton = loading && rows.length === 0;

  return (
    <BreakdownDonut
      title="Campaign Breakdown"
      data={displayData}
      headerExtra={
        <div className="make-breakdown-head-controls">
          <ChartTopNSelect
            value={chartTopN}
            onChange={setChartTopN}
            ariaLabel="Campaign chart limit"
          />
        </div>
      }
      centerLabel={centerLabel}
      centerValue={centerDisplay}
      totalViews={displayedTotal}
      totalLabel="Total"
      loading={showSkeleton || (!clientId && overviewLoading)}
      error={error}
      emptyMessage={!loading && !error && rows.length === 0 ? 'No campaign data for this period.' : null}
      skeletonRows={8}
      listScrollable
    />
  );
}

/**
 * Campaign breakdown — same donut layout as Channel Breakdown.
 * One RPC per active tab; side-by-side compare when Compare period is on.
 */
export default function TopCampaigns({
  clientId: clientIdProp,
  from: fromProp,
  to: toProp,
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

  const pageTypeFilter = TAB_TO_FILTER[tab] || 'ALL';
  const centerLabel = CENTER_LABEL[tab] || 'ALL VIEWS';
  const filterCacheSuffix = vdpFilterCacheSuffix(vdpFilters, tab);

  const clientId = clientIdProp ?? clientKey;
  const from = fromProp ?? ctxFrom;
  const to = toProp ?? ctxTo;

  const showCompare = compareEnabled && compareFrom && compareTo;

  if (showCompare) {
    return (
      <TopCampaignsCompare
        clientId={clientId}
        from={from}
        to={to}
        compareFrom={compareFrom}
        compareTo={compareTo}
        pageTypeFilter={pageTypeFilter}
        tab={tab}
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
    <TopCampaignsSingle
      clientId={clientId}
      from={from}
      to={to}
      pageTypeFilter={pageTypeFilter}
      tab={tab}
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
