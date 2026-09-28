'use client';

import { useMemo, useState } from 'react';
import { Bebas_Neue, DM_Sans } from 'next/font/google';
import CalendarRangePicker from '@/components/dashboard/CalendarRangePicker';
import {
  resolveVdpReportPeriod,
  VDP_DEFAULT_DATE_RANGE,
  VDP_DEFAULT_COMPARE_MODE,
} from '@/lib/vdp/dateRange';
import { formatRangeLabel } from '@/lib/overview/comparePeriod';
import AllPageViewsPanel from './AllPageViewsPanel';
import ProductPageViewsPanel from './ProductPageViewsPanel';
import PfmSourceMappingPanel from './PfmSourceMappingPanel';
import LoginStsTracker from '@/components/telemetry/LoginStsTracker';

const bebas = Bebas_Neue({
  weight: '400',
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-pfm-display',
});

const dmSans = DM_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
  variable: '--font-pfm-ui',
});

const TABS = [
  { id: 'product', label: 'Product Page Views' },
  { id: 'all', label: 'All Page Views' },
  { id: 'source-mapping', label: 'Source Mapping' },
];

export default function PfmShell() {
  const [tab, setTab] = useState('product');
  const [dateRange, setDateRange] = useState(VDP_DEFAULT_DATE_RANGE);
  const [compareMode, setCompareMode] = useState(VDP_DEFAULT_COMPARE_MODE);

  const period = useMemo(() => {
    const resolved = resolveVdpReportPeriod(dateRange, {
      compareEnabled: true,
      compareMode,
    });
    return {
      from: resolved.from,
      to: resolved.to,
      priorFrom: resolved.priorFrom,
      priorTo: resolved.priorTo,
      curLabel: formatRangeLabel(resolved.from, resolved.to),
      priLabel: formatRangeLabel(resolved.priorFrom, resolved.priorTo),
    };
  }, [dateRange, compareMode]);

  const handleCompareMode = (mode) => {
    setCompareMode((prev) => (prev === mode ? null : mode));
  };

  return (
    <div className={`vdp-root pfm-dash ${bebas.variable} ${dmSans.variable}`}>
      <LoginStsTracker />
      <div className="pfm-dash-atmosphere" aria-hidden="true">
        <div className="pfm-dash-glow pfm-dash-glow--a" />
        <div className="pfm-dash-glow pfm-dash-glow--b" />
        <div className="pfm-dash-grid" />
      </div>

      <div className="vdp-top-chrome">
        <header className="vdp-app-header">
          <div className="vdp-titleblock">
            <h1>Pure for Men</h1>
            <div className="vdp-sub">Page Views · Stay Ready Analytics</div>
          </div>
          <div className="vdp-date-range">
            <CalendarRangePicker
              value={dateRange}
              onChange={setDateRange}
              popClassName="cdr-pop--vdp"
            />
          </div>
          <a className="vdp-pill vdp-pill--logout" href="/api/auth/signout">
            Sign out
          </a>
        </header>

        <div className="page-tabs">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`pt ${tab === t.id ? 'active' : ''}`}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <main
        className="vdp-main"
        style={{
          padding: '20px 24px 40px',
          maxWidth: tab === 'source-mapping' ? 1400 : 1280,
          margin: '0 auto',
        }}
      >
        {tab === 'product' ? (
          <ProductPageViewsPanel
            from={period.from}
            to={period.to}
            priorFrom={period.priorFrom}
            priorTo={period.priorTo}
            curLabel={period.curLabel}
            priLabel={period.priLabel}
            compareMode={compareMode}
            onCompareModeChange={handleCompareMode}
          />
        ) : tab === 'all' ? (
          <AllPageViewsPanel
            from={period.from}
            to={period.to}
            priorFrom={period.priorFrom}
            priorTo={period.priorTo}
            curLabel={period.curLabel}
            priLabel={period.priLabel}
          />
        ) : (
          <PfmSourceMappingPanel
            from={period.from}
            to={period.to}
            curLabel={period.curLabel}
          />
        )}
      </main>
    </div>
  );
}
