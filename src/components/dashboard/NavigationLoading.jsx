'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { usePathname, useSearchParams } from 'next/navigation';

const NavigationLoadingContext = createContext(null);

function isInternalNavClick(event) {
  if (event.defaultPrevented) return false;
  if (event.button !== 0) return false;
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return false;

  const anchor = event.target?.closest?.('a[href]');
  if (!anchor) return false;
  if (anchor.target && anchor.target !== '_self') return false;
  if (anchor.hasAttribute('download')) return false;

  const href = anchor.getAttribute('href');
  if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) {
    return false;
  }
  if (/^https?:\/\//i.test(href)) {
    try {
      if (new URL(href).origin !== window.location.origin) return false;
    } catch {
      return false;
    }
  }

  try {
    const next = new URL(href, window.location.origin);
    const currentPath = window.location.pathname;
    const currentSearch = window.location.search;
    if (next.pathname === currentPath && next.search === currentSearch) return false;
    // Keep-alive tabs — skip the top progress bar for instant switches
    const dealerTabs = [
      '/dashboard/overview',
      '/dashboard/traffic',
      '/dashboard/inventory',
    ];
    if (dealerTabs.includes(next.pathname) && dealerTabs.includes(currentPath)) {
      return false;
    }
    const isHomeTab = (path) =>
      path === '/dashboard' ||
      path === '/dashboard/' ||
      path.startsWith('/dashboard/source-mapping') ||
      path.startsWith('/dashboard/inventory-analyse');
    if (isHomeTab(currentPath) && isHomeTab(next.pathname)) {
      return false;
    }
  } catch {
    return false;
  }

  return true;
}

export function NavigationLoadingProvider({ children }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, setPending] = useState(false);

  const start = useCallback(() => setPending(true), []);
  const stop = useCallback(() => setPending(false), []);

  useEffect(() => {
    setPending(false);
  }, [pathname, searchParams]);

  useEffect(() => {
    const onClick = (event) => {
      if (isInternalNavClick(event)) setPending(true);
    };
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, []);

  // Safety: clear if navigation stalls (e.g. same soft-nav edge cases).
  useEffect(() => {
    if (!pending) return undefined;
    const timer = window.setTimeout(() => setPending(false), 12000);
    return () => window.clearTimeout(timer);
  }, [pending]);

  const value = useMemo(
    () => ({ pending, start, stop }),
    [pending, start, stop]
  );

  return (
    <NavigationLoadingContext.Provider value={value}>
      {children}
      {pending ? (
        <div className="nav-progress" role="progressbar" aria-label="Loading page" aria-busy="true">
          <div className="nav-progress-bar" />
        </div>
      ) : null}
    </NavigationLoadingContext.Provider>
  );
}

export function useNavigationLoading() {
  const ctx = useContext(NavigationLoadingContext);
  if (!ctx) {
    return { pending: false, start: () => {}, stop: () => {} };
  }
  return ctx;
}
