'use client';

import { useClient } from '../ClientContext';
import { useOverview } from './OverviewDataContext';

const TABS = [
  { id: 'vdp',   icon: '🚗' },
  { id: 'srp',   label: 'SRP',      icon: '🔍' },
  { id: 'home',  label: 'Homepage', icon: '🏠' },
  { id: 'all',   label: 'All',      icon: '📊' },
  { id: 'other', label: 'Other',    icon: '📄' },
];

const ALL_DEALER_TABS = [
  { id: 'vdp', icon: '🚗' },
  { id: 'all', label: 'All', icon: '📊' },
];

export default function PageTabs() {
  const { config, isAllDealer } = useClient();
  const { tab, setTab } = useOverview();
  const tabs = isAllDealer ? ALL_DEALER_TABS : TABS;

  return (
    <div className="page-tabs">
      {tabs.map((t) => {
        const label = t.id === 'vdp' ? config.vdpLabel : t.label;
        return (
          <button
            key={t.id}
            type="button"
            className={`pt ${tab === t.id ? 'active' : ''}`}
            onClick={() => setTab(t.id)}
          >
            <span>{t.icon}</span>
            <span>{label}</span>
          </button>
        );
      })}
    </div>
  );
}
