import {
  GA4_TABLE,
  HOOT_SELECT,
  HOOT_TABLE,
  normalizeDealerRow,
  normalizeGa4PropertyId,
  vdpLogicsAdminUrl,
} from '@/lib/dealers/fields';

export {
  GA4_TABLE,
  HOOT_SELECT,
  HOOT_TABLE,
  normalizeDealerRow,
  normalizeGa4PropertyId,
  vdpLogicsAdminUrl,
};

const GA4_SELECT = 'id, client_id, ga4_property_id, account_name, is_active, sync_group';

export function mapDealerError(error) {
  if (!error) return 'Database error';
  if (error.code === '23505') {
    return 'A dealer with this GA4 client_id and property_id already exists.';
  }
  return error.message || 'Database error';
}

export async function fetchGa4ConfigByClientId(supabase, clientId) {
  if (!clientId) return null;
  const { data, error } = await supabase
    .from(GA4_TABLE)
    .select(GA4_SELECT)
    .eq('client_id', clientId)
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function fetchHootById(supabase, id) {
  const { data, error } = await supabase
    .from(HOOT_TABLE)
    .select(HOOT_SELECT)
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function mergeDealer(supabase, hootRow) {
  const ga4Row = await fetchGa4ConfigByClientId(
    supabase,
    hootRow?.ga4_customer_id ? String(hootRow.ga4_customer_id).trim() : null
  );
  return normalizeDealerRow(hootRow, ga4Row);
}

export async function listDealers(supabase, { activeOnly = false, search = '' } = {}) {
  let query = supabase.from(HOOT_TABLE).select(HOOT_SELECT).order('customer_name', {
    ascending: true,
  });

  if (activeOnly) query = query.eq('is_active', true);

  const { data, error } = await query;
  if (error) throw error;

  let rows = data || [];
  const q = String(search || '').trim().toLowerCase();
  if (q) {
    rows = rows.filter((r) => {
      const hay = [
        r.customer_name,
        r.ga4_customer_id,
        r.hoot_id,
        r.website_platform,
        r.dealer_category,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }

  const merged = await Promise.all(rows.map((r) => mergeDealer(supabase, r)));
  return merged;
}

export async function hasPageDataForClient(supabase, clientId) {
  if (!clientId) return false;
  const { count, error } = await supabase
    .from('smart_ga4_page_data')
    .select('id', { count: 'exact', head: true })
    .eq('client_id', clientId)
    .limit(1);
  if (error) throw error;
  return (count ?? 0) > 0;
}

export async function upsertGa4Config(supabase, payload, options = {}) {
  const record = {
    client_id: payload.ga4CustomerId,
    ga4_property_id: payload.ga4PropertyId,
    account_name: payload.accountName,
    is_active: payload.ga4IsActive,
  };

  const existing = await fetchGa4ConfigByClientId(supabase, payload.ga4CustomerId);
  if (existing?.id) {
    // Fill missing sync_group on existing rows (created before auto-assign).
    if (existing.sync_group == null && options.syncGroup != null) {
      record.sync_group = options.syncGroup;
    }
    const { data, error } = await supabase
      .from(GA4_TABLE)
      .update(record)
      .eq('id', existing.id)
      .select(GA4_SELECT)
      .single();
    if (error) throw error;
    return data;
  }

  if (options.syncGroup != null) {
    record.sync_group = options.syncGroup;
  }

  const { data, error } = await supabase
    .from(GA4_TABLE)
    .insert(record)
    .select(GA4_SELECT)
    .single();
  if (error) throw error;
  return data;
}
