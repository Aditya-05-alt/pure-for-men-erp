'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { resetDealerToAll } from '@/lib/dashboard/dashboardPrefs';
import { useClient } from '@/components/dashboard/ClientContext';
import { isAllDealerClient } from '@/lib/dashboard/allDealers';
import CalendarRangePicker from '@/components/dashboard/CalendarRangePicker';
import { useVdpDateRange } from '@/components/vdp/VdpDateRangeContext';
import DealerViewsKeepAlive from '@/components/vdp/DealerViewsKeepAlive';
import HomeViewsKeepAlive from '@/components/vdp/HomeViewsKeepAlive';

const HOME_VIEWS = [
  { id: 'portfolio', href: '/dashboard', label: 'All Dealers' },
  { id: 'source-mapping', href: '/dashboard/source-mapping', label: 'Source Mapping' },
  {
    id: 'inventory-analyse',
    href: '/dashboard/inventory-analyse',
    label: 'Inventory Analysis',
  },
];

const DEALER_VIEWS = [
  { id: 'overview', href: '/dashboard/overview', label: 'Overview' },
  { id: 'traffic', href: '/dashboard/traffic', label: 'Traffic by Source' },
  { id: 'campaigns', href: '/dashboard/campaigns_advance', label: 'Campaign Views' },
  { id: 'inventory', href: '/dashboard/inventory', label: 'Inventory Performance' },
  { id: 'vehicle-age', href: '/dashboard/vehicle-age', label: 'Vehicle Age' },
];

function viewFromPath(pathname) {
  if (pathname === '/dashboard' || pathname === '/dashboard/') return 'portfolio';
  if (pathname.startsWith('/dashboard/source-mapping')) return 'source-mapping';
  if (pathname.startsWith('/dashboard/inventory-analyse')) return 'inventory-analyse';
  if (pathname.startsWith('/dashboard/overview')) return 'overview';
  if (pathname.startsWith('/dashboard/traffic')) return 'traffic';
  if (
    pathname.startsWith('/dashboard/campaigns_advance') ||
    pathname.startsWith('/dashboard/campaigns')
  ) {
    return 'campaigns';
  }
  if (pathname.startsWith('/dashboard/vehicle-age')) return 'vehicle-age';
  if (pathname.startsWith('/dashboard/inventory')) return 'inventory';
  return 'portfolio';
}

export default function VdpShell({ children }) {
  const pathname = usePathname();
  const router = useRouter();
  const {
    client,
    dealers,
    pickClient,
    loading: dealersLoading,
    isAllDealer,
  } = useClient();
  const {
    dateRange,
    setDateRange,
    to,
    curLabel,
    compareEnabled,
    toggleCompareEnabled,
    compareDateRange,
    setCompareDateRange,
    priorFrom,
    priorTo,
  } = useVdpDateRange();
  const [displayName, setDisplayName] = useState('Account');

  const activeView = viewFromPath(pathname);
  const isDealerView = DEALER_VIEWS.some((v) => v.id === activeView);
  const isHomeView = HOME_VIEWS.some((v) => v.id === activeView);
  const showDateRange =
    activeView !== 'source-mapping' && activeView !== 'inventory-analyse';
  const showOverviewCompare = activeView === 'overview';
  const asOfLabel = to ? `Data through ${to}` : `Period · ${curLabel}`;

  const dealerList = useMemo(
    () => (dealers || []).filter((d) => d?.name && d?.ga4CustomerId),
    [dealers]
  );

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
      setDisplayName(
        user?.user_metadata?.full_name ||
          user?.user_metadata?.name ||
          user?.email?.split('@')[0] ||
          'Account'
      );
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSignOut = () => {
    resetDealerToAll();
    window.location.href = '/api/auth/signout';
  };

  const onDealerChange = (e) => {
    const id = e.target.value;
    const next = dealerList.find((d) => String(d.id) === String(id));
    if (next) pickClient(next);
  };

  const selectValue =
    !isAllDealer && client?.id != null ? String(client.id) : '';

  return (
    <div className="vdp-root">
      <div className="vdp-top-chrome">
        <header className="vdp-app-header">
          <div className="vdp-titleblock">
            <h1>VDP &amp; Page View Performance</h1>
            <div className="vdp-sub">Dealer reporting portal</div>
          </div>
          {showDateRange && (
            <div className="vdp-date-range">
              <CalendarRangePicker
                value={dateRange}
                onChange={setDateRange}
                popClassName="cdr-pop--vdp"
                comparePeriod={
                  showOverviewCompare
                    ? {
                        enabled: compareEnabled,
                        onToggle: toggleCompareEnabled,
                        value:
                          compareDateRange || {
                            start: priorFrom,
                            end: priorTo,
                            preset: 'custom',
                          },
                        onChange: setCompareDateRange,
                      }
                    : null
                }
              />
            </div>
          )}
          <span className="vdp-pill">{asOfLabel}</span>
          <span className="vdp-pill">{displayName}</span>
          <button type="button" className="vdp-chip-btn" onClick={handleSignOut}>
            Log Out
          </button>
        </header>

        {!isDealerView && (
          <nav className="vdp-nav-primary">
            {HOME_VIEWS.map((item) => (
              <Link
                key={item.id}
                href={item.href}
                className={`vdp-nav-home ${activeView === item.id ? 'active' : ''}`}
                prefetch
              >
                {item.label}
              </Link>
            ))}
          </nav>
        )}

        {isDealerView && (
          <div className="vdp-dealer-bar show">
            <button
              type="button"
              className="vdp-back"
              onClick={() => router.push('/dashboard')}
            >
              ← All Dealers
            </button>
            <span className="vdp-crumb-sep">/</span>
            <select
              className="vdp-client-select"
              value={selectValue}
              onChange={onDealerChange}
              disabled={dealersLoading || !dealerList.length}
              aria-label="Select dealer"
            >
              {(isAllDealer || !selectValue) && (
                <option value="">Select dealer…</option>
              )}
              {dealerList.map((c) => (
                <option key={c.id} value={String(c.id)}>
                  {c.name}
                  {c.dealerCategory ? ` (${c.dealerCategory})` : ''}
                </option>
              ))}
            </select>
            <nav className="vdp-tabs-sub">
              {DEALER_VIEWS.map((tab) => (
                <Link
                  key={tab.id}
                  href={tab.href}
                  className={`vdp-tab-btn ${activeView === tab.id ? 'active' : ''}`}
                  prefetch
                >
                  {tab.label}
                </Link>
              ))}
            </nav>
          </div>
        )}
      </div>

      <main className="vdp-main">
        {isDealerView && client && !isAllDealerClient(client) && (
          <div className="vdp-dealer-context">
            Viewing <strong>{client.name}</strong>
            {client.dealerCategory ? (
              <span className="vdp-vert-tag">{client.dealerCategory}</span>
            ) : null}
          </div>
        )}
        {isDealerView ? (
          <DealerViewsKeepAlive
            activeView={activeView}
            clientKey={
              client && !isAllDealerClient(client)
                ? String(client.ga4CustomerId || client.id || '')
                : 'none'
            }
          />
        ) : isHomeView ? (
          <HomeViewsKeepAlive activeView={activeView} />
        ) : (
          children
        )}
      </main>
    </div>
  );
}
