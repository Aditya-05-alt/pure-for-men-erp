import { coerceDateRange, STATS_VIEWS_CHUNK_SIZE } from '@/lib/pipeline/dates';
import { resolveFinalVdpRpc } from '@/lib/pipeline/inventoryResolve';
import {
  countPageRowsInRange,
  countVdpPageRowsAny,
  sumPipelineRangeViewsByDate,
} from '@/lib/pipeline/pageViewsStats';

const PAGE_TABLE = 'smart_ga4_page_data';
const FINAL_TABLE = 'smart_final_data';
const FETCH_SIZE = 1000;
export const MAX_RANGE_DAYS = 90;
export const MAX_VIEWS_CHUNK_DAYS = STATS_VIEWS_CHUNK_SIZE;

async function countInRange(supabase, table, clientId, from, to) {
  const { count, error } = await supabase
    .from(table)
    .select('*', { count: 'exact', head: true })
    .eq('client_id', clientId)
    .gte('report_date', from)
    .lte('report_date', to);

  if (error) return { count: 0, error: error.message };
  return { count: count ?? 0 };
}

/** Paginate report_date only — avoids loading full rows into memory. */
export async function filledDatesForTable(supabase, table, clientId, from, to) {
  const filled = new Set();
  let offset = 0;

  while (true) {
    const { data, error } = await supabase
      .from(table)
      .select('report_date')
      .eq('client_id', clientId)
      .gte('report_date', from)
      .lte('report_date', to)
      .order('report_date', { ascending: true })
      .range(offset, offset + FETCH_SIZE - 1);

    if (error) return { error: error.message, filled };

    if (!data?.length) break;

    for (const row of data) {
      filled.add(String(row.report_date).split('T')[0]);
    }

    if (data.length < FETCH_SIZE) break;
    offset += FETCH_SIZE;
  }

  return { filled };
}

export function buildRangeViews(
  rangeDays,
  allPageViews,
  vdpPageViews,
  finalViews,
  hootMatch
) {
  const pick = (map) =>
    Object.fromEntries(rangeDays.map((d) => [d, map[d] ?? null]));
  const pickHoot = () =>
    Object.fromEntries(
      rangeDays.map((d) => {
        const v = hootMatch[d];
        if (!v || (v.matched === 0 && v.nonMatched === 0)) return [d, null];
        return [d, v];
      })
    );
  return {
    ga4Page: pick(allPageViews),
    ga4Filter: pick(vdpPageViews),
    finalVdp: pick(finalViews),
    hootMatch: pickHoot(),
  };
}

export function buildWorkflowPayload({
  clientId,
  from,
  to,
  rangeDays,
  pageFill,
  pageCount,
  vdpInRange,
  vdpTotal,
  finalCount,
  inventory,
}) {
  const pageFilled = pageFill.filled || new Set();
  const missingPage = rangeDays.filter((d) => !pageFilled.has(d));

  const hasPageData = (pageCount.count ?? 0) > 0;
  const vdpInRangeCount = vdpInRange.count ?? 0;
  const vdpTotalCount = vdpTotal.count ?? 0;
  const hasFilterData = vdpInRangeCount > 0 || vdpTotalCount > 0;
  const hasFinalData = (finalCount.count ?? 0) > 0;

  const ga4PageComplete =
    rangeDays.length > 0 && missingPage.length === 0 && hasPageData;

  return {
    clientId,
    from,
    to,
    rangeDays,
    dataPresence: {
      ga4Page: hasPageData,
      ga4Filter: hasFilterData,
      finalVdp: hasFinalData,
    },
    coverage: {
      ga4Page: {
        filled: pageFilled.size,
        total: rangeDays.length,
        missingDates: missingPage,
        rowCount: pageCount.count ?? 0,
      },
      ga4Filter: {
        rowCountInRange: vdpInRangeCount,
        rowCountTotal: vdpTotalCount,
        rowCount: vdpInRangeCount,
      },
      finalVdp: {
        rowCount: finalCount.count ?? 0,
      },
    },
    inventory: inventory
      ? {
          source: inventory.inventorySource,
          step3Rpc: inventory.rpcName,
          hootRowCount: inventory.hootInventoryCount,
          scrapRowCount: inventory.scrapInventoryCount,
          customerName: inventory.customerName,
          step3Reason: inventory.step3Reason,
          hasHootLink: inventory.hasHootLink,
          hasScrapLink: inventory.hasScrapLink,
          hasHootUrl: inventory.hasHootUrl,
          hasHootSource: inventory.hasHootSource,
          hasScrapSource: inventory.hasScrapSource,
          hasScrapInventory: inventory.hasScrapInventory,
          hasHootInventory: inventory.hasHootInventory,
        }
      : null,
    workflow: {
      ga4PageComplete,
      hasPageData,
      hasFilterData,
      hasFinalData,
      canRunStep1: Boolean(clientId),
      canRunStep2: hasPageData,
      canRunStep3: hasFilterData,
      step3Rpc: inventory?.rpcName ?? null,
      inventorySource: inventory?.inventorySource ?? null,
    },
    errors: {
      pageFill: pageFill.error || null,
      vdpInRange: vdpInRange.error || null,
      vdpTotal: vdpTotal.error || null,
    },
  };
}

