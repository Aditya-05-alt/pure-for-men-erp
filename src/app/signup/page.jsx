import AuthLayout from '@/components/auth/AuthLayout';
import SignupForm from '@/components/auth/SignupForm';

export const metadata = {
  title: 'Create account · SmartAnalytics',
  description: 'Create your SmartAnalytics account.',
};

export default function SignupPage() {
  return (
    <AuthLayout>
      <SignupForm />
    </AuthLayout>
  );
}
