'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { trackLoginSts } from '@/lib/telemetry/loginSts';

const HEARTBEAT_MS = 15 * 60 * 1000;

/**
 * Dealer dashboard session telemetry (not /dashboard/admin).
 * Logs session_start, page_view, and periodic heartbeat.
 */
export default function LoginStsTracker() {
  const pathname = usePathname();
  const sessionLoggedRef = useRef(false);
  const lastPathRef = useRef(null);

  useEffect(() => {
    if (!pathname || pathname.startsWith('/dashboard/admin')) return undefined;

    if (!sessionLoggedRef.current) {
      sessionLoggedRef.current = true;
      trackLoginSts({ eventType: 'session_start', eventAction: 'dashboard' });
    }

    if (lastPathRef.current !== pathname) {
      lastPathRef.current = pathname;
      trackLoginSts({
        eventType: 'page_view',
        eventAction: pathname,
      });
    }

    const heartbeat = setInterval(() => {
      trackLoginSts({
        eventType: 'session_heartbeat',
        eventAction: pathname,
      });
    }, HEARTBEAT_MS);

    return () => clearInterval(heartbeat);
  }, [pathname]);

  return null;
}
