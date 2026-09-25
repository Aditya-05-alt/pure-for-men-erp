import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import {
  aggregateRawToChannels,
  toMappingMap,
} from '@/lib/sourceMapping/apply';
import { loadSourceMapping } from '@/lib/sourceMapping/store';

export const maxDuration = 60;

/** Traffic by source — mapped channels from raw source/medium (HTML Source Mapping). */
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
  if (!url || !serviceKey) {
    return NextResponse.json(
      { error: 'SUPABASE_SERVICE_ROLE_KEY is not configured on the server' },
      { status: 503 }
    );
  }

  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const mappingCfg = await loadSourceMapping(supabase);
  const mapping = toMappingMap(mappingCfg.mapping);

  const raw = await supabase.rpc('get_raw_source_medium_traffic_advance', {
    p_client_id: clientId,
    p_from: from,
    p_to: to,
  });

  if (!raw.error) {
    const aggregated = aggregateRawToChannels(
      raw.data || [],
      mappingCfg.channels,
      mapping
    );
    return NextResponse.json({
      rows: aggregated.map((r) => ({
        channel_bucket: r.name,
        page_views: r.pageViews,
        vdp_views: r.vdpViews,
        color: r.color,
      })),
      mapped: true,
    });
  }

  // Fallback: legacy channel RPC if source/medium RPC not deployed yet
  console.warn(
    '[traffic-by-source] raw source/medium RPC unavailable, falling back:',
    raw.error.message
  );

  const { data, error } = await supabase.rpc('get_traffic_by_source_advance', {
    p_client_id: clientId,
    p_from: from,
    p_to: to,
  });

  if (error) {
    console.error('[traffic-by-source-advance]', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ rows: data ?? [], mapped: false });
}
