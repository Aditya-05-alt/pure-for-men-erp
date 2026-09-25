'use client';

import { useFormStatus } from 'react-dom';
import { useActionState, useState, useCallback, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { signInAction } from '@/lib/auth/actions';
import { INACTIVITY_TIMEOUT_MINUTES } from '@/lib/auth/inactivityTimeout';
import {
  PFM_LOGIN_EMAIL,
  PFM_LOGIN_PASSWORD,
} from '@/lib/auth/pfmHardcoded';
import { resetDealerToAll } from '@/lib/dashboard/dashboardPrefs';

const initialState = { ok: false, error: null };

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button className="pfm-login-btn" type="submit" disabled={pending}>
      {pending ? 'Signing in…' : 'Sign In'}
    </button>
  );
}

export default function LoginForm() {
  const searchParams = useSearchParams();
  const sessionTimedOut = searchParams.get('timeout') === '1';
  const [state, formAction] = useActionState(signInAction, initialState);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);

  useEffect(() => {
    resetDealerToAll();
  }, []);

  const fillDemo = useCallback(() => {
    setEmail(PFM_LOGIN_EMAIL);
    setPassword(PFM_LOGIN_PASSWORD);
  }, []);

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
          <h2 className="pfm-login-panel-title">Sign in</h2>
          <p className="pfm-login-panel-sub">
            Enter your credentials to open the report.
          </p>

          {sessionTimedOut && (
            <div className="pfm-login-alert" role="status">
              Your session ended after {INACTIVITY_TIMEOUT_MINUTES} minutes of
              inactivity. Please sign in again.
            </div>
          )}

          <form action={formAction} noValidate className="pfm-login-form">
            <div className="pfm-login-field">
              <label htmlFor="login-email">Email</label>
              <input
                id="login-email"
                name="email"
                type="email"
                autoComplete="email"
                required
                placeholder="you@pureformen.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            <div className="pfm-login-field">
              <label htmlFor="login-password">Password</label>
              <div className="pfm-login-pw-wrap">
                <input
                  id="login-password"
                  name="password"
                  type={showPw ? 'text' : 'password'}
                  autoComplete="current-password"
                  required
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
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

            <input type="hidden" name="remember" value="on" />

            <div className="pfm-login-error" role="alert">
              {state?.error || ''}
            </div>

            <SubmitButton />
          </form>

          <button type="button" className="pfm-login-hint" onClick={fillDemo}>
            <span className="pfm-login-hint-label">Demo access</span>
            <span className="pfm-login-hint-creds">
              {PFM_LOGIN_EMAIL}
              <span aria-hidden="true"> · </span>
              {PFM_LOGIN_PASSWORD}
            </span>
            <span className="pfm-login-hint-cta">Click to fill</span>
          </button>
        </div>

        <footer className="pfm-login-foot">
          Pure for Men · Internal reporting
        </footer>
      </div>
    </div>
  );
}
