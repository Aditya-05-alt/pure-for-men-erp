import {
  defaultChannels,
  defaultMappingEntries,
  rawPairKey,
} from '@/lib/sourceMapping/defaults';

export const CHANNELS_TABLE = 'smart_source_mapping_channels';
export const RULES_TABLE = 'smart_source_mapping_rules';

const PAGE_SIZE = 1000;

export function normalizeChannelRow(row) {
  return {
    id: String(row.id),
    name: String(row.name || 'Channel'),
    color: String(row.color || '#94a3b8'),
    sortOrder: Number(row.sort_order ?? row.sortOrder) || 0,
    isUnmapped: Boolean(row.is_unmapped ?? row.isUnmapped),
  };
}

export function normalizeRuleRow(row) {
  return {
    rawSource: String(row.raw_source ?? row.rawSource ?? '').trim() || '(direct)',
    rawMedium: String(row.raw_medium ?? row.rawMedium ?? '').trim() || '(none)',
    channelId: String(row.channel_id ?? row.channelId ?? 'unmapped'),
  };
}

/** PostgREST defaults to 1000 rows — page until exhausted so saves don't truncate. */
async function fetchAllRows(supabase, table, columns, { order } = {}) {
  const all = [];
  let from = 0;
  for (;;) {
    let q = supabase.from(table).select(columns).range(from, from + PAGE_SIZE - 1);
    if (order?.column) {
      q = q.order(order.column, { ascending: order.ascending !== false });
    }
    const { data, error } = await q;
    if (error) throw error;
    const batch = data || [];
    all.push(...batch);
    if (batch.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return all;
}

export async function loadSourceMapping(supabase) {
  try {
    const [chRows, ruleRows] = await Promise.all([
      fetchAllRows(supabase, CHANNELS_TABLE, 'id, name, color, sort_order, is_unmapped', {
        order: { column: 'sort_order', ascending: true },
      }),
      fetchAllRows(supabase, RULES_TABLE, 'id, raw_source, raw_medium, channel_id', {
        order: { column: 'id', ascending: true },
      }),
    ]);

    let channels = (chRows || []).map(normalizeChannelRow);
    if (!channels.length) channels = defaultChannels();

    const rules = (ruleRows || []).map(normalizeRuleRow);
    const mapping = Object.fromEntries(
      rules.map((r) => [rawPairKey(r.rawSource, r.rawMedium), r.channelId])
    );

    return { channels, mapping, rules, fromDefaults: false, missingTable: false };
  } catch (err) {
    const msg = err?.message || 'Failed to load source mapping';
    const missing = /could not find the table|relation .* does not exist|schema cache/i.test(
      msg
    );
    return {
      channels: defaultChannels(),
      mapping: Object.fromEntries(
        defaultMappingEntries().map((e) => [
          rawPairKey(e.rawSource, e.rawMedium),
          e.channelId,
        ])
      ),
      rules: defaultMappingEntries(),
      fromDefaults: true,
      missingTable: missing,
      error: msg,
    };
  }
}

export async function saveSourceMapping(supabase, { channels, rules }) {
  const chList = (channels || []).map((c, i) => ({
    id: String(c.id),
    name: String(c.name || 'Channel').trim() || 'Channel',
    color: String(c.color || '#94a3b8'),
    sort_order: Number(c.sortOrder ?? (i + 1) * 10) || (i + 1) * 10,
    is_unmapped: Boolean(c.isUnmapped) || c.id === 'unmapped',
    updated_at: new Date().toISOString(),
  }));

  // Ensure Unmapped exists
  if (!chList.some((c) => c.id === 'unmapped')) {
    chList.push({
      id: 'unmapped',
      name: 'Unmapped',
      color: '#94a3b8',
      sort_order: 999,
      is_unmapped: true,
      updated_at: new Date().toISOString(),
    });
  }

  const validIds = new Set(chList.map((c) => c.id));
  const ruleList = [];
  const seen = new Set();
  for (const r of rules || []) {
    // Normalize to lowercase so UNIQUE (raw_source, raw_medium) matches rawPairKey.
    const rawSource =
      String(r.rawSource || '')
        .trim()
        .toLowerCase() || '(direct)';
    const rawMedium =
      String(r.rawMedium || '')
        .trim()
        .toLowerCase() || '(none)';
    const key = rawPairKey(rawSource, rawMedium);
    if (seen.has(key)) continue;
    seen.add(key);
    let channelId = String(r.channelId || 'unmapped');
    if (!validIds.has(channelId)) channelId = 'unmapped';
    ruleList.push({
      raw_source: rawSource,
      raw_medium: rawMedium,
      channel_id: channelId,
      updated_at: new Date().toISOString(),
    });
  }

  // Upsert channels first (never wipe rules before a successful write).
  const { error: upsertChErr } = await supabase
    .from(CHANNELS_TABLE)
    .upsert(chList, { onConflict: 'id' });
  if (upsertChErr) throw new Error(upsertChErr.message);

  const keepIds = chList.map((c) => c.id);
  const existingChannels = await fetchAllRows(supabase, CHANNELS_TABLE, 'id');
  const toDelete = (existingChannels || [])
    .map((r) => r.id)
    .filter((id) => !keepIds.includes(id));
  if (toDelete.length) {
    const { error: delChErr } = await supabase
      .from(CHANNELS_TABLE)
      .delete()
      .in('id', toDelete);
    if (delChErr) throw new Error(delChErr.message);
  }

  // Upsert rules in chunks to avoid payload limits.
  if (ruleList.length) {
    for (let i = 0; i < ruleList.length; i += PAGE_SIZE) {
      const chunk = ruleList.slice(i, i + PAGE_SIZE);
      const { error: upsErr } = await supabase
        .from(RULES_TABLE)
        .upsert(chunk, { onConflict: 'raw_source,raw_medium' });
      if (upsErr) throw new Error(upsErr.message);
    }
  }

  // Drop only rules that are no longer in the saved mapping (paginated read).
  const existingRules = await fetchAllRows(
    supabase,
    RULES_TABLE,
    'id, raw_source, raw_medium'
  );

  const keepKeys = new Set(
    ruleList.map((r) => rawPairKey(r.raw_source, r.raw_medium))
  );
  const removeIds = (existingRules || [])
    .filter((r) => !keepKeys.has(rawPairKey(r.raw_source, r.raw_medium)))
    .map((r) => r.id);

  for (let i = 0; i < removeIds.length; i += PAGE_SIZE) {
    const chunk = removeIds.slice(i, i + PAGE_SIZE);
    const { error: delRuleErr } = await supabase
      .from(RULES_TABLE)
      .delete()
      .in('id', chunk);
    if (delRuleErr) throw new Error(delRuleErr.message);
  }

  return loadSourceMapping(supabase);
}
