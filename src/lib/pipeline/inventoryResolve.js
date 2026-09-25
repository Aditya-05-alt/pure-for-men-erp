import { isScrapLinkOn } from '@/lib/vdpLogics/scrapStatus';

export const FINAL_RPC_HOOT = 'build_smart_final_data';
export const FINAL_RPC_SCRAP = 'build_smart_final_data_scrap';

function hasText(value) {
  return Boolean(String(value ?? '').trim());
}

async function loadVdpLogicRow(supabase, clientId, customerName) {
  const { data: byId, error: byIdError } = await supabase
    .from('smart_vdp_logic')
    .select('hoot_link, scrap_link')
    .eq('dealer_id', clientId)
    .order('id', { ascending: false })
    .limit(1);

  if (byIdError) {
    throw new Error(byIdError.message);
  }
  if (byId?.[0]) {
    return byId[0];
  }

  if (!customerName) {
    return null;
  }

  const { data: byName, error: byNameError } = await supabase
    .from('smart_vdp_logic')
    .select('hoot_link, scrap_link')
    .eq('dealer_name', customerName)
    .order('id', { ascending: false })
    .limit(1);

  if (byNameError) {
    throw new Error(byNameError.message);
  }

  return byName?.[0] ?? null;
}

/**
 * Pick Step 3 RPC for one dealer.
 *
 * Config tables:
 * - smart_vdp_logic (hoot_link, scrap_link) — Admin → VDP Logics
 * - smart_hoot_config (customer_name, hoot_url, ga4_customer_id)
 * Inventory tables:
 * - smart_hoot_inventory_live (customer_name) — hoot report pipeline live feed
 * - smart_scrap_inventory (customer_id / customer_name)
 *
 * Priority:
 * 1. hoot_link set → hoot RPC
 * 2. scrap_link OR scrap inventory rows → scrap RPC (even if stale hoot_url / hoot rows exist)
 * 3. hoot_url OR hoot inventory rows → hoot RPC
 * 4. default → scrap RPC
 */
export async function resolveFinalVdpRpc(supabase, clientId) {
  const trimmedId = String(clientId || '').trim();
  if (!trimmedId) {
    throw new Error('Missing clientId for inventory resolution.');
  }

  const { data: configRows, error: configError } = await supabase
    .from('smart_hoot_config')
    .select('customer_name, hoot_url')
    .eq('ga4_customer_id', trimmedId)
    .eq('is_active', true)
    .limit(1);

  if (configError) {
    throw new Error(configError.message);
  }

  const customerName = configRows?.[0]?.customer_name?.trim() || null;
  const hootUrl = configRows?.[0]?.hoot_url?.trim() || null;
  const vdpLogic = await loadVdpLogicRow(supabase, trimmedId, customerName);

  const hasHootLink = hasText(vdpLogic?.hoot_link);
  const hasHootUrl = hasText(hootUrl);

  let hootInventoryCount = 0;
  if (customerName) {
    const { count, error } = await supabase
      .from('smart_hoot_inventory_live')
      .select('*', { count: 'exact', head: true })
      .eq('customer_name', customerName);

    if (error) {
      throw new Error(error.message);
    }
    hootInventoryCount = count ?? 0;
  }

  let scrapInventoryCount = 0;
  const { count: scrapByClientId, error: scrapByIdError } = await supabase
    .from('smart_scrap_inventory')
    .select('*', { count: 'exact', head: true })
    .eq('customer_id', trimmedId);

  if (scrapByIdError) {
    throw new Error(scrapByIdError.message);
  }
  scrapInventoryCount = scrapByClientId ?? 0;

  if (scrapInventoryCount === 0 && customerName) {
    const { count: scrapByName, error: scrapByNameError } = await supabase
      .from('smart_scrap_inventory')
      .select('*', { count: 'exact', head: true })
      .eq('customer_name', customerName);

    if (scrapByNameError) {
      throw new Error(scrapByNameError.message);
    }
    scrapInventoryCount = scrapByName ?? 0;
  }

  const hasScrapInventory = scrapInventoryCount > 0;
  const hasHootInventory = hootInventoryCount > 0;
  const hasScrapLink = isScrapLinkOn(vdpLogic?.scrap_link, scrapInventoryCount);
  const hasScrapSource = hasScrapLink || hasScrapInventory;

  let useHoot;
  let step3Reason;

  if (hasHootLink) {
    useHoot = true;
    step3Reason = 'hoot_link in smart_vdp_logic';
  } else if (hasScrapSource) {
    useHoot = false;
    step3Reason = hasScrapLink
      ? vdpLogic?.scrap_link?.trim().toLowerCase() === 'on'
        ? 'scrap_link on in smart_vdp_logic'
        : 'scrap enabled in smart_vdp_logic'
      : `smart_scrap_inventory (${scrapInventoryCount.toLocaleString()} rows)`;
  } else if (hasHootUrl || hasHootInventory) {
    useHoot = true;
    step3Reason = hasHootUrl
      ? 'hoot_url on smart_hoot_config'
      : `smart_hoot_inventory_live (${hootInventoryCount.toLocaleString()} rows)`;
  } else {
    useHoot = false;
    step3Reason = 'no hoot source configured';
  }

  return {
    rpcName: useHoot ? FINAL_RPC_HOOT : FINAL_RPC_SCRAP,
    inventorySource: useHoot ? 'hoot' : 'scrap',
    step3Reason,
    customerName,
    hasHootLink,
    hasScrapLink,
    hasHootUrl,
    hasHootSource: useHoot,
    hasScrapSource,
    hasScrapInventory,
    hasHootInventory,
    hootInventoryCount,
    scrapInventoryCount,
  };
}
