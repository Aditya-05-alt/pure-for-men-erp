import { NextResponse } from 'next/server';
import { getSuperadminFromCookies } from '@/lib/auth/adminApiAuth';
import { createAdminDataClient } from '@/lib/supabase/adminDataClient';
import { bodyToPayload } from '@/lib/dealers/fields';
import { resolveSyncGroupForNewDealer } from '@/lib/dealers/syncGroup';
import {
  HOOT_SELECT,
  HOOT_TABLE,
  listDealers,
  mapDealerError,
  mergeDealer,
  upsertGa4Config,
  vdpLogicsAdminUrl,
} from './_shared';

export async function GET(request) {
  if (!(await getSuperadminFromCookies())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = createAdminDataClient();
  if (!admin) {
    return NextResponse.json({ error: 'Supabase not configured.' }, { status: 503 });
  }

  const { searchParams } = new URL(request.url);
  const activeOnly = searchParams.get('activeOnly') === 'true';
  const search = searchParams.get('search')?.trim() || '';

  try {
    const rows = await listDealers(admin.supabase, { activeOnly, search });
    return NextResponse.json({ rows, meta: { count: rows.length } });
  } catch (err) {
    return NextResponse.json(
      { error: err?.message || 'Failed to load dealers.' },
      { status: 500 }
    );
  }
}

export async function POST(request) {
  if (!(await getSuperadminFromCookies())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = createAdminDataClient();
  if (!admin) {
    return NextResponse.json({ error: 'Supabase not configured.' }, { status: 503 });
  }

  let payload;
  try {
    payload = bodyToPayload(await request.json());
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }

  try {
    const syncGroup = await resolveSyncGroupForNewDealer(admin.supabase);
    await upsertGa4Config(admin.supabase, payload, { syncGroup });

    const hootRecord = {
      customer_name: payload.customerName,
      hoot_url: payload.hootUrl,
      hoot_id: payload.hootId,
      website_platform: payload.websitePlatform,
      dealer_category: payload.dealerCategory,
      inv_type_raw_key: payload.invTypeRawKey,
      ga4_customer_id: payload.ga4CustomerId,
      is_active: payload.isActive,
    };

    const { data: hootRow, error: hootError } = await admin.supabase
      .from(HOOT_TABLE)
      .insert(hootRecord)
      .select(HOOT_SELECT)
      .single();

    if (hootError) {
      return NextResponse.json({ error: mapDealerError(hootError) }, { status: 500 });
    }

    const row = await mergeDealer(admin.supabase, hootRow);

    return NextResponse.json(
      {
        row,
        syncGroup,
        vdpLogic: {
          dealerName: payload.customerName,
          vdpLogicsUrl: vdpLogicsAdminUrl(payload.customerName, {
            dealerId: payload.ga4CustomerId,
            cms: payload.websitePlatform,
            hootLink: payload.hootUrl,
          }),
        },
      },
      { status: 201 }
    );
  } catch (err) {
    return NextResponse.json(
      { error: mapDealerError(err) || err?.message || 'Failed to create dealer.' },
      { status: 500 }
    );
  }
}
