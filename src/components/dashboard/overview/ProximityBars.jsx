'use client';

import { Panel, PanelHeader, PanelBody } from '../Panel';
import Delta from '../Delta';
import { useClient } from '../ClientContext';
import { PROXIMITY } from '@/lib/data/leads';

/**
 * Visitor proximity bars + local-share summary.
 * Pass `bands`, `localShare`, `localShareMoM`, `localShareYoY` as props once
 * you wire it to Supabase; defaults render an empty (zeroed) state.
 */
export default function ProximityBars({
  bands = PROXIMITY,
  localShare = 0,
  localShareMoM = 0,
  localShareYoY = 0,
}) {
  const { config } = useClient();

  return (
    <Panel>
      <PanelHeader
        title="Visitor Proximity"
        badge={{ label: config.locLabel, bg: 'var(--od)', color: 'var(--orange)' }}
      />
      <PanelBody>
        {bands.map((p) => (
          <div key={p.label} className="rr">
            <div className="rrl">{p.label}</div>
            <div className="rrbg">
              <div
                className="rrb"
                style={{
                  width: `${p.pct}%`,
                  background: p.color,
                  border: p.faded ? '1px solid var(--bd2)' : undefined,
                }}
              />
            </div>
            <div className="rrv">{p.value.toLocaleString()}</div>
            <div className="rrp">{p.pct}%</div>
          </div>
        ))}

        <div style={{ marginTop: '.75rem', paddingTop: '.625rem', borderTop: '1px solid var(--bd)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <div
              style={{
                flex: 1,
                background: 'var(--s3)',
                borderRadius: 3,
                height: 6,
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  width: `${Math.max(0, Math.min(100, localShare))}%`,
                  height: '100%',
                  borderRadius: 3,
                  background: 'linear-gradient(90deg, var(--acc), var(--green))',
                }}
              />
            </div>
            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--acc)' }}>
              {localShare}% local
            </span>
          </div>
          <div style={{ fontSize: 10, color: 'var(--t3)', marginTop: 3 }}>
            MoM: <Delta value={localShareMoM} format="pp" size={10} /> &nbsp; YoY:{' '}
            <Delta value={localShareYoY} format="pp" size={10} />
          </div>
        </div>
      </PanelBody>
    </Panel>
  );
}
