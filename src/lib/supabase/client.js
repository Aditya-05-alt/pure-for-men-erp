'use client';

import { createBrowserClient } from '@supabase/ssr';

/**
 * Browser-side Supabase client.
 *
 * Usage:
 *   const supabase = createClient();
 *   await supabase.auth.signInWithPassword({ email, password });
 *
 * Make sure NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY
 * are set in `.env.local` (see .env.local.example).
 */
export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    // Soft-warn in dev only so the UI doesn't crash before Supabase is wired up.
    if (typeof window !== 'undefined' && process.env.NODE_ENV !== 'production') {
      // eslint-disable-next-line no-console
      console.warn(
        '[supabase] Missing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY. ' +
          'Auth calls will fail until these are set in .env.local.'
      );
    }
    return null;
  }

  return createBrowserClient(url, anonKey);
}
