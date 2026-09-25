'use client';

import Link from 'next/link';
import Input from '@/components/ui/Input';
import Button from '@/components/ui/Button';

export default function AdminLoginForm({
  redirectTo = '/dashboard/admin',
  errorMessage = null,
}) {
  return (
    <div className="auth-card">
      <header className="mb-6">
        <h2 className="font-display font-bold text-[22px] leading-tight" style={{ color: 'var(--t)' }}>
          Superadmin access
        </h2>
        <p className="mt-1 text-[13px]" style={{ color: 'var(--t2)' }}>
          Admin panel only — no dealer dashboard login required.
        </p>
      </header>

      <form action="/api/admin/login" method="POST" className="flex flex-col gap-4">
        <input type="hidden" name="redirectTo" value={redirectTo} />

        <Input
          label="Email"
          name="username"
          type="email"
          autoComplete="username"
          required
        />

        <Input
          label="Password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
        />

        {errorMessage && (
          <p className="text-[13px] animate-fade-in" style={{ color: 'var(--red)' }} role="alert">
            {errorMessage}
          </p>
        )}

        <Button type="submit">Sign in as Superadmin</Button>
      </form>

      <p className="mt-4 text-[12px] leading-relaxed" style={{ color: 'var(--t3)' }}>
        Use <strong style={{ color: 'var(--t2)' }}>superadmin@smartanalytics.dev</strong> or{' '}
        <strong style={{ color: 'var(--t2)' }}>admin@smartanalytics.dev</strong> with the passwords
        set in <code>src/lib/auth/superadmin.js</code>.
      </p>

      <p className="mt-5 text-center text-[12px]" style={{ color: 'var(--t3)' }}>
        <Link href="/login" className="hover:underline" style={{ color: 'var(--t2)' }}>
          Dealer dashboard login →
        </Link>
      </p>
    </div>
  );
}
