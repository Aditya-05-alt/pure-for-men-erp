import { NextResponse } from 'next/server';
import { getSuperadminFromCookies } from '@/lib/auth/adminApiAuth';
import { createAdminDataClient } from '@/lib/supabase/adminDataClient';

/** Base columns only — no migration fields (account_name, ga4_filter_enabled, etc.). */
const HOOT_SELECT =
  'id, customer_name, ga4_customer_id, hoot_id, website_platform, is_active';

export async function GET() {
  if (!(await getSuperadminFromCookies())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = createAdminDataClient();
  if (!admin) {
    return NextResponse.json({ error: 'Supabase not configured.' }, { status: 503 });
  }

  const { data, error } = await admin.supabase
    .from('smart_hoot_config')
    .select(HOOT_SELECT)
    .eq('is_active', true)
    .order('customer_name', { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const dealers = (data || [])
    .filter((r) => r?.customer_name)
    .map((row) => ({
      id: row.id,
      name: row.customer_name || 'Unnamed',
      ga4CustomerId: row.ga4_customer_id
        ? String(row.ga4_customer_id).trim()
        : null,
      websitePlatform: row.website_platform || null,
    }));

  return NextResponse.json({ dealers, mode: admin.mode });
}
