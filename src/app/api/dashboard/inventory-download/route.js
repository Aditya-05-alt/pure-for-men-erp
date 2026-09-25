import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import {
  INVENTORY_DOWNLOAD_HEADERS_DATED,
  inventoryRowToCsvLine,
  buildInventoryDownloadFilename,
} from '@/lib/inventory/inventoryDownload';

export const maxDuration = 60;

function supabaseService() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return null;
  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function normalizeClientIds(raw) {
  if (!raw) return [];
  return String(raw)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function mapRpcRow(r) {
  return {
    source: r.source || '',
    dealerName: r.dealer_name || '',
    clientId: r.client_id || '',
    vin: r.vin || '',
    stockNumber: r.stock_number || '',
    year: r.year || '',
    make: r.make || '',
    model: r.model || '',
    trim: r.trim || '',
    condition: r.condition || '',
    type: r.type || '',
    price: r.price ?? '',
    msrp: r.msrp ?? '',
    location: r.location || '',
    url: r.url || '',
    advertiser: r.advertiser || '',
    syncedAt: r.synced_at || '',
    pullDate: r.pull_date || '',
  };
}

function csvResponse(out, { scopeAll, clientIds, source, asOf, hootAsOf, scrapAsOf }) {
  const lines = [
    INVENTORY_DOWNLOAD_HEADERS_DATED.join(','),
    ...out.map((row) => inventoryRowToCsvLine(row, { includePullDate: true })),
  ];
  const csv = `${lines.join('\n')}\n`;
  const filename = buildInventoryDownloadFilename({
    scopeLabel: scopeAll
      ? 'all-dealers-inventory'
      : `inventory-${clientIds.length}-dealers`,
    source,
    from: asOf,
    to: asOf,
  });

  const headers = {
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': `attachment; filename="${filename}"`,
    'Cache-Control': 'no-store',
    'X-Row-Count': String(out.length),
  };
  if (asOf) headers['X-Inventory-As-Of'] = String(asOf).slice(0, 10);
  if (hootAsOf) headers['X-Hoot-As-Of'] = String(hootAsOf).slice(0, 10);
  if (scrapAsOf) headers['X-Scrap-As-Of'] = String(scrapAsOf).slice(0, 10);

  return new NextResponse(csv, { status: 200, headers });
}

/**
 * Daily inventory only (latest pull_date snapshot).
 * No date-range UI — Hoot/Scrap from *_inventory_daily via RPC.
 *
 * Query: scope=all|ids&clientIds=&source=both|hoot|scrap
 */
export async function GET(request) {
  const supabase = supabaseService();
  if (!supabase) {
    return NextResponse.json(
      { error: 'SUPABASE_SERVICE_ROLE_KEY is not configured on the server' },
      { status: 503 }
    );
  }

  const { searchParams } = new URL(request.url);
  const scope = String(searchParams.get('scope') || 'ids').toLowerCase();
  const sourceRaw = String(searchParams.get('source') || 'both').toLowerCase();
  const source =
    sourceRaw === 'hoot' || sourceRaw === 'scrap' ? sourceRaw : 'both';
  const clientIds = normalizeClientIds(searchParams.get('clientIds'));
  const scopeAll = scope === 'all';

  if (!scopeAll && !clientIds.length) {
    return NextResponse.json(
      { error: 'Provide scope=all or clientIds for scope=ids' },
      { status: 400 }
    );
  }

  try {
    // Latest daily snapshot. Wide window = MAX(pull_date) in RPC (no UI date range).
    // Compatible with older RPC that required non-null p_from/p_to.
    const { data, error } = await supabase.rpc('get_inventory_download_advance', {
      p_from: '2000-01-01',
      p_to: '2099-12-31',
      p_source: source,
      p_client_ids: scopeAll ? null : clientIds,
    });

    if (error) {
      const missing =
        /could not find the function|schema cache|does not exist/i.test(
          error.message || ''
        );
      return NextResponse.json(
        {
          error: missing
            ? 'RPC get_inventory_download_advance is not deployed. Run supabase/rpc/get_inventory_download_advance.sql in Supabase.'
            : error.message || 'Inventory download RPC failed',
        },
        { status: missing ? 503 : 500 }
      );
    }

    if (!data?.ok) {
      return NextResponse.json(
        { error: data?.error || 'No daily inventory snapshot found' },
        { status: 404 }
      );
    }

    const rows = Array.isArray(data.rows) ? data.rows.map(mapRpcRow) : [];
    if (!rows.length) {
      return NextResponse.json(
        {
          error: `No inventory rows for latest daily snapshot${
            data.asOf ? ` (${data.asOf})` : ''
          }`,
        },
        { status: 404 }
      );
    }

    return csvResponse(rows, {
      scopeAll,
      clientIds,
      source,
      asOf: data.asOf,
      hootAsOf: data.hootAsOf,
      scrapAsOf: data.scrapAsOf,
    });
  } catch (err) {
    console.error('[inventory-download]', err?.message || err);
    return NextResponse.json(
      { error: err?.message || 'Failed to build inventory download' },
      { status: 500 }
    );
  }
}
