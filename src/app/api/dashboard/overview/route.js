import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import {
  RPC_CHUNK_CONCURRENCY,
  RPC_CHUNK_DAYS,
  rpcByDateChunks,
} from '@/lib/api/chunkedRpc';

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

  const chunkOpts = {
    clientId,
    from,
    to,
    chunkDays: RPC_CHUNK_DAYS,
    concurrency: RPC_CHUNK_CONCURRENCY,
  };

  try {
    const rows = await rpcByDateChunks(supabase, 'get_ga4_overview', chunkOpts);

    let userTotalsRows = [];
    try {
      userTotalsRows = await rpcByDateChunks(supabase, 'get_ga4_user_totals', chunkOpts);
    } catch (userErr) {
      console.warn('[overview] get_ga4_user_totals unavailable:', userErr?.message);
    }

    return NextResponse.json({
      rows: rows || [],
      userTotalsRows: userTotalsRows || [],
      meta: { source: 'chunked-rpc', chunkDays: RPC_CHUNK_DAYS },
    });
  } catch (err) {
    const message = err?.message || 'Failed to load overview data';
    const hint = /timeout|canceling statement/i.test(message)
      ? ' Data is loaded in 5-day batches; retry or add indexes on smart_ga4_page_data (report_date, client_id).'
      : '';
    return NextResponse.json({ error: message + hint }, { status: 500 });
  }
}
