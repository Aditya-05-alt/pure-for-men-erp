/**
 * Demo credentials — only active when Supabase env vars are missing.
 *
 * As soon as you set NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_ANON_KEY
 * in `.env.local`, the app switches to real Supabase auth and these are ignored.
 */
export const DEMO_EMAIL = 'demo@smartanalytics.dev';
export const DEMO_PASSWORD = 'Demo1234!';

export function isDemoMode() {
  return (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}

export function isDemoLogin(email, password) {
  return (
    email.trim().toLowerCase() === DEMO_EMAIL && password === DEMO_PASSWORD
  );
}
