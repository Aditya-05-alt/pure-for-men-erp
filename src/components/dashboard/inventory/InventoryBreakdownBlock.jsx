'use client';

import { useMemo, useState } from 'react';
import { Panel, PanelHeader, PanelBody } from '@/components/dashboard/Panel';
import BreakdownDonut from '@/components/dashboard/overview/BreakdownDonut';
import { formatInventoryUnits } from '@/lib/inventory/formatInventory';
import { rowsToInventoryDonutData } from '@/lib/inventory/inventoryDonutData';
import { buildDonutCompareDeltas } from '@/lib/overview/comparePeriod';
import InventoryBreakdownTable from './InventoryBreakdownTable';

function ChartModeToggle({ mode, onChange }) {
  return (
    <div className="make-breakdown-head-controls">
      <div className="chart-mode" role="group" aria-label="Chart type">
        <button
          type="button"
          className={`cm-btn ${mode === 'donut' ? 'active' : ''}`}
          onClick={() => onChange('donut')}
          aria-pressed={mode === 'donut'}
        >
          Donut
        </button>
        <button
          type="button"
          className={`cm-btn ${mode === 'bar' ? 'active' : ''}`}
          onClick={() => onChange('bar')}
          aria-pressed={mode === 'bar'}
        >
          Bar
        </button>
      </div>
    </div>
  );
}

