import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { mapGa4ChannelMatrixRows } from '@/lib/sourceMapping/apply';
import { loadSourceMapping } from '@/lib/sourceMapping/store';

export const maxDuration = 120;

/**
 * All-dealer channel matrix — materialized views:
 *   mv_ga4_channel_daily | mv_ga4_channel_monthly | mv_ga4_channel_yearly
 * via get_all_dealers_channel_matrix_advance.
 * Channel labels/colors aligned to Source Mapping names (display only).
 */
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const from = searchParams.get('from')?.slice(0, 10);
  const to = searchParams.get('to')?.slice(0, 10);
  const pageType = searchParams.get('pageType')?.trim() || 'ALL';
  const conditionRaw = searchParams.get('condition')?.trim() || 'BOTH';
  const condition = ['NEW', 'USED', 'BOTH', 'ALL'].includes(
    conditionRaw.toUpperCase()
  )
    ? conditionRaw.toUpperCase()
    : 'BOTH';
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

  const rpcParams = {
    p_from: from,
    p_to: to,
    p_page_type: pageType,
    p_client_ids: clientIds.length ? clientIds : null,
    p_condition: condition === 'ALL' ? 'BOTH' : condition,
  };

  const { data, error } = await supabase.rpc(
    'get_all_dealers_channel_matrix_advance',
    rpcParams
  );

  if (error) {
    console.error(
      '[all-dealers-channel-matrix-advance]',
      error.message,
      clientIds.length ? `chunk=${clientIds.length}` : 'all'
    );
    const hint = /mv_ga4_channel|does not exist|schema cache/i.test(
      error.message || ''
    )
      ? ' Ensure mv_ga4_channel_daily / monthly / yearly exist and get_all_dealers_channel_matrix_advance is deployed. Refresh MVs after GA4 sync.'
      : '';
    return NextResponse.json({ error: error.message + hint }, { status: 500 });
  }

  let rows = data ?? [];
  try {
    const mappingCfg = await loadSourceMapping(supabase);
    rows = mapGa4ChannelMatrixRows(rows, mappingCfg.channels);
  } catch (err) {
    console.warn(
      '[all-dealers-channel-matrix] mapping align skipped:',
      err?.message
    );
  }

  return NextResponse.json({ data: rows, mapped: true, source: 'mv' });
}
