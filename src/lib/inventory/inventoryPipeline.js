/**
 * Inventory report data pipeline (hoot dealers).
 *
 * 1. smart-hoot-inv-live edge → smart_hoot_inventory_live (full replace daily)
 * 2. inventory-report-daily-sync edge → smart_hoot_inventory_daily snapshot
 * 3. get_inventory_report RPC → dashboard inventory report UI
 */

export const INVENTORY_PIPELINE = {
  hootLiveEdge: 'smart-hoot-inv-live',
  snapshotEdge: 'inventory-report-daily-sync',
  pipelineEdge: 'inventory-report-pipeline',
  cronJob: 'inventory-report-pipeline',
  liveTable: 'smart_hoot_inventory_live',
  dailyHootTable: 'smart_hoot_inventory_daily',
  dailyScrapTable: 'smart_scrap_inventory_daily',
  reportRpc: 'get_inventory_report',
};

const SUPABASE_PROJECT_HOST = 'rllwmeqingvuohyctddg.supabase.co';

export function inventoryPipelineEdgeUrl(edgeName) {
  return `https://${SUPABASE_PROJECT_HOST}/functions/v1/${edgeName}`;
}

/** Short label for the inventory report status bar. */
export function inventoryReportSourceLabel(meta = {}) {
  if (meta?.source === 'sample') return 'sample data';

  const inventorySource = meta?.inventorySource;
  if (inventorySource === 'scrap') return 'scrap inventory';
  if (inventorySource === 'mixed') return 'hoot + scrap inventory';
  if (inventorySource === 'hoot' || meta?.hootSource === 'smart_hoot_inventory_live') {
    return 'hoot live inventory';
  }

  return null;
}
