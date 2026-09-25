'use client';

import Link from 'next/link';
import { useFormStatus } from 'react-dom';
import { useActionState, useState, useCallback, useMemo, memo } from 'react';
import Input from '@/components/ui/Input';
import Button from '@/components/ui/Button';
import { signUpAction } from '@/lib/auth/actions';

const initialState = { ok: false, error: null, message: null };

const UserIcon = memo(() => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
    <circle cx="12" cy="7" r="4" />
  </svg>
));
UserIcon.displayName = 'UserIcon';

const MailIcon = memo(() => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
    <polyline points="22,6 12,13 2,6" />
  </svg>
));
MailIcon.displayName = 'MailIcon';

const LockIcon = memo(() => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
  </svg>
));
LockIcon.displayName = 'LockIcon';

const GoogleIcon = memo(() => (
  <svg width="16" height="16" viewBox="0 0 24 24">
    <path fill="#4285F4" d="M22.5 12.27c0-.79-.07-1.55-.2-2.27H12v4.3h5.92a5.07 5.07 0 0 1-2.2 3.33v2.77h3.56c2.08-1.92 3.22-4.74 3.22-8.13z" />
    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.56-2.77c-.99.66-2.25 1.05-3.72 1.05-2.86 0-5.28-1.93-6.15-4.52H2.18v2.85A11 11 0 0 0 12 23z" />
    <path fill="#FBBC05" d="M5.85 14.1A6.6 6.6 0 0 1 5.5 12c0-.73.13-1.44.35-2.1V7.05H2.18a11 11 0 0 0 0 9.9l3.67-2.85z" />
    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.05L5.85 9.9C6.72 7.31 9.14 5.38 12 5.38z" />
  </svg>
));
GoogleIcon.displayName = 'GoogleIcon';

/** Cheap, deterministic password strength estimator. */
function scorePassword(p) {
  if (!p) return 0;
  let s = 0;
  if (p.length >= 8) s += 1;
  if (p.length >= 12) s += 1;
  if (/[a-z]/.test(p) && /[A-Z]/.test(p)) s += 1;
  if (/\d/.test(p)) s += 1;
  if (/[^A-Za-z0-9]/.test(p)) s += 1;
  return Math.min(s, 4);
}

const STRENGTH = [
  { label: '—',      color: 'var(--t3)',   width: '0%' },
  { label: 'Weak',   color: 'var(--red)',    width: '25%' },
  { label: 'Fair',   color: 'var(--orange)', width: '50%' },
  { label: 'Good',   color: 'var(--yellow)', width: '75%' },
  { label: 'Strong', color: 'var(--green)',  width: '100%' },
];

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" loading={pending}>
      Create account
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <line x1="5" y1="12" x2="19" y2="12" />
        <polyline points="12 5 19 12 12 19" />
      </svg>
    </Button>
  );
}

export default function SignupForm() {
  const [state, formAction] = useActionState(signUpAction, initialState);
  const [password, setPassword] = useState('');
  const [agreed, setAgreed] = useState(false);

  const onPasswordChange = useCallback((e) => setPassword(e.target.value), []);
  const onAgreedChange = useCallback((e) => setAgreed(e.target.checked), []);

  const score = useMemo(() => scorePassword(password), [password]);
  const meter = STRENGTH[score];

  return (
    <div className="auth-card">
      <header className="mb-6">
        <h2 className="font-display font-bold text-[22px] leading-tight" style={{ color: 'var(--t)' }}>
          Create your account
        </h2>
        <p className="mt-1 text-[13px]" style={{ color: 'var(--t2)' }}>
          Start tracking your dealership performance in minutes.
        </p>
      </header>

      <form action={formAction} className="space-y-3.5" noValidate>
        <Input
          label="Full name"
          name="name"
          autoComplete="name"
          required
          placeholder="Alex Kim"
          icon={<UserIcon />}
        />
        <Input
          label="Work email"
          name="email"
          type="email"
          autoComplete="email"
          required
          placeholder="you@dealership.com"
          icon={<MailIcon />}
        />
        <div>
          <Input
            label="Password"
            name="password"
            autoComplete="new-password"
            required
            placeholder="At least 8 characters"
            icon={<LockIcon />}
            showPasswordToggle
            value={password}
            onChange={onPasswordChange}
          />
          {password && (
            <div className="mt-2 animate-fade-in">
              <div className="strength-bar">
                <div
                  className="strength-fill"
                  style={{ width: meter.width, background: meter.color }}
                />
              </div>
              <div className="mt-1 flex items-center justify-between text-[11px]">
                <span style={{ color: 'var(--t3)' }}>Password strength</span>
                <span style={{ color: meter.color, fontWeight: 600 }}>{meter.label}</span>
              </div>
            </div>
          )}
        </div>

        <label className="flex items-start gap-2.5 pt-1 cursor-pointer select-none">
          <input
            type="checkbox"
            name="terms"
            className="checkbox mt-0.5"
            checked={agreed}
            onChange={onAgreedChange}
            required
          />
          <span className="text-[12px] leading-relaxed" style={{ color: 'var(--t2)' }}>
            I agree to the{' '}
            <Link href="/terms" className="link">Terms of Service</Link> and{' '}
            <Link href="/privacy" className="link">Privacy Policy</Link>.
          </span>
        </label>

        {state?.error && (
          <div
            role="alert"
            className="text-[12px] px-3 py-2 rounded-lg animate-fade-in"
            style={{
              background: 'rgba(255,133,133,.10)',
              border: '1px solid rgba(255,133,133,.30)',
              color: 'var(--red)',
            }}
          >
            {state.error}
          </div>
        )}
        {state?.ok && state?.message && (
          <div
            role="status"
            className="text-[12px] px-3 py-2 rounded-lg animate-fade-in"
            style={{
              background: 'rgba(78,224,156,.10)',
              border: '1px solid rgba(78,224,156,.30)',
              color: 'var(--green)',
            }}
          >
            {state.message}
          </div>
        )}

        <div className="pt-2">
          <SubmitButton />
        </div>
      </form>

      <div className="my-5">
        <div className="soft-divider">or sign up with</div>
      </div>

      <Button variant="ghost" type="button" disabled>
        <GoogleIcon />
        Google
      </Button>

      <p className="mt-6 text-center text-[13px]" style={{ color: 'var(--t2)' }}>
        Already have an account?{' '}
        <Link href="/login" className="link font-semibold">
          Sign in
        </Link>
      </p>
    </div>
  );
}
