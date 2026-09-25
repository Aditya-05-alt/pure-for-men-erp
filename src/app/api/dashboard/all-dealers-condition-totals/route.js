import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

export const maxDuration = 60;

/**
 * Lightweight New / Used / Unknown totals for All Dealers KPI.
 * RPC: get_all_dealers_condition_totals_advance
 */
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const from = searchParams.get('from')?.slice(0, 10);
  const to = searchParams.get('to')?.slice(0, 10);
  const channel = searchParams.get('channel')?.trim() || null;
  const clientIds = searchParams
    .getAll('clientId')
    .map((id) => id.trim())
    .filter(Boolean);

  if (!from || !to) {
    return NextResponse.json({ error: 'Missing from or to' }, { status: 400 });
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

  const { data, error } = await supabase.rpc(
    'get_all_dealers_condition_totals_advance',
    {
      p_from: from,
      p_to: to,
      p_client_ids: clientIds.length ? clientIds : null,
      p_channel:
        !channel || channel === 'all' || /^all channels$/i.test(channel)
          ? null
          : channel,
    }
  );

  if (error) {
    console.error('[all-dealers-condition-totals]', error.message);
    const hint = /does not exist|schema cache/i.test(error.message || '')
      ? ' Deploy get_all_dealers_condition_totals_advance.sql in Supabase.'
      : '';
    return NextResponse.json({ error: error.message + hint }, { status: 500 });
  }

  return NextResponse.json({ data: data ?? [], source: 'condition-totals' });
}
