import { headers } from 'next/headers';
import { parseBrowser, parseDeviceType, parseOs } from '@/lib/telemetry/userAgent';

const ACTIVITY_TABLE = 'pfm_user_activity';

function clientIpFromHeaders(headerStore) {
  const forwarded = headerStore.get('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0]?.trim() || null;
  }
  return (
    headerStore.get('x-real-ip')
    || headerStore.get('cf-connecting-ip')
    || null
  );
}

function decodeHeader(value) {
  if (!value) return null;
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
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

function clip(value, max) {
  if (value == null || value === '') return null;
  return String(value).slice(0, max);
}

/** Browser-only context posted from forms / the client tracker. */
export function clientContextFromFormData(formData) {
  const get = (key) => clip(formData?.get?.(key), 2048);
  return {
    sessionId: get('session_id'),
    screenResolution: get('screen_resolution'),
    viewport: get('viewport'),
    timezone: get('timezone'),
    locale: get('locale'),
    referrer: get('referrer'),
    pageUrl: get('page_url'),
  };
}

/**
 * Insert a pfm_user_activity row. Pass `user` for signed-in events; for
 * anonymous events (failed login, unconfirmed signup) pass `userEmail` instead.
 * Never throws — logging must not break auth.
 */
export async function recordServerLoginSts(supabase, {
  user = null,
  userEmail = null,
  userName = null,
  eventType,
  eventAction = null,
  success = true,
  errorMessage = null,
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
  if (!supabase || !eventType) return;

  try {
    const headerStore = await headers();
    const userAgent = headerStore.get('user-agent');
    const parsedBrowser = parseBrowser(userAgent);
    const parsedOs = parseOs(userAgent);

    const row = {
      auth_user_id: user?.id || null,
      user_email: clip(user?.email || userEmail, 320),
      user_name: clip(displayNameFromUser(user) || userName, 256),
      event_type: eventType,
      event_action: clip(eventAction, 256),
      success,
      error_message: clip(errorMessage, 1024),
      ip_address: clientIpFromHeaders(headerStore),
      forwarded_for: clip(headerStore.get('x-forwarded-for'), 512),
      country: decodeHeader(
        headerStore.get('x-vercel-ip-country') || headerStore.get('cf-ipcountry')
      ),
      region: decodeHeader(headerStore.get('x-vercel-ip-country-region')),
      city: decodeHeader(headerStore.get('x-vercel-ip-city')),
      user_agent: clip(userAgent, 1024),
      browser: browser || parsedBrowser.name,
      browser_version: parsedBrowser.version,
      os: os || parsedOs.name,
      os_version: parsedOs.version,
      device_type: deviceType || parseDeviceType(userAgent),
      screen_resolution: screenResolution,
      viewport,
      timezone,
      locale,
      accept_language: clip(headerStore.get('accept-language'), 256),
      referrer: referrer || clip(headerStore.get('referer'), 2048),
      page_path: pagePath,
      page_url: pageUrl,
      session_id: sessionId,
      metadata: metadata && typeof metadata === 'object' ? metadata : {},
    };

    const { error } = await supabase.from(ACTIVITY_TABLE).insert(row);
    if (error) {
      console.warn('[pfm-activity] insert failed:', error.message);
    }
  } catch (err) {
    console.warn('[pfm-activity] insert failed:', err?.message || err);
  }
}
