import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

export const maxDuration = 60;

/** Top VDP vehicles from smart_final_data via get_top_vdp_vehicles_advance. */
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const clientId = searchParams.get('clientId')?.trim();
  const from = searchParams.get('from')?.slice(0, 10);
  const to = searchParams.get('to')?.slice(0, 10);
  const limitRaw = searchParams.get('limit');
  const limit =
    limitRaw == null || limitRaw === '' || String(limitRaw).toLowerCase() === 'all'
      ? 500
      : Math.min(Math.max(Number(limitRaw) || 5, 1), 500);

  if (!clientId || !from || !to) {
    return NextResponse.json(
      { error: 'Missing clientId, from, or to' },
      { status: 400 }
    );
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    return NextResponse.json(
      { error: 'SUPABASE_SERVICE_ROLE_KEY is not configured on the server' },
      { status: 503 }
    );
  }

  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await supabase.rpc('get_top_vdp_vehicles_advance', {
    p_client_id: clientId,
    p_from: from,
    p_to: to,
    p_limit: limit,
  });

  if (error) {
    console.error('[top-vdp-vehicles-advance]', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ rows: data ?? [] });
}
