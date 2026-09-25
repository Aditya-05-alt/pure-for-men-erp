const SESSION_KEY = 'sa_login_sts_session_id';

function randomId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `sess_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}

/** Stable id per browser tab session (cleared when tab closes). */
export function getLoginStsSessionId() {
  if (typeof window === 'undefined') return null;
  try {
    let id = sessionStorage.getItem(SESSION_KEY);
    if (!id) {
      id = randomId();
      sessionStorage.setItem(SESSION_KEY, id);
    }
    return id;
  } catch {
    return randomId();
  }
}

function deviceTypeFromUa(ua) {
  const s = String(ua || '').toLowerCase();
  if (/ipad|tablet|playbook|silk|(android(?!.*mobile))/i.test(s)) return 'tablet';
  if (/mobile|iphone|ipod|android|blackberry|iemobile|opera mini/i.test(s)) return 'mobile';
  return 'desktop';
}

function parseBrowser(ua) {
  const s = String(ua || '');
  if (/Edg\//i.test(s)) return 'Edge';
  if (/Chrome\//i.test(s) && !/Chromium/i.test(s)) return 'Chrome';
  if (/Safari\//i.test(s) && !/Chrome/i.test(s)) return 'Safari';
  if (/Firefox\//i.test(s)) return 'Firefox';
  return 'Other';
}

function parseOs(ua) {
  const s = String(ua || '');
  if (/Windows/i.test(s)) return 'Windows';
  if (/Mac OS X|Macintosh/i.test(s)) return 'macOS';
  if (/Android/i.test(s)) return 'Android';
  if (/iPhone|iPad|iPod/i.test(s)) return 'iOS';
  if (/Linux/i.test(s)) return 'Linux';
  return 'Other';
}

/** Client-side context sent with each telemetry event. */
export function collectClientTelemetry(extra = {}) {
  if (typeof window === 'undefined') return { ...extra };

  const ua = navigator.userAgent || '';
  const screenRes = typeof screen !== 'undefined'
    ? `${screen.width}x${screen.height}`
    : null;
  const viewport = `${window.innerWidth}x${window.innerHeight}`;

  let timezone = null;
  let locale = null;
  try {
    timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    locale = navigator.language;
  } catch {
    /* ignore */
  }

  return {
    session_id: getLoginStsSessionId(),
    page_path: window.location.pathname,
    page_url: window.location.href,
    referrer: document.referrer || null,
    screen_resolution: screenRes,
    viewport,
    timezone,
    locale,
    device_type: deviceTypeFromUa(ua),
    browser: parseBrowser(ua),
    os: parseOs(ua),
    ...extra,
  };
}
