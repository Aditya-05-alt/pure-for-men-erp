'use client';

import { useMemo, useState } from 'react';
import { Panel, PanelHeader } from '@/components/dashboard/Panel';
import AdminDateRange from '@/components/dashboard/admin/AdminDateRange';
import { getDefaultGa4DateRange, GA4_DEFAULT_DAYS } from '@/lib/ga4/dateRange';

const STATUS_STYLE = {
  Active: { background: 'var(--gd)', color: 'var(--green)' },
  Review: { background: 'var(--yd)', color: 'var(--yellow)' },
  Manual: { background: 'var(--s3)', color: 'var(--t3)' },
};

const PROVIDERS = [
  { name: 'DealerSocket', categories: 'Auto,RV,PS,Marine', cond: 'url', make: 'url', year: 'title', loc: '—', dealers: 38, status: 'Active' },
  { name: 'DealerFire', categories: 'Auto,RV', cond: 'title', make: 'title', year: 'title', loc: 'scrape', dealers: 24, status: 'Active' },
  { name: 'Dealer Inspire', categories: 'Auto', cond: 'url', make: 'scrape', year: 'scrape', loc: '—', dealers: 18, status: 'Active' },
  { name: 'VinSolutions', categories: 'Auto,RV', cond: 'url', make: 'url', year: 'url', loc: '—', dealers: 11, status: 'Active' },
  { name: 'CDK Global', categories: 'Auto', cond: 'url', make: 'url', year: 'url', loc: '—', dealers: 6, status: 'Review' },
  { name: 'Custom', categories: 'All', cond: 'override', make: 'override', year: 'override', loc: 'override', dealers: 3, status: 'Manual' },
];

export default function AdminProvidersPage() {
  const defaultRange = useMemo(() => getDefaultGa4DateRange(GA4_DEFAULT_DAYS), []);
  const [dateFrom, setDateFrom] = useState(defaultRange.from);
  const [dateTo, setDateTo] = useState(defaultRange.to);

  return (
    <div className="admin-page-simple">
      <AdminDateRange
        from={dateFrom}
        to={dateTo}
        onFromChange={setDateFrom}
        onToChange={setDateTo}
      />
      <p className="ga4-count-meta" style={{ marginTop: '0.65rem' }}>
        Provider list for {dateFrom} → {dateTo} (date range ready for Supabase)
      </p>
      <Panel>
        <PanelHeader title="Provider Templates" />
        <div style={{ overflowX: 'auto' }}>
          <table className="tbl">
            <thead>
              <tr>
                <th>Provider</th>
                <th>Categories</th>
                <th>Cond.</th>
                <th>Make</th>
                <th>Year</th>
                <th>Location</th>
                <th>Dealers</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {PROVIDERS.map((p) => {
                const s = STATUS_STYLE[p.status] || STATUS_STYLE.Manual;
                return (
                  <tr key={p.name}>
                    <td className="tn">{p.name}</td>
                    <td>{p.categories}</td>
                    <td>{p.cond}</td>
                    <td>{p.make}</td>
                    <td>{p.year}</td>
                    <td>{p.loc}</td>
                    <td>{p.dealers}</td>
                    <td>
                      <span className="delta" style={s}>{p.status}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}
