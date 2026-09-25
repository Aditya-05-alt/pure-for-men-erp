import { NextResponse } from 'next/server';
import { findSuperadmin, SUPERADMIN_COOKIE } from '@/lib/auth/superadmin';

function safeRedirectPath(value, fallback = '/dashboard/admin') {
  const path = String(value || '').trim();
  if (!path.startsWith('/') || path.startsWith('//')) return fallback;
  if (!path.startsWith('/dashboard/admin')) return fallback;
  return path;
}

export async function POST(request) {
  const formData = await request.formData();
  const username = String(formData.get('username') || '').trim();
  const password = String(formData.get('password') || '');
  const redirectTo = safeRedirectPath(formData.get('redirectTo'));

  const account = findSuperadmin(username, password);
  if (!account) {
    const fail = new URL('/admin/login', request.url);
    fail.searchParams.set('error', 'invalid');
    fail.searchParams.set('redirectTo', redirectTo);
    return NextResponse.redirect(fail);
  }

  const response = NextResponse.redirect(new URL(redirectTo, request.url));
  response.cookies.set(SUPERADMIN_COOKIE, account.username.toLowerCase(), {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 60 * 60 * 8,
  });
  return response;
}
