import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { parseInvRpcFromSearchParams } from '@/lib/vdp/vdpFilterParams';

/**
 * Server-side location breakdown (uses service role when configured).
 * Browser anon key cannot read smart_final_data under RLS; this route is a fallback
 * until get_dealer_location_breakdown is deployed as SECURITY DEFINER in Supabase.
 */
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const clientId = searchParams.get('clientId');
  const from = searchParams.get('from');
  const to = searchParams.get('to');

  if (!clientId || !from || !to) {
    return NextResponse.json({ error: 'Missing clientId, from, or to' }, { status: 400 });
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

  const inv = parseInvRpcFromSearchParams(searchParams);

  const params = {
    p_client_id: String(clientId).trim(),
    p_from: String(from).slice(0, 10),
    p_to: String(to).slice(0, 10),
    ...inv,
  };

  let { data, error } = await supabase.rpc('get_dealer_location_breakdown', params);
  if (
    error
    && /function.*does not exist|could not find the function|schema cache/i.test(error.message)
  ) {
    ({ data, error } = await supabase.rpc('get_location_breakdown', params));
  }

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data: data ?? [] });
}
