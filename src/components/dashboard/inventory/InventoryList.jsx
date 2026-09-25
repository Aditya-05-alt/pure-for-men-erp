'use client';

import { useCallback, useMemo } from 'react';
import { Panel, PanelHeader, PanelBody } from '@/components/dashboard/Panel';
import {
  formatInventoryUnits,
  formatInventoryValue,
} from '@/lib/inventory/formatInventory';
import { downloadInventoryListCsv } from '@/lib/inventory/inventoryListCsv';
import { groupInventoryListRows } from '@/lib/inventory/inventoryListDisplay';

const EMPTY_LIST = {
  rows: [],
  totalUnits: 0,
  totalValue: 0,
  averagePrice: 0,
};

function rowAveragePrice(row) {
  const units = Number(row.units) || 0;
  const totalValue = Number(row.totalValue) || 0;
  if (units <= 0) return formatInventoryValue(0);
  return formatInventoryValue(totalValue / units);
}

function InventoryListPane({ list, periodLabel, loading = false }) {
  const rows = list?.rows ?? [];
  const displayRows = useMemo(() => groupInventoryListRows(rows), [rows]);
  const totalUnits = Number(list?.totalUnits) || 0;
  const totalValue = Number(list?.totalValue) || 0;
  const averagePrice = Number(list?.averagePrice) || 0;

  return (
    <div className="inventory-list-pane">
      {periodLabel && (
        <div className="inventory-compare-period-label inventory-compare-table-label">
          {periodLabel}
        </div>
      )}
      <div className="inventory-list-table">
        <div className="inventory-list-columns">
          <span>Manufacturer</span>
          <span>Brand / Model</span>
          <span>Condition</span>
          <span>Units</span>
          <span>Average Price</span>
          <span>Total Value</span>
        </div>

        <div className="inventory-list-scroll">
          {loading && displayRows.length === 0 ? (
            <div className="inventory-list-empty">Loading inventory list…</div>
          ) : displayRows.length === 0 ? (
            <div className="inventory-list-empty">No inventory rows for this report.</div>
          ) : (
            displayRows.map((row, index) => {
              const key = `${row.manufacturer}-${row.brandModel}-${row.condition}-${index}`;
              return (
                <div
                  key={key}
                  className={`inventory-list-row${index % 2 === 1 ? ' inventory-list-row--alt' : ''}`}
                >
                  <span
                    className={`inventory-list-cell inventory-list-cell--manufacturer${row.showManufacturer ? ' inventory-list-cell--manufacturer-show' : ''}`}
                    title={row.showManufacturer ? row.manufacturer : undefined}
                  >
                    {row.showManufacturer ? row.manufacturer : ''}
                  </span>
                  <span
                    className="inventory-list-cell inventory-list-cell--model"
                    title={row.brandModel}
                  >
                    {row.brandModel}
                  </span>
                  <span className="inventory-list-cell inventory-list-cell--condition">
                    {row.conditionLabel}
                  </span>
                  <span className="inventory-list-cell inventory-list-cell--num">
                    {formatInventoryUnits(row.units)}
                  </span>
                  <span className="inventory-list-cell inventory-list-cell--num">
                    {rowAveragePrice(row)}
                  </span>
                  <span className="inventory-list-cell inventory-list-cell--num inventory-list-cell--value">
                    {formatInventoryValue(row.totalValue)}
                  </span>
                </div>
              );
            })
          )}
        </div>

        <div className="inventory-list-footer">
          <span className="inventory-list-cell inventory-list-footer-label">
            Grand Total
          </span>
          <span className="inventory-list-cell inventory-list-footer-spacer" aria-hidden />
          <span className="inventory-list-cell inventory-list-footer-spacer" aria-hidden />
          <span className="inventory-list-cell inventory-list-cell--num inventory-list-footer-num">
            {formatInventoryUnits(totalUnits)}
          </span>
          <span className="inventory-list-cell inventory-list-cell--num inventory-list-footer-num">
            {formatInventoryValue(averagePrice)}
          </span>
          <span className="inventory-list-cell inventory-list-cell--num inventory-list-cell--value inventory-list-footer-num">
            {formatInventoryValue(totalValue)}
          </span>
        </div>
      </div>
    </div>
  );
}

export default function InventoryList({
  list,
  compareEnabled = false,
  compareList,
  compareDateLabel = '',
  reportDateLabel = '',
  compareLoading = false,
}) {
  const rows = list?.rows ?? [];

  const onDownload = useCallback(() => {
    downloadInventoryListCsv(list);
  }, [list]);

  return (
    <Panel className="inventory-list-panel breakdown-donut-panel dashboard-full-row">
      <PanelHeader title="Inventory List">
        <button
          type="button"
          className="ga4-count-export-btn inventory-list-download-btn"
          onClick={onDownload}
          disabled={rows.length === 0}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
          Download CSV
        </button>
      </PanelHeader>

      <PanelBody className="inventory-list-body-wrap">
        {compareEnabled ? (
          <div className="inventory-list-compare-grid">
            <InventoryListPane
              list={compareList ?? EMPTY_LIST}
              periodLabel={compareDateLabel}
              loading={compareLoading}
            />
            <InventoryListPane
              list={list ?? EMPTY_LIST}
              periodLabel={reportDateLabel}
            />
          </div>
        ) : (
          <InventoryListPane list={list ?? EMPTY_LIST} />
        )}
      </PanelBody>
    </Panel>
  );
}
