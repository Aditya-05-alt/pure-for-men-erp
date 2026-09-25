'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import {
  SUPERADMIN_COOKIE,
  findSuperadmin,
  isValidSuperadminSession,
} from '@/lib/auth/superadmin';

function safeRedirectPath(value, fallback = '/dashboard/admin') {
  const path = String(value || '').trim();
  if (!path.startsWith('/') || path.startsWith('//')) return fallback;
  if (!path.startsWith('/dashboard/admin')) return fallback;
  return path;
}

export async function superadminSignInAction(_prevState, formData) {
  const username = String(formData.get('username') || '').trim();
  const password = String(formData.get('password') || '');
  const redirectTo = safeRedirectPath(formData.get('redirectTo'));

  if (!username || !password) {
    return { ok: false, error: 'Enter username and password.' };
  }

  const account = findSuperadmin(username, password);
  if (!account) {
    return { ok: false, error: 'Invalid superadmin credentials.' };
  }

  const jar = await cookies();
  jar.set(SUPERADMIN_COOKIE, account.username.toLowerCase(), {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 60 * 60 * 8,
  });

  revalidatePath('/', 'layout');
  redirect(redirectTo);
}

export async function superadminSignOutAction() {
  const jar = await cookies();
  jar.delete(SUPERADMIN_COOKIE);
  revalidatePath('/', 'layout');
  redirect('/admin/login');
}

export async function getSuperadminSession() {
  const jar = await cookies();
  const value = jar.get(SUPERADMIN_COOKIE)?.value;
  if (!isValidSuperadminSession(value)) return null;
  return { username: value };
}
