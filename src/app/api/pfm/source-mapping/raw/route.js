import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

function supabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const key = serviceKey || anonKey;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Pure for Men raw source/medium rows for Source Mapping.
 * Query: from, to, clientId? (default 001)
 * vdp_views = product page views
 */
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const clientId = searchParams.get('clientId')?.trim() || '001';
  const from = searchParams.get('from')?.slice(0, 10);
  const to = searchParams.get('to')?.slice(0, 10);

  if (!from || !to) {
    return NextResponse.json(
      { error: 'Missing from or to' },
      { status: 400 }
    );
  }

  const supabase = supabaseClient();
  if (!supabase) {
    return NextResponse.json(
      { error: 'Supabase is not configured on the server' },
      { status: 503 }
    );
  }

  const { data, error } = await supabase.rpc(
    'get_pfm_raw_source_medium_traffic',
    {
      p_from: from,
      p_to: to,
      p_client_id: clientId,
    }
  );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = (data || []).map((r) => ({
    id: `${String(r.raw_source || '').toLowerCase()}|||${String(r.raw_medium || '').toLowerCase()}`,
    rawSource: r.raw_source,
    rawMedium: r.raw_medium,
    rawChannel: r.raw_channel || '(not set)',
    pageViews: Number(r.page_views) || 0,
    vdpViews: Number(r.vdp_views) || 0,
  }));

  return NextResponse.json({ rows });
}
