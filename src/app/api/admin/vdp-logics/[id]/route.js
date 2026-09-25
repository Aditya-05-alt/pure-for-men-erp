import { NextResponse } from 'next/server';
import { getSuperadminFromCookies } from '@/lib/auth/adminApiAuth';
import { createAdminDataClient } from '@/lib/supabase/adminDataClient';
import { bodyToDbRecord } from '@/lib/vdpLogics/fields';
import { mapSupabaseError, normalizeRow, TABLE } from '../_shared';

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

  let record;
  try {
    record = bodyToDbRecord(await request.json());
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }

  const { data, error } = await admin.supabase
    .from(TABLE)
    .update(record)
    .eq('id', id)
    .select('*')
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: mapSupabaseError(error) }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: 'Row not found.' }, { status: 404 });
  }

  return NextResponse.json({ row: normalizeRow(data) });
}

export async function DELETE(_request, { params }) {
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

  const { data, error } = await admin.supabase
    .from(TABLE)
    .delete()
    .eq('id', id)
    .select('id')
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: mapSupabaseError(error) }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: 'Row not found.' }, { status: 404 });
  }

  return NextResponse.json({ ok: true, id: data.id });
}