function InventoryDonutChart({
  rows,
  centerLabel,
  centerUnits,
  size = 280,
  stroke = 28,
  baselineDonutData,
  loading = false,
  periodLabel,
}) {
  const donutData = useMemo(() => rowsToInventoryDonutData(rows), [rows]);
  const allData = useMemo(() => rowsToInventoryDonutData(rows), [rows]);

  const listData = useMemo(() => {
    if (!baselineDonutData) return allData;
    return buildDonutCompareDeltas(allData, baselineDonutData).items;
  }, [allData, baselineDonutData]);

  const { totalDelta } = useMemo(() => {
    if (!baselineDonutData) return { totalDelta: null };
    return buildDonutCompareDeltas(allData, baselineDonutData);
  }, [allData, baselineDonutData]);

  const total = useMemo(
    () => donutData.reduce((sum, row) => sum + row.value, 0),
    [donutData],
  );
  const centerTotal = centerUnits ?? total;

  if (loading && rows.length === 0) {
    return (
      <div className="inventory-condition-compare-pane">
        {periodLabel && (
          <div className="inventory-compare-period-label">{periodLabel}</div>
        )}
        <div className="inventory-condition-donut-center inventory-condition-donut-center--loading">
          <BreakdownDonut
            embedded
            hideList
            data={[]}
            centerLabel={centerLabel}
            loading
            size={size}
            stroke={stroke}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="inventory-condition-compare-pane">
      {periodLabel && (
        <div className="inventory-compare-period-label">{periodLabel}</div>
      )}
      <div className="inventory-condition-donut-center">
        <BreakdownDonut
          embedded
          hideList
          data={listData}
          chartData={donutData}
          centerLabel={centerLabel}
          centerValue={formatInventoryUnits(centerTotal)}
          totalViews={centerTotal}
          totalDelta={totalDelta}
          size={size}
          stroke={stroke}
          sliceTooltipUnit="units"
          pctDecimals={1}
        />
      </div>
    </div>
  );
}

function InventoryBarChart({ rows, maxBar: maxBarProp }) {
  const donutData = useMemo(() => rowsToInventoryDonutData(rows), [rows]);
  const maxBar = maxBarProp ?? Math.max(...donutData.map((row) => row.value), 1);

  return (
    <div className="make-breakdown-bars inventory-condition-bars">
      {donutData.map((row) => {
        const heightPct = Math.max((row.value / maxBar) * 100, 4);
        return (
          <div key={row.name} className="make-breakdown-bar-col">
            <div
              className="make-breakdown-bar-v"
              style={{
                height: `${heightPct}%`,
                background: row.color,
                minHeight: 8,
              }}
            >
              <span className="make-breakdown-bar-tip">
                {formatInventoryUnits(row.value)}
              </span>
            </div>
            <span className="make-breakdown-bar-label" title={row.name}>
              {row.name}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export default function InventoryBreakdownBlock({
  title,
  labelHeader,
  rows = [],
  totalUnits = 0,
  totalValue = 0,
  centerLabel = 'UNITS',
  compareEnabled = false,
  compareRows = [],
  compareTotalUnits = 0,
  compareTotalValue = 0,
  compareDateLabel = '',
  reportDateLabel = '',
  compareLoading = false,
}) {
  const [chartMode, setChartMode] = useState('donut');

  const donutData = useMemo(() => rowsToInventoryDonutData(rows), [rows]);
  const compareDonutData = useMemo(
    () => rowsToInventoryDonutData(compareRows),
    [compareRows],
  );

  const maxBar = useMemo(
    () => Math.max(
      ...donutData.map((row) => row.value),
      ...compareDonutData.map((row) => row.value),
      1,
    ),
    [donutData, compareDonutData],
  );

  const compareDonutSize = compareEnabled ? 240 : 280;
  const compareDonutStroke = compareEnabled ? 24 : 28;

  return (
    <Panel className="breakdown-donut-panel inventory-condition-block dashboard-full-row">
      <PanelHeader title={title}>
        <ChartModeToggle mode={chartMode} onChange={setChartMode} />
      </PanelHeader>
      <PanelBody className="breakdown-donut-body">
        {compareEnabled ? (
          <div className="inventory-condition-compare-layout">
            <div className="inventory-condition-compare-donuts">
              {chartMode === 'donut' ? (
                <>
                  <InventoryDonutChart
                    rows={compareRows}
                    centerLabel={centerLabel}
                    centerUnits={compareTotalUnits}
                    size={compareDonutSize}
                    stroke={compareDonutStroke}
                    loading={compareLoading}
                    periodLabel={compareDateLabel}
                  />
                  <InventoryDonutChart
                    rows={rows}
                    centerLabel={centerLabel}
                    centerUnits={totalUnits}
                    size={compareDonutSize}
                    stroke={compareDonutStroke}
                    baselineDonutData={compareDonutData}
                    periodLabel={reportDateLabel}
                  />
                </>
              ) : (
                <>
                  <div className="inventory-condition-compare-pane">
                    <div className="inventory-compare-period-label">{compareDateLabel}</div>
                    <InventoryBarChart rows={compareRows} maxBar={maxBar} />
                  </div>
                  <div className="inventory-condition-compare-pane">
                    <div className="inventory-compare-period-label">{reportDateLabel}</div>
                    <InventoryBarChart rows={rows} maxBar={maxBar} />
                  </div>
                </>
              )}
            </div>
            <div className="inventory-condition-compare-tables">
              <InventoryBreakdownTable
                rows={compareRows}
                totalUnits={compareTotalUnits}
                totalValue={compareTotalValue}
                labelHeader={labelHeader}
                periodLabel={compareDateLabel}
              />
              <InventoryBreakdownTable
                rows={rows}
                totalUnits={totalUnits}
                totalValue={totalValue}
                labelHeader={labelHeader}
                periodLabel={reportDateLabel}
              />
            </div>
          </div>
        ) : (
          <div className="inventory-condition-split">
            <div className="inventory-condition-chart-col">
              {chartMode === 'donut' ? (
                <div className="inventory-condition-donut-center">
                  <BreakdownDonut
                    embedded
                    hideList
                    data={donutData}
                    centerLabel={centerLabel}
                    centerValue={formatInventoryUnits(totalUnits)}
                    totalViews={totalUnits}
                    size={280}
                    stroke={28}
                    sliceTooltipUnit="units"
                    pctDecimals={1}
                  />
                </div>
              ) : (
                <InventoryBarChart rows={rows} maxBar={maxBar} />
              )}
            </div>

            <InventoryBreakdownTable
              rows={rows}
              totalUnits={totalUnits}
              totalValue={totalValue}
              labelHeader={labelHeader}
            />
          </div>
        )}
      </PanelBody>
    </Panel>
  );
}
