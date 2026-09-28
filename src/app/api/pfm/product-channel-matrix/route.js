import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { fetchPfmProductChannelMatrixRange } from '@/lib/api/pfmProductOverviewFetch';
import { formatPfmChannelLabel } from '@/lib/pfm/channelLabel';

export const maxDuration = 120;

const DEFAULT_CLIENT_ID = '001';

function supabasePublic() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const key = serviceKey || anonKey;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Pure for Men — product page x channel metrics.
 * Query: from, to, priorFrom?, priorTo?, clientId?
 */
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const from = searchParams.get('from')?.slice(0, 10);
  const to = searchParams.get('to')?.slice(0, 10);
  const priorFrom = searchParams.get('priorFrom')?.slice(0, 10);
  const priorTo = searchParams.get('priorTo')?.slice(0, 10);
  const clientId = searchParams.get('clientId')?.trim() || DEFAULT_CLIENT_ID;

  if (!from || !to) {
    return NextResponse.json({ error: 'Missing from or to' }, { status: 400 });
  }

  const supabase = supabasePublic();
  if (!supabase) {
    return NextResponse.json(
      { error: 'Supabase is not configured on the server' },
      { status: 503 }
    );
  }

  const mapRows = (rows) =>
    rows.map((r) => ({
      pagePath: r.page_path,
      pageTitle: r.page_title || '',
      channel: formatPfmChannelLabel(r.channel_bucket),
      views: r.views,
      totalUsers: r.total_users,
      newUsers: r.new_users,
    }));

  try {
    const [rows, rowsPrior] = await Promise.all([
      fetchPfmProductChannelMatrixRange(supabase, { clientId, from, to }),
      priorFrom && priorTo
        ? fetchPfmProductChannelMatrixRange(supabase, {
            clientId,
            from: priorFrom,
            to: priorTo,
          })
        : Promise.resolve([]),
    ]);
    return NextResponse.json({
      clientId,
      from,
      to,
      priorFrom: priorFrom || null,
      priorTo: priorTo || null,
      rows: mapRows(rows),
      rowsPrior: mapRows(rowsPrior),
    });
  } catch (err) {
    console.error('[pfm/product-channel-matrix]', err?.message || err);
    return NextResponse.json(
      { error: err?.message || 'Failed to load product x channel data' },
      { status: 500 }
    );
  }
}
