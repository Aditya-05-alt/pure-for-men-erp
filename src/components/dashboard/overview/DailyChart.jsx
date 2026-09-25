'use client';

import { useMemo } from 'react';
import { Panel, PanelHeader, PanelBody } from '../Panel';
import { useOverview } from './OverviewDataContext';

const TAB_LABELS = {
  all:   'All Pages',
  vdp:   'VDP',
  srp:   'SRP',
  home:  'Homepage',
  other: 'Other',
};

/** Pick ~7 evenly spaced indices for the X-axis labels, always including the first and last. */
function pickTickIndices(n, desired = 7) {
  if (n <= 0) return new Set();
  if (n <= desired) return new Set(Array.from({ length: n }, (_, i) => i));
  const step = (n - 1) / (desired - 1);
  const set = new Set();
  for (let i = 0; i < desired; i++) set.add(Math.round(i * step));
  return set;
}

function dayLabel(iso) {
  if (!iso) return '';
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso.slice(5);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export default function DailyChart() {
  const { tab, seriesByTab, dateList, loading } = useOverview();
  const current = useMemo(
    () => seriesByTab?.[tab] || [],
    [seriesByTab, tab]
  );

  const max = useMemo(() => {
    const mx = current.length ? Math.max(...current) : 0;
    return mx > 0 ? mx : 1;
  }, [current]);

  const tickIdx = useMemo(() => pickTickIndices(current.length), [current.length]);
  const subtitle = `${current.length} day${current.length === 1 ? '' : 's'}${loading ? ' · loading…' : ''}`;

  return (
    <Panel>
      <PanelHeader title={`${TAB_LABELS[tab] || 'Pages'} Views by Date`} subtitle={subtitle} />

      <PanelBody>
        <BarMode current={current} max={max} />

        <div className="chart-xl">
          {current.map((_, i) => (
            <div key={i} className="cxl">
              {tickIdx.has(i) ? dayLabel(dateList[i]) : ''}
            </div>
          ))}
        </div>
      </PanelBody>
    </Panel>
  );
}

function BarMode({ current, max }) {
  return (
    <div className="chart-area">
      {current.map((v, i) => {
        const h = Math.round((v / max) * 134);
        return (
          <div key={i} className="bg">
            <div className="b bc" style={{ height: h }}>
              <div className="btt">{(v || 0).toLocaleString()}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
