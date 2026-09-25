import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import {
  RPC_CHUNK_CONCURRENCY,
  RPC_CHUNK_DAYS,
  rpcByDateChunks,
} from '@/lib/api/chunkedRpc';

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

  try {
    const rows = await rpcByDateChunks(supabase, 'get_all_tab_export', {
      clientId,
      from,
      to,
      chunkDays: RPC_CHUNK_DAYS,
      concurrency: RPC_CHUNK_CONCURRENCY,
    });

    return NextResponse.json({
      rows: rows || [],
      meta: { from, to, clientId, source: 'chunked-rpc' },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err?.message || 'Failed to load All tab export data' },
      { status: 500 }
    );
  }
}
