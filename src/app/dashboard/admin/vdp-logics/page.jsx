import { Suspense } from 'react';
import VdpLogicsPanel from '@/components/dashboard/admin/VdpLogicsPanel';

export const metadata = {
  title: 'Vdp - Logics · Admin · SmartAnalytics',
};

export default function VdpLogicsAdminPage() {
  return (
    <Suspense fallback={<p className="ga4-count-meta">Loading VDP logics…</p>}>
      <VdpLogicsPanel />
    </Suspense>
  );
}
