import { NextResponse } from 'next/server';
import { getSuperadminFromCookies } from '@/lib/auth/adminApiAuth';
import { createAdminDataClient } from '@/lib/supabase/adminDataClient';
import { bodyToDbRecord } from '@/lib/vdpLogics/fields';
import {
  loadScrapInventoryByCustomerId,
  scrapStatusForDealerId,
} from '@/lib/vdpLogics/scrapStatus';
import { mapSupabaseError, normalizeRow, TABLE } from './_shared';

const RPC = 'build_vdp_logics';

export async function GET(request) {
  if (!(await getSuperadminFromCookies())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = createAdminDataClient();
  if (!admin) {
    return NextResponse.json({ error: 'Supabase not configured.' }, { status: 503 });
  }

  const { searchParams } = new URL(request.url);
  const dealerName = searchParams.get('dealerName')?.trim() || null;
  const cms = searchParams.get('cms')?.trim() || null;
  const dataSource = searchParams.get('dataSource')?.trim() || null;
  const search = searchParams.get('search')?.trim() || null;

  const { data, error } = await admin.supabase.rpc(RPC, {
    p_dealer_name: dealerName,
    p_cms: cms,
    p_data_source: dataSource,
    p_search: search,
  });

  if (error) {
    const hint = /could not find the function|schema cache/i.test(error.message || '')
      ? ' Deploy supabase/rpc/build_vdp_logics.sql in Supabase SQL editor.'
      : '';
    return NextResponse.json({ error: error.message + hint }, { status: 500 });
  }

  const rawRows = (data || []).map(normalizeRow);
  let scrapCounts = new Map();

  try {
    scrapCounts = await loadScrapInventoryByCustomerId(admin.supabase);
  } catch (err) {
    return NextResponse.json(
      { error: err?.message || 'Failed to load scrap inventory status.' },
      { status: 500 }
    );
  }

  const rows = await Promise.all(
    rawRows.map(async (row) => {
      const { scrapOn, scrapStatus, scrapRowCount } = scrapStatusForDealerId(
        row.dealerId,
        scrapCounts
      );

      const dealerId = String(row.dealerId || '').trim();
      const current = String(row.scrapLink || '').trim().toLowerCase();

      if (row.id && dealerId && current !== scrapStatus) {
        await admin.supabase
          .from(TABLE)
          .update({ scrap_link: scrapStatus })
          .eq('id', row.id);
      }

      return {
        ...row,
        scrapLink: scrapStatus,
        scrapOn,
        scrapStatus,
        scrapRowCount,
      };
    })
  );
  const cmsOptions = [...new Set(rows.map((r) => r.cms).filter(Boolean))].sort();
  const dataSourceOptions = [...new Set(rows.map((r) => r.dataSource).filter(Boolean))].sort();

  return NextResponse.json({
    rows,
    meta: { count: rows.length, source: RPC },
    filters: { cmsOptions, dataSourceOptions },
  });
}

export async function POST(request) {
  if (!(await getSuperadminFromCookies())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
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
    .insert(record)
    .select('*')
    .single();

  if (error) {
    return NextResponse.json({ error: mapSupabaseError(error) }, { status: 500 });
  }

  return NextResponse.json({ row: normalizeRow(data) }, { status: 201 });
}
