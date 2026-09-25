import { getSuperadminFromCookies } from '@/lib/auth/adminApiAuth';
import { createAdminDataClient } from '@/lib/supabase/adminDataClient';

export async function requireAdminPipeline() {
  const session = await getSuperadminFromCookies();
  if (!session) return { error: 'Unauthorized', status: 401 };

  const admin = createAdminDataClient();
  if (!admin) {
    return {
      error: 'SUPABASE_SERVICE_ROLE_KEY required for pipeline operations.',
      status: 503,
    };
  }

  return { supabase: admin.supabase, mode: admin.mode };
}
