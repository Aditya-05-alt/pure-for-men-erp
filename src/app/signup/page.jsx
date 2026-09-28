import { Bebas_Neue, DM_Sans } from 'next/font/google';
import AuthLayout from '@/components/auth/AuthLayout';
import SignupForm from '@/components/auth/SignupForm';

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
  title: 'Create account · Pure for Men',
  description: 'Create your Pure for Men analytics account.',
};

export default function SignupPage() {
  return (
    <div className={`${bebas.variable} ${dmSans.variable}`}>
      <AuthLayout>
        <SignupForm />
      </AuthLayout>
    </div>
  );
}
