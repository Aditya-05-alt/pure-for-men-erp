import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

/** Raw source/medium rows for Source Mapping preview — all dashboard users. */
export async function GET(request) {
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

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const key = serviceKey || anonKey;
  if (!url || !key) {
    return NextResponse.json(
      { error: 'Supabase is not configured on the server' },
      { status: 503 }
    );
  }

  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await supabase.rpc(
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
    rawChannel: r.raw_channel || r.channel || '(not set)',
    pageViews: Number(r.page_views) || 0,
    vdpViews: Number(r.vdp_views) || 0,
  }));

  return NextResponse.json({ rows });
}
