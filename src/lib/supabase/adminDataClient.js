import { createServerAnonClient } from '@/lib/supabase/serverAnon';
import { createServiceRoleClient } from '@/lib/supabase/serviceRole';

/**
 * Admin data client: prefers service role (reads smart_hoot_config under RLS).
 * Falls back to anon — dealer list may be empty unless RLS allows it.
 */
export function createAdminDataClient() {
  const service = createServiceRoleClient();
  if (service) return { supabase: service, mode: 'service' };

  const anon = createServerAnonClient();
  if (anon) return { supabase: anon, mode: 'anon' };

  return null;
}
