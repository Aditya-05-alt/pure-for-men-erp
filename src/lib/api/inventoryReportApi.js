import { createClient } from '@/lib/supabase/client';
import { ALL_DEALER_ID } from '@/lib/dashboard/allDealers';
import { inventoryFiltersToRpcParams } from '@/lib/inventory/inventoryReportFilters';
import { normalizeInventoryReportDate } from '@/lib/inventory/inventoryReportPrefs';

function resolveRpcClientId(clientId) {
  const trimmed = String(clientId || '').trim();
  if (!trimmed || trimmed === ALL_DEALER_ID) return null;
  return trimmed;
}

function inventoryReportRpcParams(clientId, reportDate, filters) {
  return {
    p_client_id: resolveRpcClientId(clientId),
    p_report_date: normalizeInventoryReportDate(reportDate),
    ...inventoryFiltersToRpcParams(filters),
  };
}

/** Full inventory report via get_inventory_report RPC (reads smart_hoot_inventory_daily from live snapshot). */
export async function fetchGetInventoryReport({
  clientId,
  reportDate,
  filters,
}) {
  const supabase = createClient();
  if (!supabase) throw new Error('Supabase is not configured.');

  const { data, error } = await supabase.rpc(
    'get_inventory_report',
    inventoryReportRpcParams(clientId, reportDate, filters),
  );

  if (error) {
    throw new Error(error.message || 'Failed to fetch inventory report.');
  }

  if (!data) {
    throw new Error('Inventory report returned no data.');
  }

  return data;
}

function rpcParams(clientId, reportDate, filters) {
  const trimmedId = resolveRpcClientId(clientId);
  if (!trimmedId) {
    throw new Error('Missing clientId for inventory breakdown.');
  }

  return {
    p_client_id: trimmedId,
    p_report_date: normalizeInventoryReportDate(reportDate),
    ...inventoryFiltersToRpcParams(filters),
  };
}

/** Condition breakdown from smart_hoot_inventory via con_inv_breakdown RPC. */
export async function fetchConInvBreakdown({
  clientId,
  reportDate,
  filters,
}) {
  const supabase = createClient();
  if (!supabase) throw new Error('Supabase is not configured.');

  const { data, error } = await supabase.rpc('con_inv_breakdown', rpcParams(clientId, reportDate, filters));

  if (error) {
    throw new Error(error.message || 'Failed to fetch inventory condition breakdown.');
  }

  return data || [];
}

/** Location breakdown from smart_hoot_inventory via loc_inv_breakdown RPC. */
export async function fetchLocInvBreakdown({
  clientId,
  reportDate,
  filters,
}) {
  const supabase = createClient();
  if (!supabase) throw new Error('Supabase is not configured.');

  const { data, error } = await supabase.rpc('loc_inv_breakdown', rpcParams(clientId, reportDate, filters));

  if (error) {
    throw new Error(error.message || 'Failed to fetch inventory location breakdown.');
  }

  return data || [];
}
