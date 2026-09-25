'use client';

import { Suspense, useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { ClientProvider, useClient } from '@/components/dashboard/ClientContext';
import TopBar from '@/components/dashboard/TopBar';
import { NavigationLoadingProvider } from '@/components/dashboard/NavigationLoading';
import LoginStsTracker from '@/components/telemetry/LoginStsTracker';
import InactivityTimeout from '@/components/auth/InactivityTimeout';
import { VdpProvider } from '@/components/vdp/VdpContext';
import { VdpDateRangeProvider } from '@/components/vdp/VdpDateRangeContext';
import VdpShell from '@/components/vdp/VdpShell';
import {
  canAccessReport,
  firstAllowedReportHref,
  reportKeyFromPathname,
} from '@/lib/access/permissions';

function DashboardContent({ children }) {
  const pathname = usePathname();
  const router = useRouter();
  const { access, accessLoading } = useClient();
  const isAdminRoute = pathname?.startsWith('/dashboard/admin');
  const reportKey = isAdminRoute ? null : reportKeyFromPathname(pathname);
  const denied =
    !isAdminRoute &&
    !accessLoading &&
    reportKey &&
    !canAccessReport(access, reportKey);

  useEffect(() => {
    if (denied) router.replace(firstAllowedReportHref(access));
  }, [access, denied, router]);

  if (isAdminRoute) {
    return (
      <>
        <Suspense fallback={null}>
          <NavigationLoadingProvider>
            <div className="dash-root">
              <TopBar />
              <div className="dash-layout dash-layout--admin">
                <main className="page-shell">
                  {children}
                </main>
              </div>
            </div>
          </NavigationLoadingProvider>
        </Suspense>
      </>
    );
  }

  return (
    <>
      <LoginStsTracker />
      <InactivityTimeout />
      <Suspense fallback={null}>
        <NavigationLoadingProvider>
          <VdpProvider>
            <VdpDateRangeProvider>
              <VdpShell>
                {denied ? (
                  <p style={{ color: '#64748b' }}>Redirecting to an allowed report…</p>
                ) : (
                  children
                )}
              </VdpShell>
            </VdpDateRangeProvider>
          </VdpProvider>
        </NavigationLoadingProvider>
      </Suspense>
    </>
  );
}

export default function DashboardChrome({ children }) {
  return (
    <ClientProvider>
      <DashboardContent>{children}</DashboardContent>
    </ClientProvider>
  );
}
