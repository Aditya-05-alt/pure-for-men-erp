import { NextResponse } from 'next/server';
import { getSuperadminFromCookies } from '@/lib/auth/adminApiAuth';
import { createAdminDataClient } from '@/lib/supabase/adminDataClient';
import { fetchHootById, mapDealerError } from '../../_shared';

const LOCATIONS_TABLE = 'smart_dealer_locations';

function normalizeLocationName(value) {
  const trimmed = String(value || '').trim();
  return trimmed || null;
}

async function resolveCustomerId(admin, dealerId) {
  const hoot = await fetchHootById(admin.supabase, dealerId);
  if (!hoot) return { error: 'Dealer not found.', status: 404 };
  const customerId = hoot.ga4_customer_id
    ? String(hoot.ga4_customer_id).trim()
    : '';
  if (!customerId) {
    return {
      error: 'Dealer has no GA4 customer ID — save GA4 config first.',
      status: 400,
    };
  }
  return { customerId, hoot };
}

/** List configured locations for a dealer (by GA4 customer_id). */
export async function GET(_request, { params }) {
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

  try {
    const resolved = await resolveCustomerId(admin, id);
    if (resolved.error) {
      return NextResponse.json({ error: resolved.error }, { status: resolved.status });
    }

    const { data, error } = await admin.supabase
      .from(LOCATIONS_TABLE)
      .select('id, customer_id, location_name, created_at, updated_at')
      .eq('customer_id', resolved.customerId)
      .order('location_name', { ascending: true });

    if (error) {
      return NextResponse.json({ error: mapDealerError(error) }, { status: 500 });
    }

    return NextResponse.json({
      customerId: resolved.customerId,
      locations: (data || []).map((row) => ({
        id: row.id,
        locationName: row.location_name,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      })),
    });
  } catch (err) {
    return NextResponse.json(
      { error: err?.message || 'Failed to load dealer locations.' },
      { status: 500 }
    );
  }
}

/** Add one location name for this dealer. */
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
  const locationName = normalizeLocationName(body?.locationName);
  if (!locationName) {
    return NextResponse.json({ error: 'Location name is required.' }, { status: 400 });
  }

  try {
    const resolved = await resolveCustomerId(admin, id);
    if (resolved.error) {
      return NextResponse.json({ error: resolved.error }, { status: resolved.status });
    }

    const { data, error } = await admin.supabase
      .from(LOCATIONS_TABLE)
      .insert({
        customer_id: resolved.customerId,
        location_name: locationName,
        updated_at: new Date().toISOString(),
      })
      .select('id, customer_id, location_name, created_at, updated_at')
      .single();

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json(
          { error: 'This location already exists for this dealer.' },
          { status: 409 }
        );
      }
      return NextResponse.json({ error: mapDealerError(error) }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      location: {
        id: data.id,
        locationName: data.location_name,
        createdAt: data.created_at,
        updatedAt: data.updated_at,
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err?.message || 'Failed to add location.' },
      { status: 500 }
    );
  }
}

/** Remove one location: DELETE ?locationId=123 */
export async function DELETE(request, { params }) {
  if (!(await getSuperadminFromCookies())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const id = Number((await params)?.id);
  if (!Number.isFinite(id) || id < 1) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }

  const { searchParams } = new URL(request.url);
  const locationId = Number(searchParams.get('locationId'));
  if (!Number.isFinite(locationId) || locationId < 1) {
    return NextResponse.json({ error: 'Missing locationId.' }, { status: 400 });
  }

  const admin = createAdminDataClient();
  if (!admin) {
    return NextResponse.json({ error: 'Supabase not configured.' }, { status: 503 });
  }

  try {
    const resolved = await resolveCustomerId(admin, id);
    if (resolved.error) {
      return NextResponse.json({ error: resolved.error }, { status: resolved.status });
    }

    const { data, error } = await admin.supabase
      .from(LOCATIONS_TABLE)
      .delete()
      .eq('id', locationId)
      .eq('customer_id', resolved.customerId)
      .select('id')
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: mapDealerError(error) }, { status: 500 });
    }
    if (!data) {
      return NextResponse.json({ error: 'Location not found.' }, { status: 404 });
    }

    return NextResponse.json({ ok: true, id: locationId });
  } catch (err) {
    return NextResponse.json(
      { error: err?.message || 'Failed to delete location.' },
      { status: 500 }
    );
  }
}
