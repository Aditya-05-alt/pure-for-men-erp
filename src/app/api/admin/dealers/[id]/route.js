import { NextResponse } from 'next/server';
import { getSuperadminFromCookies } from '@/lib/auth/adminApiAuth';
import { createAdminDataClient } from '@/lib/supabase/adminDataClient';
import { bodyToPayload } from '@/lib/dealers/fields';
import {
  GA4_TABLE,
  HOOT_SELECT,
  HOOT_TABLE,
  fetchHootById,
  hasPageDataForClient,
  mapDealerError,
  mergeDealer,
  upsertGa4Config,
} from '../_shared';

export async function PATCH(request, { params }) {
  if (!(await getSuperadminFromCookies())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const id = Number((await params)?.id);
  if (!Number.isFinite(id) || id < 1) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
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
    const existing = await fetchHootById(admin.supabase, id);
    if (!existing) {
      return NextResponse.json({ error: 'Dealer not found.' }, { status: 404 });
    }

    const oldClientId = existing.ga4_customer_id
      ? String(existing.ga4_customer_id).trim()
      : null;

    if (
      oldClientId &&
      oldClientId !== payload.ga4CustomerId &&
      (await hasPageDataForClient(admin.supabase, oldClientId))
    ) {
      return NextResponse.json(
        {
          error:
            'Cannot change GA4 customer ID — page data already exists for the current client_id. Deactivate and add a new dealer instead.',
        },
        { status: 409 }
      );
    }

    await upsertGa4Config(admin.supabase, payload);

    const { data: hootRow, error: hootError } = await admin.supabase
      .from(HOOT_TABLE)
      .update({
        customer_name: payload.customerName,
        hoot_url: payload.hootUrl,
        hoot_id: payload.hootId,
        website_platform: payload.websitePlatform,
        dealer_category: payload.dealerCategory,
        inv_type_raw_key: payload.invTypeRawKey,
        ga4_customer_id: payload.ga4CustomerId,
        is_active: payload.isActive,
      })
      .eq('id', id)
      .select(HOOT_SELECT)
      .single();

    if (hootError) {
      return NextResponse.json({ error: mapDealerError(hootError) }, { status: 500 });
    }

    const row = await mergeDealer(admin.supabase, hootRow);
    return NextResponse.json({ row });
  } catch (err) {
    return NextResponse.json(
      { error: mapDealerError(err) || err?.message || 'Failed to update dealer.' },
      { status: 500 }
    );
  }
}

export async function DELETE(request, { params }) {
  if (!(await getSuperadminFromCookies())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const id = Number((await params)?.id);
  if (!Number.isFinite(id) || id < 1) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }

  const admin = createAdminDataClient();
  if (!admin) {
    return NextResponse.json({ error: 'Supabase not configured.' }, { status: 503 });
  }

  const { searchParams } = new URL(request.url);
  const hard = searchParams.get('hard') === 'true';

  try {
    const existing = await fetchHootById(admin.supabase, id);
    if (!existing) {
      return NextResponse.json({ error: 'Dealer not found.' }, { status: 404 });
    }

    const clientId = existing.ga4_customer_id
      ? String(existing.ga4_customer_id).trim()
      : null;

    if (hard) {
      if (clientId && (await hasPageDataForClient(admin.supabase, clientId))) {
        return NextResponse.json(
          {
            error:
              'Cannot permanently delete — smart_ga4_page_data exists for this dealer. Use Deactivate instead.',
          },
          { status: 409 }
        );
      }

      if (clientId) {
        await admin.supabase.from(GA4_TABLE).delete().eq('client_id', clientId);
      }

      const { error: delError } = await admin.supabase
        .from(HOOT_TABLE)
        .delete()
        .eq('id', id);

      if (delError) {
        return NextResponse.json({ error: mapDealerError(delError) }, { status: 500 });
      }

      return NextResponse.json({ ok: true, id, mode: 'hard' });
    }

    const { data: hootRow, error: hootError } = await admin.supabase
      .from(HOOT_TABLE)
      .update({ is_active: false })
      .eq('id', id)
      .select('id')
      .maybeSingle();

    if (hootError) {
      return NextResponse.json({ error: mapDealerError(hootError) }, { status: 500 });
    }
    if (!hootRow) {
      return NextResponse.json({ error: 'Dealer not found.' }, { status: 404 });
    }

    if (clientId) {
      await admin.supabase
        .from(GA4_TABLE)
        .update({ is_active: false })
        .eq('client_id', clientId);
    }

    return NextResponse.json({ ok: true, id, mode: 'soft' });
  } catch (err) {
    return NextResponse.json(
      { error: err?.message || 'Failed to delete dealer.' },
      { status: 500 }
    );
  }
}
