import { NextResponse } from 'next/server';
import { getSuperadminFromCookies } from '@/lib/auth/adminApiAuth';
import { fetchPageViewsViaOverviewRpc } from '@/lib/ga4/aggregatePageDataRows';
import { createAdminDataClient } from '@/lib/supabase/adminDataClient';

export const maxDuration = 60;

async function loadDealers(supabase) {
  const { data, error } = await supabase
    .from('smart_hoot_config')
    .select('id, customer_name, ga4_customer_id')
    .eq('is_active', true)
    .order('customer_name', { ascending: true });

  if (error) throw error;

  return (data || [])
    .filter((r) => r?.customer_name)
    .map((row) => ({
      id: row.id,
      name: row.customer_name || 'Unnamed dealer',
      ga4CustomerId: row.ga4_customer_id
        ? String(row.ga4_customer_id).trim()
        : null,
    }));
}

export async function GET(request) {
  const session = await getSuperadminFromCookies();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const from = searchParams.get('from')?.slice(0, 10);
  const to = searchParams.get('to')?.slice(0, 10);

  if (!from || !to) {
    return NextResponse.json({ error: 'Missing from or to' }, { status: 400 });
  }

  const adminClient = createAdminDataClient();
  if (!adminClient) {
    return NextResponse.json(
      {
        error:
          'Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local.',
      },
      { status: 503 }
    );
  }

  const { supabase, mode } = adminClient;

  try {
    const dealers = await loadDealers(supabase);

    if (dealers.length === 0 && mode === 'anon') {
      return NextResponse.json(
        {
          error:
            'Dealer list is blocked for the anon key (RLS). Add SUPABASE_SERVICE_ROLE_KEY to .env.local (server-only) and restart npm run dev.',
          dealers: [],
          viewsByDealerId: {},
          from,
          to,
          meta: { mode, dealerCount: 0 },
        },
        { status: 503 }
      );
    }

    const { byGa4Client, rpcErrors } = await fetchPageViewsViaOverviewRpc(
      supabase,
      dealers,
      from,
      to
    );

    const viewsByDealerId = {};
    let clientsWithViews = 0;

    for (const dealer of dealers) {
      if (!dealer.ga4CustomerId) {
        viewsByDealerId[dealer.id] = {};
        continue;
      }
      const daily = byGa4Client.get(dealer.ga4CustomerId) || {};
      viewsByDealerId[dealer.id] = daily;
      if (Object.keys(daily).length > 0) clientsWithViews += 1;
    }

    return NextResponse.json({
      dealers,
      viewsByDealerId,
      from,
      to,
      meta: {
        mode,
        dealerCount: dealers.length,
        clientsWithViews,
        rpcErrorCount: rpcErrors.length,
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err?.message || 'Failed to load GA4 matrix' },
      { status: 500 }
    );
  }
}
