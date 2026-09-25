'use client';

import { useMemo, useState } from 'react';
import ChartTopNSelect from '@/components/dashboard/ChartTopNSelect';
import CompareBreakdownSection from '@/components/dashboard/CompareBreakdownSection';
import BreakdownDonut from '@/components/dashboard/overview/BreakdownDonut';
import { useOverview } from '@/components/dashboard/overview/OverviewDataContext';
import { useBreakdownFetch } from '@/hooks/useBreakdownFetch';
import { formatViewsK } from '@/lib/format/viewsK';
import { buildDonutCompareDeltas } from '@/lib/overview/comparePeriod';

function InventoryDonutDisplay({
  rows,
  loading,
  error,
  periodLabel,
  centerLabel = 'VDP VIEWS',
  chartTopN,
  headerExtra,
  emptyMessage,
  toDonutRow,
  baselineDonutData,
}) {
  const allData = useMemo(() => rows.map(toDonutRow), [rows, toDonutRow]);
  const chartData = useMemo(() => {
    if (chartTopN == null) return allData;
    return allData.slice(0, chartTopN);
  }, [allData, chartTopN]);

  const listData = useMemo(() => {
    if (!baselineDonutData) return allData;
    const { items } = buildDonutCompareDeltas(allData, baselineDonutData);
    return items;
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

  return (
    <BreakdownDonut
      title={periodLabel}
      data={listData}
      chartData={chartData}
      centerLabel={centerLabel}
      centerValue={formatViewsK(chartTotal)}
      totalViews={leafTotal}
      totalLabel="Total"
      totalDelta={totalDelta}
      headerExtra={headerExtra}
      loading={loading && rows.length === 0}
      error={error}
      emptyMessage={!loading && !error && rows.length === 0 ? emptyMessage : null}
      skeletonRows={8}
      listScrollable
    />
  );
}

function InventoryDonutPane({
  periodLabel,
  clientId,
  from,
  to,
  topN,
  vdpFilters,
  tab,
  enabled,
  fetchFn,
  normalize,
  errorMessage,
  toDonutRow,
  emptyMessage,
  baselineDonutData,
  ignoreVdpFilters = false,
  centerLabel = 'VDP VIEWS',
}) {
  const { rows, loading, error } = useBreakdownFetch({
    enabled,
    clientId,
    from,
    to,
    topN,
    vdpFilters,
    tab,
    fetchFn,
    normalize,
    errorMessage,
    ignoreVdpFilters,
  });

  return (
    <InventoryDonutDisplay
      rows={rows}
      loading={loading}
      error={error}
      periodLabel={periodLabel}
      chartTopN={topN}
      toDonutRow={toDonutRow}
      emptyMessage={emptyMessage}
      baselineDonutData={baselineDonutData}
      centerLabel={centerLabel}
    />
  );
}

export default function VdpInventoryDonut({
  title,
  fetchFn,
  normalize,
  errorMessage,
  toDonutRow,
  emptyMessage = 'No data for this period.',
  centerLabel = 'VDP VIEWS',
  limit = null,
  ignoreVdpFilters = false,
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
    compareEnabled,
    compareFrom,
    compareTo,
    currentPeriodLabel,
    comparePeriodLabel,
  } = useOverview();

  const clientId = clientIdProp ?? clientKey;
  const from = fromProp ?? ctxFrom;
  const to = toProp ?? ctxTo;

  const [topN, setTopN] = useState(limit === 5 ? 5 : limit === 10 ? 10 : null);
  const enabled = tab === 'vdp';
  const showCompare = enabled && compareEnabled && compareFrom && compareTo;

  const compareFetch = useBreakdownFetch({
    enabled: enabled && showCompare,
    clientId,
    from: compareFrom,
    to: compareTo,
    topN,
    vdpFilters,
    tab,
    fetchFn,
    normalize,
    errorMessage,
    ignoreVdpFilters,
  });

  const singleFetch = useBreakdownFetch({
    enabled: enabled && !showCompare,
    clientId,
    from,
    to,
    topN,
    vdpFilters,
    tab,
    fetchFn,
    normalize,
    errorMessage,
    ignoreVdpFilters,
  });

  const compareAllData = useMemo(
    () => (compareFetch.rows || []).map(toDonutRow),
    [compareFetch.rows, toDonutRow]
  );

  const topNControl = (
    <div className="make-breakdown-head-controls">
      <ChartTopNSelect
        value={topN}
        onChange={setTopN}
        ariaLabel={`${title} chart limit`}
      />
    </div>
  );

  if (!enabled) return null;

  if (showCompare) {
    return (
      <CompareBreakdownSection title={title} headerExtra={topNControl}>
        <InventoryDonutDisplay
          rows={compareFetch.rows}
          loading={compareFetch.loading}
          error={compareFetch.error}
          periodLabel={comparePeriodLabel}
          centerLabel={centerLabel}
          chartTopN={topN}
          toDonutRow={toDonutRow}
          emptyMessage={emptyMessage}
        />
        <InventoryDonutPane
          periodLabel={currentPeriodLabel}
          clientId={clientId}
          from={from}
          to={to}
          topN={topN}
          vdpFilters={vdpFilters}
          tab={tab}
          enabled={enabled}
          fetchFn={fetchFn}
          normalize={normalize}
          errorMessage={errorMessage}
          toDonutRow={toDonutRow}
          emptyMessage={emptyMessage}
          baselineDonutData={compareAllData}
          ignoreVdpFilters={ignoreVdpFilters}
          centerLabel={centerLabel}
        />
      </CompareBreakdownSection>
    );
  }

  return (
    <InventoryDonutDisplay
      rows={singleFetch.rows}
      loading={singleFetch.loading}
      error={singleFetch.error}
      periodLabel={title}
      centerLabel={centerLabel}
      chartTopN={topN}
      toDonutRow={toDonutRow}
      emptyMessage={emptyMessage}
      headerExtra={topNControl}
    />
  );
}
