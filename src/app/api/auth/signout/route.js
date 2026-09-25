import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { recordServerLoginSts } from '@/lib/telemetry/serverLoginSts';

const DEMO_COOKIE = 'sa_demo_session';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const reason = searchParams.get('reason');
  const redirectUrl = new URL('/login', request.url);
  if (reason === 'inactivity') {
    redirectUrl.searchParams.set('timeout', '1');
  }
  const response = NextResponse.redirect(redirectUrl);

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const cookieStore = await cookies();

  if (url && anonKey) {
    const supabase = createServerClient(url, anonKey, {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
        },
      },
    });

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user) {
      await recordServerLoginSts(supabase, {
        user,
        eventType: 'logout',
        eventAction: reason === 'inactivity' ? 'inactivity_timeout' : 'sign_out_redirect',
        pagePath: '/dashboard',
        metadata: reason === 'inactivity' ? { reason: 'inactivity_timeout_45m' } : {},
      });
    }

    await supabase.auth.signOut();
  }

  response.cookies.delete(DEMO_COOKIE);

  return response;
}
