/**
 * Legacy hardcoded Pure for Men login. Off now that Supabase Auth is wired —
 * flip back to true only as an emergency fallback.
 */

export const HARDCODED_LOGIN_ENABLED = false;

export const PFM_LOGIN_EMAIL = 'admin@pureformen.com';
export const PFM_LOGIN_PASSWORD = 'StayReady1!';

/** Same cookie name the middleware already treats as a valid demo session. */
export const PFM_SESSION_COOKIE = 'sa_demo_session';

export function isPfmHardcodedLogin(email, password) {
  if (!HARDCODED_LOGIN_ENABLED) return false;
  return (
    String(email || '').trim().toLowerCase() === PFM_LOGIN_EMAIL &&
    String(password || '') === PFM_LOGIN_PASSWORD
  );
}
