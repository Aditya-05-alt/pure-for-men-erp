/**
 * Hardcoded superadmin accounts for /dashboard/admin.
 * Login at /admin/login — change before production deploy.
 */
export const SUPERADMIN_COOKIE = 'sa_superadmin_session';

export const SUPERADMINS = [
  {
    username: 'superadmin@smartanalytics.dev',
    password: 'SmartAdmin2026!',
    label: 'Super Admin 1',
  },
  {
    username: 'admin@smartanalytics.dev',
    password: 'SmartAdmin2026#',
    label: 'Super Admin 2',
  },
];

export function findSuperadmin(username, password) {
  const user = String(username || '').trim().toLowerCase();
  const pass = String(password || '');
  if (!user || !pass) return null;

  return (
    SUPERADMINS.find(
      (account) =>
        account.username.toLowerCase() === user && account.password === pass
    ) ?? null
  );
}

export function isValidSuperadminSession(value) {
  if (!value) return false;
  const name = String(value).trim().toLowerCase();
  return SUPERADMINS.some((account) => account.username.toLowerCase() === name);
}

export function superadminLabel(username) {
  const name = String(username || '').trim().toLowerCase();
  const account = SUPERADMINS.find((a) => a.username.toLowerCase() === name);
  return account?.label ?? username;
}
