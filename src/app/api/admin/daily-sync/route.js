import { NextResponse } from 'next/server';
import { getSuperadminFromCookies } from '@/lib/auth/adminApiAuth';
import { loadDailySyncMatrix } from '@/lib/pipeline/dailySyncStatus';
import { createAdminDataClient } from '@/lib/supabase/adminDataClient';

const MAX_RANGE_DAYS = 90;

const HOOT_SELECT = 'id, customer_name, ga4_customer_id';

export async function GET(request) {
  if (!(await getSuperadminFromCookies())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const fromRaw = searchParams.get('from');
  const toRaw = searchParams.get('to');

  if (!fromRaw || !toRaw) {
    return NextResponse.json({ error: 'Missing from or to' }, { status: 400 });
  }

  const admin = createAdminDataClient();
  if (!admin) {
    return NextResponse.json({ error: 'Supabase not configured.' }, { status: 503 });
  }

  const { supabase } = admin;

  try {
    const { data: dealerRows, error: dealerErr } = await supabase
      .from('smart_hoot_config')
      .select(HOOT_SELECT)
      .eq('is_active', true)
      .order('customer_name', { ascending: true });

    if (dealerErr) {
      return NextResponse.json({ error: dealerErr.message }, { status: 500 });
    }

    const dealers = (dealerRows || [])
      .filter((r) => r?.customer_name)
      .map((row) => ({
        id: row.id,
        name: row.customer_name || 'Unnamed',
        ga4CustomerId: row.ga4_customer_id
          ? String(row.ga4_customer_id).trim()
          : null,
      }));

    const matrix = await loadDailySyncMatrix(supabase, dealers, fromRaw, toRaw);

    if (matrix.rangeDays.length > MAX_RANGE_DAYS) {
      return NextResponse.json(
        {
          error: `Date range is ${matrix.rangeDays.length} days. Maximum ${MAX_RANGE_DAYS} days.`,
        },
        { status: 400 }
      );
    }

    return NextResponse.json({
      from: matrix.from,
      to: matrix.to,
      rangeDays: matrix.rangeDays,
      dealers: matrix.rows,
      meta: {
        dealerCount: matrix.rows.length,
        mode: admin.mode,
      },
    });
  } catch (err) {
    const msg = err?.message || 'Failed to load daily sync status';
    if (/smart_ga4_day_complete|schema cache|Could not find/i.test(msg)) {
      return NextResponse.json(
        {
          error:
            'Table smart_ga4_day_complete is missing. Deploy the GA4 page sync edge function that writes completion markers.',
        },
        { status: 503 }
      );
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
