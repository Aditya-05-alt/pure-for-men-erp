'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useMemo, useState, useEffect } from 'react';
import { useClient } from './ClientContext';
import { useDropdown } from './useDropdown';
import { useNavigationLoading } from './NavigationLoading';
import { CATEGORIES } from '@/lib/data/categories';
import { createClient } from '@/lib/supabase/client';
import ThemeToggle from '@/components/ui/ThemeToggle';
import { isAllDealerClient } from '@/lib/dashboard/allDealers';
import { resetDealerToAll } from '@/lib/dashboard/dashboardPrefs';
import {
  inventoryReportExcludesAllDealers,
  isInventoryReportPath,
} from '@/lib/inventory/inventoryReport';

const NAV = [
  // { id: 'overview',    href: '/dashboard',              label: 'Overview' },
  // { id: 'health',      href: '/dashboard/health',       label: 'Portfolio Health' },
  // { id: 'attribution', href: '/dashboard/attribution',  label: 'Attribution' },
  // { id: 'local',       href: '/dashboard/local',        label: 'Local Intel' },
  // { id: 'reports',     href: '/reports/date-wise-views', label: 'Date-wise Views' },
  { id: 'admin', href: '/dashboard/admin/pipeline', label: 'Admin' },
];

function DealerCategoryFilter() {
  const {
    dealerCategoryFilter,
    setDealerCategoryFilter,
    dealerCategoryOptions,
    loading,
  } = useClient();

  return (
    <label className="tb-category-filter">
      <select
        className="tb-category-select"
        value={dealerCategoryFilter}
        onChange={(e) => setDealerCategoryFilter(e.target.value)}
        disabled={loading}
        aria-label="Filter dealers by category"
      >
        <option value="">All categories</option>
        {(dealerCategoryOptions || []).map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
    </label>
  );
}

function ClientPicker() {
  const pathname = usePathname();
  const {
    client,
    pickClient,
    dealers,
    dealerCategoryFilter,
    loading,
    error,
    isAllDealer,
    allDealerClient,
    canUseAllDealers,
  } = useClient();
  const { open, toggle, close, ref } = useDropdown();

  const [query, setQuery] = useState('');

  const hideAllDealerOption =
    !canUseAllDealers ||
    (inventoryReportExcludesAllDealers() && isInventoryReportPath(pathname));

  const allDealerLabel = dealerCategoryFilter
    ? `All Dealers (${dealerCategoryFilter})`
    : allDealerClient.name;

  const listItems = useMemo(() => {
    const q = query.trim().toLowerCase();
    const dealerMatches = !q
      ? dealers
      : dealers.filter((d) => d.name.toLowerCase().includes(q));
    if (hideAllDealerOption) return dealerMatches;
    const allMatches =
      !q
      || allDealerClient.name.toLowerCase().includes(q)
      || allDealerLabel.toLowerCase().includes(q)
      || q.includes('all');
    if (allMatches) {
      return [{ ...allDealerClient, name: allDealerLabel }, ...dealerMatches];
    }
    return dealerMatches;
  }, [
    dealers,
    query,
    allDealerClient,
    allDealerLabel,
    hideAllDealerOption,
  ]);

  useEffect(() => {
    if (!open) setQuery('');
  }, [open]);

  const currentColor = isAllDealer
    ? 'var(--t3)'
    : CATEGORIES[client?.category]?.color || 'var(--acc, #4EE09C)';

  const buttonLabel = isAllDealer
    ? allDealerLabel
    : client?.name || (loading ? 'Loading dealers…' : 'Select dealer');

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <div className="client-pick" onClick={toggle} role="button" tabIndex={0}>
        {isAllDealer ? (
          <div className="cp-dot" style={{ background: 'var(--t3)' }} aria-hidden />
        ) : (
          <div className="cp-dot" style={{ background: currentColor }} />
        )}
        <span className="cp-name">{buttonLabel}</span>
        <span className="cp-arr">▼</span>
      </div>
      {open && (
        <div className="client-dropdown animate-fade-in">
          <div className="cd-search-wrap">
            <input
              type="text"
              className="cd-search"
              placeholder="Search dealers…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoFocus
            />
          </div>

          <div className="cd-list">
            {loading && <div className="cd-empty">Loading dealers…</div>}
            {!loading && error && (
              <div className="cd-empty cd-error">Failed to load: {error}</div>
            )}
            {!loading && !error && listItems.length === 0 && (
              <div className="cd-empty">
                {dealerCategoryFilter
                  ? `No ${dealerCategoryFilter} dealers found.`
                  : `No dealers match “${query}”.`}
              </div>
            )}
            {!loading &&
              !error &&
              listItems.map((c) => {
                const selected = client?.id === c.id;
                const dotColor = isAllDealerClient(c)
                  ? 'var(--t3)'
                  : currentColor;
                return (
                  <div
                    key={c.id}
                    className={`cd-item ${selected ? 'sel' : ''}`}
                    onClick={() => {
                      pickClient(isAllDealerClient(c) ? allDealerClient : c);
                      close();
                    }}
                  >
                    <div className="cd-dot" style={{ background: dotColor }} />
                    <span className="cd-name">{c.name}</span>
                    {selected && (
                      <span
                        className="cd-badge"
                        style={{ background: 'var(--gd)', color: 'var(--green)' }}
                      >
                        Active
                      </span>
                    )}
                  </div>
                );
              })}
          </div>
        </div>
      )}
    </div>
  );
}

