'use server';

import { cookies } from 'next/headers';
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
import { recordServerLoginSts } from '@/lib/telemetry/serverLoginSts';

/**
 * Server Actions for auth.
 *
 * Modes (checked in order):
 *   - "pfm-hardcoded" → temporary Pure for Men credentials (until real auth is wired)
 *   - "demo"          → Supabase env vars NOT set
 *   - "live"          → Supabase env vars set
 */

const DEMO_COOKIE = PFM_SESSION_COOKIE;

async function setDemoSessionCookie() {
  const jar = await cookies();
  jar.set(DEMO_COOKIE, '1', {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 8,
  });
}

export async function signInAction(_prevState, formData) {
  const email = String(formData.get('email') || '').trim();
  const password = String(formData.get('password') || '');

  if (!email || !password) {
    return { ok: false, error: 'Please fill in both fields.' };
  }

  // ── PFM HARDCODED (temporary) ──────────────────────────
  if (HARDCODED_LOGIN_ENABLED) {
    if (isPfmHardcodedLogin(email, password)) {
      await setDemoSessionCookie();
      revalidatePath('/', 'layout');
      redirect('/');
    }
    // While hardcoded mode is on, reject other credentials so auth stays simple.
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
    redirect('/');
  }

  // ── LIVE MODE ──────────────────────────────────────────
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return { ok: false, error: error.message };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    await recordServerLoginSts(supabase, {
      user,
      eventType: 'login',
      eventAction: 'password_sign_in',
      pagePath: '/login',
    });
  }

  revalidatePath('/', 'layout');
  redirect('/');
}

export async function signUpAction(_prevState, formData) {
  const name = String(formData.get('name') || '').trim();
  const email = String(formData.get('email') || '').trim();
  const password = String(formData.get('password') || '');

  if (!name || !email || !password) {
    return { ok: false, error: 'Please complete all required fields.' };
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
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: name },
    },
  });

  if (error) {
    return { ok: false, error: error.message };
  }

  return {
    ok: true,
    message: 'Account created. Check your email to verify your address.',
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
        pagePath: '/dashboard',
      });
    }

    await supabase.auth.signOut();
  }
  const jar = await cookies();
  jar.delete(DEMO_COOKIE);
  revalidatePath('/', 'layout');
  redirect('/login');
}
