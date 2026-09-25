import { cookies } from 'next/headers';
import { isValidSuperadminSession, SUPERADMIN_COOKIE } from '@/lib/auth/superadmin';

export async function getSuperadminFromCookies() {
  const jar = await cookies();
  const value = jar.get(SUPERADMIN_COOKIE)?.value;
  if (!isValidSuperadminSession(value)) return null;
  return String(value).trim().toLowerCase();
}
