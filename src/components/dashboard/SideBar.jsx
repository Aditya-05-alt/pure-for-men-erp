'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { useClient } from '@/components/dashboard/ClientContext';
import { canAccessReport } from '@/lib/access/permissions';

const SIDEBAR_COLLAPSED_KEY = 'sa_sidebar_collapsed';

const ICONS = {
  overview: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </svg>
  ),
  health: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
    </svg>
  ),
  attribution: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="10" />
      <path d="M12 8v4l3 3" />
    </svg>
  ),
  local: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  ),
  inventory: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M5 17h14" />
      <path d="M5 17a2 2 0 0 1-2-2v-4l2-5h14l2 5v4a2 2 0 0 1-2 2" />
      <circle cx="7.5" cy="17" r="1.5" />
      <circle cx="16.5" cy="17" r="1.5" />
    </svg>
  ),
  admin: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="8" r="4" />
      <path d="M3 20a9 9 0 0 1 18 0" />
    </svg>
  ),
  settings: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  ),
};

const ITEMS = [
  { id: 'overview', href: '/dashboard', title: 'Overview' },
  { id: 'inventory', href: '/dashboard/inventory', title: 'Inventory report' },
  { id: 'health', href: '/dashboard/health', title: 'Portfolio Health' },
  { id: 'attribution', href: '/dashboard/attribution', title: 'Attribution' },
  { id: 'local', href: '/dashboard/local', title: 'Local Intel' },
];

function SideBarLink({ item, active, collapsed }) {
  return (
    <Link
      href={item.href}
      className={`sb-ic ${active ? 'active' : ''} ${collapsed ? 'sb-ic--collapsed' : ''}`}
      title={item.title}
      prefetch={false}
    >
      {ICONS[item.id]}
      {!collapsed && <span className="sb-label">{item.title}</span>}
    </Link>
  );
}

const MemoLink = memo(SideBarLink);

export default function SideBar() {
  const pathname = usePathname();
  const { access, accessLoading } = useClient();
  const [collapsed, setCollapsed] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === '1');
    } catch {
      /* ignore */
    }
    setReady(true);
  }, []);

  const toggleCollapsed = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(SIDEBAR_COLLAPSED_KEY, next ? '1' : '0');
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  const activeId = useMemo(() => {
    if (pathname === '/dashboard') return 'overview';
    if (pathname.startsWith('/dashboard/admin')) return 'admin';
    const seg = pathname.replace('/dashboard/', '').split('/')[0];
    return seg || 'overview';
  }, [pathname]);

  const allowedItems = useMemo(
    () =>
      accessLoading
        ? []
        : ITEMS.filter((item) => canAccessReport(access, item.id)),
    [access, accessLoading]
  );

  return (
    <aside
      className={`sidebar ${collapsed ? 'sidebar--collapsed' : 'sidebar--expanded'}${ready ? '' : ' sidebar--pending'}`}
      aria-label="Main navigation"
    >
      <div className="sb-brand">
        <button
          type="button"
          className="sb-toggle"
          onClick={toggleCollapsed}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-expanded={!collapsed}
          title={collapsed ? 'Expand' : 'Collapse'}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            {collapsed ? (
              <path d="M9 18l6-6-6-6" />
            ) : (
              <path d="M15 18l-6-6 6-6" />
            )}
          </svg>
        </button>
      </div>

      <nav className="sb-nav">
        {allowedItems.map((item) => (
          <MemoLink
            key={item.id}
            item={item}
            active={activeId === item.id}
            collapsed={collapsed}
          />
        ))}
        <div className="sb-sep" />
        {access?.role !== 'user' && (
          <Link
            href="/dashboard/admin"
            className={`sb-ic ${activeId === 'admin' ? 'active' : ''} ${collapsed ? 'sb-ic--collapsed' : ''}`}
            title="Admin"
            prefetch={false}
          >
            {ICONS.admin}
            {!collapsed && <span className="sb-label">Admin</span>}
          </Link>
        )}
      </nav>

      {/* Settings — hidden until used
      <div
        className={`sb-ic sb-ic--footer ${collapsed ? 'sb-ic--collapsed' : ''}`}
        title="Settings"
      >
        {ICONS.settings}
        {!collapsed && <span className="sb-label">Settings</span>}
      </div>
      */}
    </aside>
  );
}
