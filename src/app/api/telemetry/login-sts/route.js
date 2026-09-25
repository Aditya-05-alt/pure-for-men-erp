import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { recordServerLoginSts } from '@/lib/telemetry/serverLoginSts';

const DEMO_COOKIE = 'sa_demo_session';
const ALLOWED_EVENTS = new Set([
  'login',
  'logout',
  'page_view',
  'session_start',
  'session_heartbeat',
  'action',
]);

export async function POST(request) {
  const cookieStore = await cookies();
  if (cookieStore.get(DEMO_COOKIE)) {
    return NextResponse.json({ ok: true, skipped: 'demo' });
  }

  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const eventType = String(body.event_type || '').trim();
  if (!ALLOWED_EVENTS.has(eventType)) {
    return NextResponse.json({ error: 'Invalid event_type' }, { status: 400 });
  }

  const pagePath = String(body.page_path || '').trim() || null;
  if (pagePath.startsWith('/dashboard/admin')) {
    return NextResponse.json({ ok: true, skipped: 'admin' });
  }

  await recordServerLoginSts(supabase, {
    user,
    eventType,
    eventAction: body.event_action ? String(body.event_action).slice(0, 256) : null,
    pagePath,
    pageUrl: body.page_url ? String(body.page_url).slice(0, 2048) : null,
    sessionId: body.session_id ? String(body.session_id).slice(0, 128) : null,
    deviceType: body.device_type ? String(body.device_type).slice(0, 32) : null,
    browser: body.browser ? String(body.browser).slice(0, 64) : null,
    os: body.os ? String(body.os).slice(0, 64) : null,
    screenResolution: body.screen_resolution
      ? String(body.screen_resolution).slice(0, 32)
      : null,
    viewport: body.viewport ? String(body.viewport).slice(0, 32) : null,
    timezone: body.timezone ? String(body.timezone).slice(0, 64) : null,
    locale: body.locale ? String(body.locale).slice(0, 32) : null,
    referrer: body.referrer ? String(body.referrer).slice(0, 2048) : null,
    metadata: body.metadata && typeof body.metadata === 'object' ? body.metadata : {},
  });

  return NextResponse.json({ ok: true });
}
