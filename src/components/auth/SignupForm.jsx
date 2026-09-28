'use client';

import Link from 'next/link';
import { useFormStatus } from 'react-dom';
import { useActionState, useState } from 'react';
import { signUpAction } from '@/lib/auth/actions';
import ClientContextFields from '@/components/auth/ClientContextFields';

const initialState = { ok: false, error: null, message: null };

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button className="pfm-login-btn" type="submit" disabled={pending}>
      {pending ? 'Creating account…' : 'Create account'}
    </button>
  );
}

export default function SignupForm() {
  const [state, formAction] = useActionState(signUpAction, initialState);
  const [showPw, setShowPw] = useState(false);

  return (
    <div className="pfm-login">
      <div className="pfm-login-atmosphere" aria-hidden="true">
        <div className="pfm-login-glow pfm-login-glow--a" />
        <div className="pfm-login-glow pfm-login-glow--b" />
        <div className="pfm-login-grid" />
      </div>

      <div className="pfm-login-stage">
        <header className="pfm-login-brand">
          <p className="pfm-login-mark">Pure for Men</p>
          <h1 className="pfm-login-title">Stay Ready</h1>
          <p className="pfm-login-tagline">
            Analytics console · Page views &amp; source mapping
          </p>
        </header>

        <div className="pfm-login-panel">
          <h2 className="pfm-login-panel-title">Create account</h2>
          <p className="pfm-login-panel-sub">
            Sign up to access the Pure for Men report.
          </p>

          {state?.ok && state?.message ? (
            <div className="pfm-login-success" role="status">
              {state.message}
            </div>
          ) : (
            <form action={formAction} noValidate className="pfm-login-form">
              <div className="pfm-login-field">
                <label htmlFor="signup-name">Full name</label>
                <input
                  id="signup-name"
                  name="name"
                  autoComplete="name"
                  required
                  placeholder="Alex Kim"
                />
              </div>

              <div className="pfm-login-field">
                <label htmlFor="signup-email">Email</label>
                <input
                  id="signup-email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  placeholder="you@pureformen.com"
                />
              </div>

              <div className="pfm-login-field">
                <label htmlFor="signup-password">Password</label>
                <div className="pfm-login-pw-wrap">
                  <input
                    id="signup-password"
                    name="password"
                    type={showPw ? 'text' : 'password'}
                    autoComplete="new-password"
                    required
                    minLength={8}
                    placeholder="At least 8 characters"
                  />
                  <button
                    type="button"
                    className="pfm-login-pw-toggle"
                    onClick={() => setShowPw((v) => !v)}
                    aria-label={showPw ? 'Hide password' : 'Show password'}
                  >
                    {showPw ? 'Hide' : 'Show'}
                  </button>
                </div>
              </div>

              <div className="pfm-login-field">
                <label htmlFor="signup-confirm">Confirm password</label>
                <input
                  id="signup-confirm"
                  name="confirmPassword"
                  type={showPw ? 'text' : 'password'}
                  autoComplete="new-password"
                  required
                  placeholder="Repeat password"
                />
              </div>

              <ClientContextFields />

              <div className="pfm-login-error" role="alert">
                {state?.error || ''}
              </div>

              <SubmitButton />
            </form>
          )}

          <p className="pfm-login-switch">
            Already have an account? <Link href="/login">Sign in</Link>
          </p>
        </div>

        <footer className="pfm-login-foot">
          Pure for Men · Internal reporting
        </footer>
      </div>
    </div>
  );
}
