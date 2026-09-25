import { headers } from 'next/headers';

function clientIpFromHeaders(headerStore) {
  const forwarded = headerStore.get('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0]?.trim() || null;
  }
  return headerStore.get('x-real-ip') || null;
}

function displayNameFromUser(user) {
  if (!user) return null;
  const meta = user.user_metadata || {};
  return (
    meta.full_name
    || meta.name
    || meta.display_name
    || null
  );
}

/**
 * Insert a login-sts row using the authenticated Supabase server client.
 */
export async function recordServerLoginSts(supabase, {
  user,
  eventType,
  eventAction = null,
  pagePath = null,
  pageUrl = null,
  sessionId = null,
  metadata = null,
  deviceType = null,
  browser = null,
  os = null,
  screenResolution = null,
  viewport = null,
  timezone = null,
  locale = null,
  referrer = null,
} = {}) {
  if (!supabase || !user?.id || !eventType) return;

  const headerStore = await headers();
  const userAgent = headerStore.get('user-agent');

  const row = {
    auth_user_id: user.id,
    user_email: user.email || null,
    user_name: displayNameFromUser(user),
    event_type: eventType,
    event_action: eventAction,
    page_path: pagePath,
    page_url: pageUrl,
    ip_address: clientIpFromHeaders(headerStore),
    user_agent: userAgent,
    device_type: deviceType,
    browser,
    os,
    screen_resolution: screenResolution,
    viewport,
    timezone,
    locale,
    referrer,
    session_id: sessionId,
    metadata: metadata && typeof metadata === 'object' ? metadata : {},
  };

  const { error } = await supabase.from('smart_user_login_sts').insert(row);
  if (error) {
    console.warn('[login-sts] insert failed:', error.message);
  }
}
