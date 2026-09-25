'use client';

import { useState, useMemo } from 'react';
import { Panel, PanelHeader } from '../Panel';
import { useClient } from '../ClientContext';
import { MAKES_VALUES } from '@/lib/data/leads';

const TABS = ['used', 'new', 'all'];

function pct(a, b) {
  return b > 0 ? Math.round(((a - b) / b) * 100) : 0;
}

function arrowClass(v) {
  return v > 0 ? 'up' : v < 0 ? 'dn' : 'ne';
}

export default function MakesTable() {
  const { config } = useClient();
  const [tab, setTab] = useState('used');

  const rows = useMemo(() => {
    return config.makes.map((m, i) => ({
      make: m,
      cur:  MAKES_VALUES.cur[i]  ?? 5000,
      prev: MAKES_VALUES.prev[i] ?? 4800,
      ly:   MAKES_VALUES.ly[i]   ?? 4600,
    }));
  }, [config.makes, tab]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Panel>
      <PanelHeader title={`Top Makes — ${config.vdpLabel}`}>
        <div className="ph-tabs">
          {TABS.map((id) => (
            <button
              key={id}
              type="button"
              className={`ph-t2 ${tab === id ? 'active' : ''}`}
              onClick={() => setTab(id)}
            >
              {id[0].toUpperCase() + id.slice(1)}
            </button>
          ))}
        </div>
      </PanelHeader>
      <div style={{ overflowX: 'auto' }}>
        <table className="tbl">
          <thead>
            <tr>
              <th>Make</th>
              <th>Apr ’26</th>
              <th>Mar ’26</th>
              <th>Apr ’25</th>
              <th>MoM</th>
              <th>YoY</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const mom = pct(r.cur, r.prev);
              const yoy = pct(r.cur, r.ly);
              return (
                <tr key={r.make}>
                  <td className="tn">{r.make}</td>
                  <td style={{ fontWeight: 600, color: 'var(--t)' }}>{r.cur.toLocaleString()}</td>
                  <td style={{ color: 'var(--t3)' }}>{r.prev.toLocaleString()}</td>
                  <td style={{ color: 'var(--t3)' }}>{r.ly.toLocaleString()}</td>
                  <td className={`mom ${arrowClass(mom)}`}>
                    {mom >= 0 ? '↑' : '↓'}{Math.abs(mom)}%
                  </td>
                  <td className={`yoy ${arrowClass(yoy)}`}>
                    {yoy >= 0 ? '↑' : '↓'}{Math.abs(yoy)}%
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}