function userInitials(label) {
  const text = String(label || '').trim();
  if (!text) return 'U';
  if (text.includes('@')) return text.slice(0, 2).toUpperCase();
  const parts = text.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0][0] || ''}${parts[1][0] || ''}`.toUpperCase();
  }
  return text.slice(0, 2).toUpperCase();
}

function UserAccountMenu() {
  const { open, toggle, close, ref } = useDropdown();
  const [displayName, setDisplayName] = useState('Account');

  useEffect(() => {
    const supabase = createClient();
    if (!supabase) {
      setDisplayName('Demo User');
      return undefined;
    }

    let cancelled = false;
    supabase.auth.getUser().then(({ data }) => {
      if (cancelled) return;
      const user = data?.user;
      const name =
        user?.user_metadata?.full_name
        || user?.user_metadata?.name
        || user?.email?.split('@')[0]
        || 'Account';
      setDisplayName(name);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  const initials = useMemo(() => userInitials(displayName), [displayName]);

  const handleSignOut = () => {
    close();
    resetDealerToAll();
    window.location.href = '/api/auth/signout';
  };

  return (
    <div ref={ref} className="tb-user-menu">
      <button
        type="button"
        className="tb-user-trigger"
        onClick={toggle}
        aria-expanded={open}
        aria-haspopup="menu"
      >
        <span className="tb-avatar">{initials}</span>
        <span className="tb-user-name">{displayName}</span>
        <span className="cp-arr">▼</span>
      </button>
      {open && (
        <div className="tb-user-dropdown animate-fade-in" role="menu">
          <div className="tb-user-dropdown-label">{displayName}</div>
          <button
            type="button"
            className="tb-user-dropdown-item"
            role="menuitem"
            onClick={handleSignOut}
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}

export default function TopBar() {
  const pathname = usePathname();
  const { pending: navPending } = useNavigationLoading();
  const hideDealerPicker =
    pathname?.startsWith('/dashboard/admin') || pathname?.startsWith('/reports');

  const activeId = useMemo(() => {
    if (pathname.startsWith('/dashboard/admin')) return 'admin';
    // if (pathname === '/dashboard') return 'overview';
    // if (pathname.startsWith('/reports')) return 'reports';
    // const seg = pathname.replace('/dashboard/', '').split('/')[0];
    // return seg || 'overview';
    return 'admin';
  }, [pathname]);

  return (
    <header className="topbar">
      <Link href="/dashboard/admin/pipeline" className="logo" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div
          style={{
            width: 26, height: 26, background: 'var(--acc)',
            borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            boxShadow: '0 6px 18px -6px rgba(200,232,122,.4)',
          }}
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
            <path d="M2 12L6 7L9 10L13 4" stroke="#14171C" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <span
          className="font-display"
          style={{ fontSize: 15, fontWeight: 700, color: 'var(--t)', letterSpacing: '-0.01em' }}
        >
          SmartAnalytics
        </span>
      </Link>

      {!hideDealerPicker && (
        <>
          <div className="tb-div" />
          <DealerCategoryFilter />
          <ClientPicker />
        </>
      )}

      {navPending && (
        <div className="tb-nav-loading" role="status" aria-live="polite">
          <span className="tb-nav-loading-dot" aria-hidden />
          Loading…
        </div>
      )}

      <nav className="topbar-right" style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
        {NAV.map((n) => (
          <Link
            key={n.id}
            href={n.href}
            className={`tb-btn ${activeId === n.id ? 'active' : ''}`}
            prefetch={false}
          >
            {n.label}
          </Link>
        ))}
        <div className="tb-div" />
        <ThemeToggle variant="icon" />
        <UserAccountMenu />
      </nav>
    </header>
  );
}
