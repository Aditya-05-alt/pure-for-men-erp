import { Suspense } from 'react';
import { Bebas_Neue, DM_Sans } from 'next/font/google';
import AuthLayout from '@/components/auth/AuthLayout';
import LoginForm from '@/components/auth/LoginForm';

const bebas = Bebas_Neue({
  weight: '400',
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-pfm-display',
});

const dmSans = DM_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
  variable: '--font-pfm-ui',
});

export const metadata = {
  title: 'Sign in · Pure for Men',
  description: 'Sign in to Pure for Men analytics.',
};

export default function LoginPage() {
  return (
    <div className={`${bebas.variable} ${dmSans.variable}`}>
      <AuthLayout>
        <Suspense fallback={null}>
          <LoginForm />
        </Suspense>
      </AuthLayout>
    </div>
  );
}
