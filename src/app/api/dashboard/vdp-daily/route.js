import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { fetchVdpKpiFiltered } from '@/lib/api/vdpKpiFetch';
import { parseInvRpcFromSearchParams } from '@/lib/vdp/vdpFilterParams';

export const maxDuration = 120;

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const clientId = searchParams.get('clientId')?.trim();
  const from = searchParams.get('from')?.slice(0, 10);
  const to = searchParams.get('to')?.slice(0, 10);
  const inv = parseInvRpcFromSearchParams(searchParams);

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

  try {
    const result = await fetchVdpKpiFiltered(supabase, {
      clientId,
      from,
      to,
      invParams: inv,
    });

    return NextResponse.json({
      ...result,
      meta: { source: 'vdp-kpi-rpc' },
    });
  } catch (err) {
    const message = err?.message || 'Failed to load VDP daily views';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
