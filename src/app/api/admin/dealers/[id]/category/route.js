import { NextResponse } from 'next/server';
import { getSuperadminFromCookies } from '@/lib/auth/adminApiAuth';
import { createAdminDataClient } from '@/lib/supabase/adminDataClient';
import { normalizeDealerCategory } from '@/lib/dealers/fields';
import {
  HOOT_SELECT,
  HOOT_TABLE,
  fetchHootById,
  mapDealerError,
  mergeDealer,
} from '../../_shared';

/** Quick category update — saves on dropdown change (no full dealer form). */
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
  const raw = String(body?.dealerCategory ?? '').trim();
  let dealerCategory = null;
  if (raw) {
    dealerCategory = normalizeDealerCategory(raw);
    if (!dealerCategory) {
      return NextResponse.json({ error: 'Invalid dealer category.' }, { status: 400 });
    }
  }

  try {
    const existing = await fetchHootById(admin.supabase, id);
    if (!existing) {
      return NextResponse.json({ error: 'Dealer not found.' }, { status: 404 });
    }

    const { data: hootRow, error: hootError } = await admin.supabase
      .from(HOOT_TABLE)
      .update({ dealer_category: dealerCategory })
      .eq('id', id)
      .select(HOOT_SELECT)
      .single();

    if (hootError) {
      return NextResponse.json({ error: mapDealerError(hootError) }, { status: 500 });
    }

    const row = await mergeDealer(admin.supabase, hootRow);
    return NextResponse.json({ ok: true, row });
  } catch (err) {
    return NextResponse.json(
      { error: err?.message || 'Failed to update dealer category.' },
      { status: 500 }
    );
  }
}
