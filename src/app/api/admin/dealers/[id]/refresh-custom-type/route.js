import { NextResponse } from 'next/server';
import { getSuperadminFromCookies } from '@/lib/auth/adminApiAuth';
import { createAdminDataClient } from '@/lib/supabase/adminDataClient';
import { normalizeInvTypeRawKey } from '@/lib/dealers/fields';
import {
  HOOT_SELECT,
  HOOT_TABLE,
  fetchHootById,
  mapDealerError,
  mergeDealer,
} from '../../_shared';

export const maxDuration = 60;

/** Same as type-refresh UI — 1 day per request to avoid statement timeout. */
const MAX_CHUNK_DAYS = 1;

function toDateOnly(value) {
  if (!value) return null;
  const s = String(value).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

function addDays(isoDate, days) {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function daysBetween(from, to) {
  const a = new Date(`${from}T00:00:00Z`);
  const b = new Date(`${to}T00:00:00Z`);
  return Math.round((b - a) / 86400000);
}

/**
 * Save inv_type_raw_key (optional) then backfill ONE date chunk for this dealer.
 * Client should loop chunks (default 7 days) with from/to to avoid upstream timeouts.
 *
 * Body: { invTypeRawKey?, from, to, saveKey?: boolean }
 */
export async function POST(request, { params }) {
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
  const from = toDateOnly(body?.from);
  const to = toDateOnly(body?.to);
  const saveKey = body?.saveKey !== false;
  const rawKeyFromBody =
    body?.invTypeRawKey !== undefined
      ? normalizeInvTypeRawKey(body.invTypeRawKey)
      : undefined;

  const logs = [];
  const pushLog = (line) => {
    logs.push(`[${new Date().toISOString()}] ${line}`);
  };

  if (!from || !to) {
    return NextResponse.json(
      { error: 'Date range required: provide from and to (YYYY-MM-DD).', logs },
      { status: 400 }
    );
  }
  if (from > to) {
    return NextResponse.json(
      { error: `Invalid date range: ${from} .. ${to}`, logs },
      { status: 400 }
    );
  }

  const spanDays = daysBetween(from, to) + 1;
  if (spanDays > MAX_CHUNK_DAYS) {
    return NextResponse.json(
      {
        error: `Chunk too large (${spanDays} days). Max ${MAX_CHUNK_DAYS} days per request — use client chunking.`,
        logs,
      },
      { status: 400 }
    );
  }

  try {
    pushLog(`Starting refresh chunk ${from} → ${to} (${spanDays} day(s))`);

    const existing = await fetchHootById(admin.supabase, id);
    if (!existing) {
      return NextResponse.json({ error: 'Dealer not found.', logs }, { status: 404 });
    }

    const clientId = existing.ga4_customer_id
      ? String(existing.ga4_customer_id).trim()
      : '';
    if (!clientId) {
      return NextResponse.json(
        { error: 'Dealer has no GA4 customer ID — cannot refresh types.', logs },
        { status: 400 }
      );
    }

    let hootRow = existing;
    const nextKey =
      rawKeyFromBody !== undefined
        ? rawKeyFromBody
        : normalizeInvTypeRawKey(existing.inv_type_raw_key);

    if (saveKey && rawKeyFromBody !== undefined) {
      pushLog(`Saving inv_type_raw_key = "${nextKey || ''}"`);
      const { data, error: saveError } = await admin.supabase
        .from(HOOT_TABLE)
        .update({ inv_type_raw_key: nextKey })
        .eq('id', id)
        .select(HOOT_SELECT)
        .single();

      if (saveError) {
        pushLog(`Save key failed: ${saveError.message}`);
        return NextResponse.json(
          { error: mapDealerError(saveError), logs },
          { status: 500 }
        );
      }
      hootRow = data;
      pushLog('Key saved on smart_hoot_config');
    }

    if (!nextKey) {
      pushLog('Missing raw_data key — abort');
      return NextResponse.json(
        {
          error:
            'Set Custom type raw_data key first (exact key from smart_hoot_inventory.raw_data).',
          logs,
        },
        { status: 400 }
      );
    }

    pushLog(
      `RPC backfill_inv_custom_type(client=${clientId}, key="${nextKey}", ${from}..${to})`
    );

    const { data: rpcData, error: rpcError } = await admin.supabase.rpc(
      'backfill_inv_custom_type',
      {
        p_client_id: clientId,
        p_date_from: from,
        p_date_to: to,
      }
    );

    if (rpcError) {
      pushLog(`RPC error: ${rpcError.message}`);
      return NextResponse.json(
        {
          error: rpcError.message || 'Failed to refresh inv_custom_type.',
          logs,
        },
        { status: 500 }
      );
    }

    const rpcRow = Array.isArray(rpcData) ? rpcData[0] : rpcData;
    const updatedRows = Number(rpcRow?.updated_rows ?? 0) || 0;
    const linksUpdated = Number(rpcRow?.links_updated ?? 0) || 0;
    pushLog(
      `Chunk done: updated_rows=${updatedRows.toLocaleString()}, links_updated=${linksUpdated.toLocaleString()}`
    );

    const row = await mergeDealer(admin.supabase, hootRow);
    const message =
      linksUpdated > 0
        ? `For ${linksUpdated.toLocaleString()} of links I have updated the types (${from} → ${to}).`
        : updatedRows > 0
          ? `Updated ${updatedRows.toLocaleString()} row(s) for ${from} → ${to}.`
          : `No types updated for ${from} → ${to} (already filled or no raw_data match).`;

    pushLog(message);

    return NextResponse.json({
      ok: true,
      from,
      to,
      chunkDays: spanDays,
      updatedRows,
      linksUpdated,
      invTypeRawKey: nextKey,
      row,
      message,
      logs,
    });
  } catch (err) {
    pushLog(`Fatal: ${err?.message || 'unknown error'}`);
    return NextResponse.json(
      { error: err?.message || 'Failed to refresh custom types.', logs },
      { status: 500 }
    );
  }
}
