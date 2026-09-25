import { NextResponse } from 'next/server';
import { getSuperadminFromCookies } from '@/lib/auth/adminApiAuth';
import { createAdminDataClient } from '@/lib/supabase/adminDataClient';

/** Distinct raw source/medium rows + MTD-style views for admin Raw Sources table. */
export async function GET(request) {
  if (!(await getSuperadminFromCookies())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = createAdminDataClient();
  if (!admin) {
    return NextResponse.json({ error: 'Supabase not configured.' }, { status: 503 });
  }

  const { searchParams } = new URL(request.url);
  const clientId = searchParams.get('clientId')?.trim();
  const from = searchParams.get('from')?.slice(0, 10);
  const to = searchParams.get('to')?.slice(0, 10);

  if (!clientId || !from || !to) {
    return NextResponse.json(
      { error: 'Missing clientId, from, or to' },
      { status: 400 }
    );
  }

  const { data, error } = await admin.supabase.rpc(
    'get_raw_source_medium_traffic_advance',
    {
      p_client_id: clientId,
      p_from: from,
      p_to: to,
    }
  );

  if (error) {
    const hint = /could not find the function|schema cache/i.test(error.message || '')
      ? ' Deploy supabase/migrations/source_mapping.sql in Supabase SQL editor.'
      : '';
    return NextResponse.json({ error: error.message + hint }, { status: 500 });
  }

  const rows = (data || []).map((r) => ({
    id: `${String(r.raw_source || '').toLowerCase()}|||${String(r.raw_medium || '').toLowerCase()}`,
    rawSource: r.raw_source,
    rawMedium: r.raw_medium,
    pageViews: Number(r.page_views) || 0,
    vdpViews: Number(r.vdp_views) || 0,
  }));

  return NextResponse.json({ rows });
}
