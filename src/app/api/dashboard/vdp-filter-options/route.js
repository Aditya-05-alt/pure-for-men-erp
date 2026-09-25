import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { sanitizeVdpLocationOptions } from '@/lib/vdp/locationFilterOptions';

function normalizeFilterOptionsRow(row) {
  const asList = (key) => {
    const raw = row?.[key];
    return Array.isArray(raw) ? raw.filter(Boolean) : [];
  };

  return {
    years: ['All', ...asList('years')],
    makes: ['All', ...asList('makes')],
    models: ['All', ...asList('models')],
    locations: sanitizeVdpLocationOptions(['All', ...asList('locations')]),
    types: ['All', ...asList('types')],
  };
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const clientId = searchParams.get('clientId')?.trim();
  const from = searchParams.get('from')?.slice(0, 10);
  const to = searchParams.get('to')?.slice(0, 10);

  if (!clientId || !from || !to) {
    return NextResponse.json({ error: 'Missing clientId, from, or to' }, { status: 400 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    return NextResponse.json(
      { error: 'SUPABASE_SERVICE_ROLE_KEY is not configured on the server' },
      { status: 503 }
    );
  }

  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    const { data, error } = await supabase.rpc('get_vdp_filter_options', {
      p_client_id: clientId,
      p_from: from,
      p_to: to,
    });

    if (error) throw error;

    const row = Array.isArray(data) ? data[0] : data;
    return NextResponse.json(normalizeFilterOptionsRow(row));
  } catch (err) {
    const message = err?.message || 'Failed to load VDP filter options';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
