import AuthLayout from '@/components/auth/AuthLayout';
import AdminLoginForm from '@/components/auth/AdminLoginForm';
import { getSuperadminSession } from '@/lib/auth/adminActions';
import { redirect } from 'next/navigation';

export const metadata = {
  title: 'Superadmin · SmartAnalytics',
  description: 'Sign in to the protected admin panel.',
};

export default async function AdminLoginPage({ searchParams }) {
  const params = await searchParams;
  const redirectTo =
    typeof params?.redirectTo === 'string' && params.redirectTo.startsWith('/dashboard/admin')
      ? params.redirectTo
      : '/dashboard/admin';

  const session = await getSuperadminSession();
  if (session) redirect(redirectTo);

  const errorMessage =
    params?.error === 'invalid'
      ? 'Invalid email or password. Check credentials in superadmin.js.'
      : null;

  return (
    <AuthLayout>
      <AdminLoginForm redirectTo={redirectTo} errorMessage={errorMessage} />
    </AuthLayout>
  );
}
