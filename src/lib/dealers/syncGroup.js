import { GA4_TABLE } from '@/lib/dealers/fields';

/** Max active dealers per GA4 sync group (cron runs one group per batch). */
export const MAX_DEALERS_PER_SYNC_GROUP = 4;

/**
 * Pick sync_group for a new dealer:
 * - Use the highest existing sync_group if it has fewer than 4 active dealers
 * - Otherwise create the next group (max + 1)
 */
export async function resolveSyncGroupForNewDealer(supabase) {
  const { data, error } = await supabase
    .from(GA4_TABLE)
    .select('sync_group')
    .eq('is_active', true)
    .not('sync_group', 'is', null);

  if (error) {
    if (/sync_group/i.test(error.message || '')) {
      throw new Error(
        'sync_group column missing on smart_ga4_config — run supabase/migrations/smart_ga4_config_sync_group.sql',
      );
    }
    throw error;
  }

  const rows = data || [];
  if (rows.length === 0) return 1;

  let maxGroup = 0;
  const counts = new Map();

  for (const row of rows) {
    const group = Number(row.sync_group);
    if (!Number.isFinite(group)) continue;
    maxGroup = Math.max(maxGroup, group);
    counts.set(group, (counts.get(group) || 0) + 1);
  }

  if (maxGroup < 1) return 1;

  const dealersInMaxGroup = counts.get(maxGroup) || 0;
  if (dealersInMaxGroup < MAX_DEALERS_PER_SYNC_GROUP) {
    return maxGroup;
  }

  return maxGroup + 1;
}
