import { NextResponse } from 'next/server';
import { getSuperadminFromCookies } from '@/lib/auth/adminApiAuth';
import { createAdminDataClient } from '@/lib/supabase/adminDataClient';
import { GA4_TABLE, HOOT_SELECT, HOOT_TABLE, fetchHootById, mapDealerError, mergeDealer } from '../../_shared';

/** Quick on/off switch — sets is_active on smart_hoot_config + smart_ga4_config.
 *  Off hides the dealer from dashboard pickers (VDP overview dropdown); on restores it. */
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

  const body = await request.json().catch(() => ({}));
  const active = body?.active === true;

  try {
    const existing = await fetchHootById(admin.supabase, id);
    if (!existing) {
      return NextResponse.json({ error: 'Dealer not found.' }, { status: 404 });
    }

    const { data: hootRow, error: hootError } = await admin.supabase
      .from(HOOT_TABLE)
      .update({ is_active: active })
      .eq('id', id)
      .select(HOOT_SELECT)
      .single();

    if (hootError) {
      return NextResponse.json({ error: mapDealerError(hootError) }, { status: 500 });
    }

    const clientId = existing.ga4_customer_id
      ? String(existing.ga4_customer_id).trim()
      : null;
    if (clientId) {
      await admin.supabase
        .from(GA4_TABLE)
        .update({ is_active: active })
        .eq('client_id', clientId);
    }

    const row = await mergeDealer(admin.supabase, hootRow);
    return NextResponse.json({ ok: true, row, active });
  } catch (err) {
    return NextResponse.json(
      { error: err?.message || 'Failed to update dealer status.' },
      { status: 500 }
    );
  }
}