export async function fetchPipelineWorkflowStats(supabase, clientId, fromRaw, toRaw) {
  const { from, to, dates: rangeDays } = coerceDateRange(fromRaw, toRaw);

  if (!rangeDays.length) {
    return { error: 'Invalid date range', status: 400 };
  }

  if (rangeDays.length > MAX_RANGE_DAYS) {
    return {
      error: `Date range is ${rangeDays.length} days. Maximum ${MAX_RANGE_DAYS} days.`,
      status: 400,
    };
  }

  const [pageFill, pageCount, vdpInRange, vdpTotal, finalCount, inventoryResult] =
    await Promise.all([
      filledDatesForTable(supabase, PAGE_TABLE, clientId, from, to),
      countInRange(supabase, PAGE_TABLE, clientId, from, to),
      countPageRowsInRange(supabase, clientId, from, to, { vdpOnly: true }),
      countVdpPageRowsAny(supabase, clientId),
      countInRange(supabase, FINAL_TABLE, clientId, from, to),
      resolveFinalVdpRpc(supabase, clientId).catch((err) => ({ error: err.message })),
    ]);

  const inventory = inventoryResult?.error ? null : inventoryResult;

  return {
    status: 200,
    body: buildWorkflowPayload({
      clientId,
      from,
      to,
      rangeDays,
      pageFill,
      pageCount,
      vdpInRange,
      vdpTotal,
      finalCount,
      inventory,
    }),
    inventoryError: inventoryResult?.error ?? null,
  };
}

export async function fetchPipelineViewsStats(supabase, clientId, fromRaw, toRaw) {
  const { from, to, dates: rangeDays } = coerceDateRange(fromRaw, toRaw);

  if (!rangeDays.length) {
    return { error: 'Invalid date range', status: 400 };
  }

  if (rangeDays.length > MAX_VIEWS_CHUNK_DAYS) {
    return {
      error: `Views chunk is ${rangeDays.length} days. Maximum ${MAX_VIEWS_CHUNK_DAYS} days per request — load tables in chunks.`,
      status: 400,
    };
  }

  const { allPageViews, vdpPageViews, finalViews, hootMatch } =
    await sumPipelineRangeViewsByDate(supabase, clientId, rangeDays);

  const rangeViews = buildRangeViews(
    rangeDays,
    allPageViews,
    vdpPageViews,
    finalViews,
    hootMatch
  );

  return {
    status: 200,
    body: {
      clientId,
      from,
      to,
      rangeDays,
      rangeViews,
    },
  };
}

export async function fetchPipelineFullStats(supabase, clientId, fromRaw, toRaw) {
  const workflow = await fetchPipelineWorkflowStats(supabase, clientId, fromRaw, toRaw);
  if (workflow.status !== 200) return workflow;

  const { from, to, dates: rangeDays } = coerceDateRange(fromRaw, toRaw);

  const { allPageViews, vdpPageViews, finalViews, hootMatch } =
    await sumPipelineRangeViewsByDate(supabase, clientId, rangeDays);

  const rangeViews = buildRangeViews(
    rangeDays,
    allPageViews,
    vdpPageViews,
    finalViews,
    hootMatch
  );

  return {
    status: 200,
    body: {
      ...workflow.body,
      rangeViews,
    },
  };
}
