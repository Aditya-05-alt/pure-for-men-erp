import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import {
  defaultChannels,
  defaultMappingEntries,
} from '@/lib/sourceMapping/defaults';
import { loadSourceMapping, saveSourceMapping } from '@/lib/sourceMapping/store';

function supabaseService() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const key = serviceKey || anonKey;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Read source mapping — available to all dashboard users. */
export async function GET() {
  const supabase = supabaseService();
  if (!supabase) {
    return NextResponse.json(
      { error: 'Supabase is not configured on the server' },
      { status: 503 }
    );
  }

  const data = await loadSourceMapping(supabase);
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

/** Save source mapping — available to all dashboard users. */
export async function PUT(request) {
  const supabase = supabaseService();
  if (!supabase) {
    return NextResponse.json(
      { error: 'Supabase is not configured on the server' },
      { status: 503 }
    );
  }

  const body = await request.json().catch(() => ({}));
  const reset = Boolean(body.reset);

  try {
    const saved = reset
      ? await saveSourceMapping(supabase, {
          channels: defaultChannels(),
          rules: defaultMappingEntries(),
        })
      : await saveSourceMapping(supabase, {
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
