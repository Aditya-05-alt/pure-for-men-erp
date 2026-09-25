import { NextResponse } from 'next/server';
import { getSuperadminFromCookies } from '@/lib/auth/adminApiAuth';
import { createAdminDataClient } from '@/lib/supabase/adminDataClient';
import { csvRowToDbRecord, parseCsv } from '@/lib/vdpLogics/fields';
import { mapSupabaseError, TABLE } from '../_shared';

const CHUNK = 50;
const UPSERT_CONFLICT = 'dealer_name,website_url';

export async function POST(request) {
  if (!(await getSuperadminFromCookies())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = createAdminDataClient();
  if (!admin) {
    return NextResponse.json({ error: 'Supabase not configured.' }, { status: 503 });
  }

  let csvText = '';
  const contentType = request.headers.get('content-type') || '';

  if (contentType.includes('multipart/form-data')) {
    const form = await request.formData();
    const file = form.get('file');
    if (!file || typeof file.text !== 'function') {
      return NextResponse.json({ error: 'Missing CSV file.' }, { status: 400 });
    }
    csvText = await file.text();
  } else {
    const body = await request.json().catch(() => ({}));
    csvText = body.csv ?? body.text ?? '';
  }

  if (!String(csvText).trim()) {
    return NextResponse.json({ error: 'Empty CSV.' }, { status: 400 });
  }

  let rawRows;
  try {
    rawRows = parseCsv(csvText);
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }

  const records = [];
  const rowErrors = [];

  rawRows.forEach((raw, index) => {
    try {
      records.push(csvRowToDbRecord(raw));
    } catch (e) {
      rowErrors.push({ line: index + 2, message: e.message });
    }
  });

  if (!records.length) {
    return NextResponse.json(
      { error: 'No valid rows to import.', rowErrors },
      { status: 400 }
    );
  }

  let inserted = 0;
  const errors = [...rowErrors];

  for (let i = 0; i < records.length; i += CHUNK) {
    const chunk = records.slice(i, i + CHUNK);
    const { data, error } = await admin.supabase
      .from(TABLE)
      .upsert(chunk, { onConflict: UPSERT_CONFLICT })
      .select('id');

    if (error) {
      errors.push({ line: i + 2, message: mapSupabaseError(error) });
      continue;
    }
    inserted += data?.length ?? chunk.length;
  }

  return NextResponse.json({
    ok: errors.length === 0,
    imported: inserted,
    total: records.length,
    rowErrors: errors,
  });
}
