import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

/**
 * Server-side Supabase client (Server Components, Route Handlers, Server Actions).
 *
 * Next 15+: `cookies()` is async, so this helper is async too.
 *
 * Usage in a Server Component:
 *   const supabase = await createClient();
 *   const { data: { user } } = await supabase.auth.getUser();
 */
export async function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) return null;

  const cookieStore = await cookies();

  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // The `setAll` method can throw when called from a Server Component.
          // It is safe to ignore — middleware will refresh sessions.
        }
      },
    },
  });
}
