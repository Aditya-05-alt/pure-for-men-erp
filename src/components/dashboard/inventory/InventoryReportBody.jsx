'use client';

import StatusBar from '@/components/dashboard/StatusBar';
import { INVENTORY_REPORT_SECTION_ORDER } from '@/lib/inventory/inventoryReport';
import { inventoryReportSourceLabel } from '@/lib/inventory/inventoryPipeline';
import InventoryBreakdownBlock from './InventoryBreakdownBlock';
import InventoryList from './InventoryList';
import InventoryReportFilters from './InventoryReportFilters';
import {
  InventoryReportProvider,
  useInventoryReport,
} from './InventoryReportContext';

function InventoryReportContent() {
  const {
    sections,
    compareSections,
    inventoryList,
    compareInventoryList,
    loading,
    compareEnabled,
    compareLoading,
    compareDateLabel,
    reportDateLabel,
    error,
    compareError,
    meta,
  } = useInventoryReport();

  const statusItems = error || compareError
    ? [{ label: `Inventory report · ${error || compareError}`, color: 'var(--red)' }]
    : [
        {
          label: meta?.source === 'sample'
            ? 'Inventory report · sample data (Supabase not configured)'
            : [
                'Inventory report',
                meta?.noSnapshot && meta?.reportDate
                  ? `no snapshot for ${meta.reportDate}`
                  : inventoryReportSourceLabel(meta),
                meta?.pullDate ? `snapshot ${meta.pullDate}` : null,
                meta?.allDealers ? 'All Dealers' : null,
                meta?.rowCount != null ? `${meta.rowCount} units` : null,
              ]
                .filter(Boolean)
                .join(' · '),
          color: 'var(--t3)',
        },
      ];

  return (
    <>
      <InventoryReportFilters />

      <div className="content inventory-report-content">
        {error && (
          <div className="donut-err" role="alert">
            {error}
          </div>
        )}
        {compareError && (
          <div className="donut-err" role="alert">
            {compareError}
          </div>
        )}
        {loading && !sections ? (
          <div className="local-empty-state">
            <p className="local-empty-title">Loading inventory report…</p>
          </div>
        ) : (
          INVENTORY_REPORT_SECTION_ORDER.map((key) => {
            const block = sections?.[key];
            if (!block) return null;
            return (
              <div key={key} className="inventory-report-section">
                <InventoryBreakdownBlock
                  title={block.title}
                  labelHeader={block.labelHeader}
                  rows={block.rows}
                  totalUnits={block.totalUnits}
                  totalValue={block.totalValue}
                  centerLabel="UNITS"
                  compareEnabled={compareEnabled}
                  compareRows={compareSections?.[key]?.rows ?? []}
                  compareTotalUnits={compareSections?.[key]?.totalUnits ?? 0}
                  compareTotalValue={compareSections?.[key]?.totalValue ?? 0}
                  compareDateLabel={compareDateLabel}
                  reportDateLabel={reportDateLabel}
                  compareLoading={compareLoading}
                />
              </div>
            );
          })
        )}

        {inventoryList && (
          <div className="inventory-report-section inventory-report-list-section">
            <InventoryList
              list={inventoryList}
              compareEnabled={compareEnabled}
              compareList={compareInventoryList}
              compareDateLabel={compareDateLabel}
              reportDateLabel={reportDateLabel}
              compareLoading={compareLoading}
            />
          </div>
        )}
      </div>

      <StatusBar items={statusItems} />
    </>
  );
}

export default function InventoryReportBody() {
  return (
    <InventoryReportProvider>
      <InventoryReportContent />
    </InventoryReportProvider>
  );
}
