import { NextResponse } from 'next/server';
import { getSuperadminFromCookies } from '@/lib/auth/adminApiAuth';
import { createAdminDataClient } from '@/lib/supabase/adminDataClient';
import {
  defaultChannels,
  defaultMappingEntries,
} from '@/lib/sourceMapping/defaults';
import { loadSourceMapping, saveSourceMapping } from '@/lib/sourceMapping/store';

export async function GET() {
  if (!(await getSuperadminFromCookies())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = createAdminDataClient();
  if (!admin) {
    return NextResponse.json({ error: 'Supabase not configured.' }, { status: 503 });
  }

  const data = await loadSourceMapping(admin.supabase);
  return NextResponse.json({
    channels: data.channels,
    mapping: data.mapping,
    rules: data.rules,
    fromDefaults: data.fromDefaults,
    missingTable: data.missingTable,
    warning: data.missingTable
      ? 'Deploy supabase/migrations/source_mapping.sql in Supabase SQL editor to persist mappings.'
      : data.error && data.fromDefaults
        ? data.error
        : null,
  });
}

export async function PUT(request) {
  if (!(await getSuperadminFromCookies())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = createAdminDataClient();
  if (!admin) {
    return NextResponse.json({ error: 'Supabase not configured.' }, { status: 503 });
  }

  const body = await request.json().catch(() => ({}));
  const reset = Boolean(body.reset);

  try {
    if (reset) {
      const saved = await saveSourceMapping(admin.supabase, {
        channels: defaultChannels(),
        rules: defaultMappingEntries(),
      });
      return NextResponse.json({
        channels: saved.channels,
        mapping: saved.mapping,
        rules: saved.rules,
        fromDefaults: saved.fromDefaults,
        missingTable: saved.missingTable,
      });
    }

    const saved = await saveSourceMapping(admin.supabase, {
      channels: body.channels,
      rules: body.rules,
    });
    return NextResponse.json({
      channels: saved.channels,
      mapping: saved.mapping,
      rules: saved.rules,
      fromDefaults: saved.fromDefaults,
      missingTable: saved.missingTable,
      warning: saved.missingTable
        ? 'Deploy supabase/migrations/source_mapping.sql to persist.'
        : null,
    });
  } catch (err) {
    const msg = err?.message || 'Failed to save source mapping';
    const missing = /could not find the table|relation .* does not exist|schema cache/i.test(
      msg
    );
    return NextResponse.json(
      {
        error: msg,
        hint: missing
          ? 'Deploy supabase/migrations/source_mapping.sql in Supabase SQL editor.'
          : undefined,
      },
      { status: 500 }
    );
  }
}
