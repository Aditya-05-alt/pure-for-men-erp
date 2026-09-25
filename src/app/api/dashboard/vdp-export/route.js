import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { parseInvRpcFromSearchParams } from '@/lib/vdp/vdpFilterParams';

export const maxDuration = 120;

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const clientId = searchParams.get('clientId')?.trim();
  const from = searchParams.get('from')?.slice(0, 10);
  const to = searchParams.get('to')?.slice(0, 10);

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
    p_client_id: clientId,
    p_from: from,
    p_to: to,
    ...inv,
  };

  try {
    const [channelRes, locationRes, makeRes, modelRes, conditionRes] =
      await Promise.all([
        supabase.rpc('get_vdp_export_by_channel', params),
        supabase.rpc('get_vdp_export_by_location', params),
        supabase.rpc('get_vdp_export_by_make', params),
        supabase.rpc('get_vdp_export_by_model', params),
        supabase.rpc('get_vdp_export_by_condition', params),
      ]);

    const errors = [
      channelRes.error,
      locationRes.error,
      makeRes.error,
      modelRes.error,
      conditionRes.error,
    ].filter(Boolean);

    if (errors.length) {
      return NextResponse.json({ error: errors[0].message }, { status: 500 });
    }

    return NextResponse.json({
      byChannel: channelRes.data || [],
      byLocation: locationRes.data || [],
      byMake: makeRes.data || [],
      byModel: modelRes.data || [],
      byCondition: conditionRes.data || [],
      meta: { from, to, clientId },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err?.message || 'Failed to load VDP export data' },
      { status: 500 }
    );
  }
}
