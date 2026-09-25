'use client';

import { useEffect, useRef, useCallback } from 'react';
import { usePathname } from 'next/navigation';
import { INACTIVITY_TIMEOUT_MS } from '@/lib/auth/inactivityTimeout';

const ACTIVITY_EVENTS = [
  'mousedown',
  'keydown',
  'scroll',
  'touchstart',
  'click',
  'wheel',
];

const CHECK_INTERVAL_MS = 30_000;

/**
 * Signs out dealer users after 45 minutes without interaction.
 * Not applied on /dashboard/admin (superadmin uses fixed cookie expiry).
 */
export default function InactivityTimeout() {
  const pathname = usePathname();
  const lastActivityRef = useRef(Date.now());
  const signingOutRef = useRef(false);

  const signOutForInactivity = useCallback(() => {
    if (signingOutRef.current) return;
    signingOutRef.current = true;
    const next = `/api/auth/signout?reason=inactivity&redirectTo=${encodeURIComponent('/login')}`;
    window.location.assign(next);
  }, []);

  useEffect(() => {
    if (pathname?.startsWith('/dashboard/admin')) return undefined;

    lastActivityRef.current = Date.now();

    const bumpActivity = () => {
      lastActivityRef.current = Date.now();
    };

    const checkIdle = () => {
      if (Date.now() - lastActivityRef.current >= INACTIVITY_TIMEOUT_MS) {
        signOutForInactivity();
      }
    };

    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        checkIdle();
      }
    };

    for (const event of ACTIVITY_EVENTS) {
      window.addEventListener(event, bumpActivity, { passive: true });
    }
    document.addEventListener('visibilitychange', onVisibility);

    const intervalId = setInterval(checkIdle, CHECK_INTERVAL_MS);

    return () => {
      clearInterval(intervalId);
      document.removeEventListener('visibilitychange', onVisibility);
      for (const event of ACTIVITY_EVENTS) {
        window.removeEventListener(event, bumpActivity);
      }
    };
  }, [pathname, signOutForInactivity]);

  return null;
}
