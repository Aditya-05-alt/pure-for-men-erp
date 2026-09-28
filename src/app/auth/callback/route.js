import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { recordServerLoginSts } from '@/lib/telemetry/serverLoginSts';

/**
 * Email-confirmation landing: exchanges the Supabase code (PKCE) or token hash
 * for a session, logs the confirmation, then sends the user into the app.
 */
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const tokenHash = searchParams.get('token_hash');
  const type = searchParams.get('type');

  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  let user = null;
  let errorMessage = null;

  if (code) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    user = data?.user || null;
    errorMessage = error?.message || null;
  } else if (tokenHash && type) {
    const { data, error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type,
    });
    user = data?.user || null;
    errorMessage = error?.message || null;
  } else {
    errorMessage = 'Missing confirmation code';
  }

  if (!user) {
    await recordServerLoginSts(supabase, {
      eventType: 'email_confirm_failed',
      success: false,
      errorMessage,
      pagePath: '/auth/callback',
    });
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('confirm', 'failed');
    return NextResponse.redirect(loginUrl);
  }

  await recordServerLoginSts(supabase, {
    user,
    eventType: 'email_confirmed',
    eventAction: type || 'signup',
    pagePath: '/auth/callback',
  });

  return NextResponse.redirect(new URL('/', request.url));
}
