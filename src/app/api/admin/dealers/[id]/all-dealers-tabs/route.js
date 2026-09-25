import { NextResponse } from 'next/server';
import { getSuperadminFromCookies } from '@/lib/auth/adminApiAuth';
import { createAdminDataClient } from '@/lib/supabase/adminDataClient';
import {
  HOOT_SELECT,
  HOOT_TABLE,
  fetchHootById,
  mapDealerError,
  mergeDealer,
} from '../../_shared';

const TAB_KEYS = {
  vdp: 'show_all_dealers_vdp',
  all: 'show_all_dealers_all',
  srp: 'show_all_dealers_srp',
};

/** Quick toggles — All Dealers portfolio tab visibility (VDP / All / SRP). */
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
  const tab = String(body?.tab || '').trim().toLowerCase();
  const column = TAB_KEYS[tab];
  if (!column) {
    return NextResponse.json(
      { error: 'tab must be one of: vdp, all, srp' },
      { status: 400 }
    );
  }

  const enabled = body?.enabled === true;

  try {
    const existing = await fetchHootById(admin.supabase, id);
    if (!existing) {
      return NextResponse.json({ error: 'Dealer not found.' }, { status: 404 });
    }

    const { data: hootRow, error: hootError } = await admin.supabase
      .from(HOOT_TABLE)
      .update({ [column]: enabled })
      .eq('id', id)
      .select(HOOT_SELECT)
      .single();

    if (hootError) {
      return NextResponse.json({ error: mapDealerError(hootError) }, { status: 500 });
    }

    const row = await mergeDealer(admin.supabase, hootRow);
    return NextResponse.json({ ok: true, row, tab, enabled });
  } catch (err) {
    return NextResponse.json(
      { error: err?.message || 'Failed to update All Dealers tab visibility.' },
      { status: 500 }
    );
  }
}
