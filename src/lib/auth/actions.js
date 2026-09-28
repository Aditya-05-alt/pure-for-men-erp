'use server';

import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { isDemoLogin, DEMO_EMAIL } from '@/lib/auth/demo';
import {
  HARDCODED_LOGIN_ENABLED,
  isPfmHardcodedLogin,
  PFM_LOGIN_EMAIL,
  PFM_LOGIN_PASSWORD,
  PFM_SESSION_COOKIE,
} from '@/lib/auth/pfmHardcoded';
import {
  clientContextFromFormData,
  recordServerLoginSts,
} from '@/lib/telemetry/serverLoginSts';

/**
 * Server Actions for auth.
 *
 * Modes (checked in order):
 *   - "pfm-hardcoded" → temporary Pure for Men credentials (HARDCODED_LOGIN_ENABLED)
 *   - "demo"          → Supabase env vars NOT set
 *   - "live"          → Supabase Auth (email + password)
 */

const DEMO_COOKIE = PFM_SESSION_COOKIE;
const MIN_PASSWORD_LENGTH = 8;

async function setDemoSessionCookie() {
  const jar = await cookies();
  jar.set(DEMO_COOKIE, '1', {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 8,
  });
}

/** Only same-site relative paths — never an open redirect. */
function safeRedirectPath(raw) {
  const s = String(raw || '').trim();
  if (!s.startsWith('/') || s.startsWith('//') || s.startsWith('/\\')) return '/';
  if (s.startsWith('/login') || s.startsWith('/signup')) return '/';
  return s;
}

async function requestOrigin() {
  const h = await headers();
  const host = h.get('x-forwarded-host') || h.get('host');
  if (!host) return null;
  const proto =
    h.get('x-forwarded-proto') || (host.startsWith('localhost') ? 'http' : 'https');
  return `${proto}://${host}`;
}

export async function signInAction(_prevState, formData) {
  const email = String(formData.get('email') || '').trim().toLowerCase();
  const password = String(formData.get('password') || '');
  const redirectTo = safeRedirectPath(formData.get('redirectTo'));
  const ctx = clientContextFromFormData(formData);

  if (!email || !password) {
    return { ok: false, error: 'Please fill in both fields.' };
  }

  // ── PFM HARDCODED (temporary) ──────────────────────────
  if (HARDCODED_LOGIN_ENABLED) {
    if (isPfmHardcodedLogin(email, password)) {
      await setDemoSessionCookie();
      revalidatePath('/', 'layout');
      redirect(redirectTo);
    }
    return {
      ok: false,
      error: `Invalid email or password. Use ${PFM_LOGIN_EMAIL} / ${PFM_LOGIN_PASSWORD}`,
    };
  }

  const supabase = await createClient();

  // ── DEMO MODE ──────────────────────────────────────────
  if (!supabase) {
    if (!isDemoLogin(email, password)) {
      return {
        ok: false,
        error: `Demo mode — use ${DEMO_EMAIL} / Demo1234! (or wire up Supabase in .env.local).`,
      };
    }
    await setDemoSessionCookie();
    revalidatePath('/', 'layout');
    redirect(redirectTo);
  }

  // ── LIVE MODE ──────────────────────────────────────────
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error || !data?.user) {
    await recordServerLoginSts(supabase, {
      userEmail: email,
      eventType: 'login_failed',
      eventAction: 'password_sign_in',
      success: false,
      errorMessage: error?.message || 'Unknown sign-in error',
      pagePath: '/login',
      ...ctx,
    });
    const message = /email not confirmed/i.test(error?.message || '')
      ? 'Please confirm your email first — check your inbox for the verification link.'
      : 'Invalid email or password.';
    return { ok: false, error: message };
  }

  await recordServerLoginSts(supabase, {
    user: data.user,
    eventType: 'login',
    eventAction: 'password_sign_in',
    pagePath: '/login',
    ...ctx,
  });

  revalidatePath('/', 'layout');
  redirect(redirectTo);
}

export async function signUpAction(_prevState, formData) {
  const name = String(formData.get('name') || '').trim();
  const email = String(formData.get('email') || '').trim().toLowerCase();
  const password = String(formData.get('password') || '');
  const confirmPassword = String(formData.get('confirmPassword') || '');
  const ctx = clientContextFromFormData(formData);

  if (!name || !email || !password) {
    return { ok: false, error: 'Please complete all required fields.' };
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    return {
      ok: false,
      error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
    };
  }
  if (confirmPassword && confirmPassword !== password) {
    return { ok: false, error: 'Passwords do not match.' };
  }

  const supabase = await createClient();

  // ── DEMO MODE ──────────────────────────────────────────
  if (!supabase) {
    return {
      ok: true,
      message:
        `Demo mode — account is simulated. Sign in with ${DEMO_EMAIL} / Demo1234! to continue.`,
    };
  }

  // ── LIVE MODE ──────────────────────────────────────────
  const origin = await requestOrigin();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: name, app: 'pure_for_men' },
      ...(origin ? { emailRedirectTo: `${origin}/auth/callback` } : {}),
    },
  });

  if (error) {
    await recordServerLoginSts(supabase, {
      userEmail: email,
      userName: name,
      eventType: 'signup_failed',
      eventAction: 'email_password',
      success: false,
      errorMessage: error.message,
      pagePath: '/signup',
      ...ctx,
    });
    return { ok: false, error: error.message };
  }

  // Email confirmation off → Supabase returns a session; sign straight in.
  if (data?.session && data.user) {
    await recordServerLoginSts(supabase, {
      user: data.user,
      eventType: 'signup',
      eventAction: 'email_password',
      pagePath: '/signup',
      ...ctx,
    });
    revalidatePath('/', 'layout');
    redirect('/');
  }

  // Confirmation required → no session yet, so log anonymously.
  await recordServerLoginSts(supabase, {
    userEmail: email,
    userName: name,
    eventType: 'signup',
    eventAction: 'email_password_pending_confirmation',
    pagePath: '/signup',
    metadata: data?.user?.id ? { signup_user_id: data.user.id } : {},
    ...ctx,
  });

  return {
    ok: true,
    message: 'Account created. Check your email to verify your address, then sign in.',
  };
}

export async function signOutAction() {
  const supabase = await createClient();
  if (supabase) {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user) {
      await recordServerLoginSts(supabase, {
        user,
        eventType: 'logout',
        eventAction: 'sign_out',
        pagePath: '/',
      });
    }

    await supabase.auth.signOut();
  }
  const jar = await cookies();
  jar.delete(DEMO_COOKIE);
  revalidatePath('/', 'layout');
  redirect('/login');
}
