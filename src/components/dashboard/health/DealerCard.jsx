import { memo } from 'react';
import Delta from '../Delta';

function bucketOf(delta) {
  if (delta <= -10) return 'dn';
  if (delta >= 10) return 'up';
  return 'ok';
}

const CARD_CLS  = { dn: 'dc-card-dn', ok: 'dc-card-ok', up: 'dc-card-up' };
const DELTA_CLS = { dn: 'dcc-delta-dn', ok: 'dcc-delta-ok', up: 'dcc-delta-up' };
const COLOR     = { dn: 'var(--red)', ok: 'var(--yellow)', up: 'var(--green)' };

function pct(a, b) {
  return b > 0 ? Math.round(((a - b) / b) * 100) : 0;
}

function DealerCard({ d }) {
  const b = bucketOf(d.delta);
  const max = Math.max(...d.spark);
  const yoy = pct(d.cur, d.ly);

  return (
    <div className={`dc-card ${CARD_CLS[b]}`}>
      <div className="dcc-top">
        <div className="dcc-name">{d.name}</div>
        <span
          className="dcc-cat"
          style={{ background: `${d.catColor}22`, color: d.catColor }}
        >
          {d.cat.toUpperCase()}
        </span>
      </div>
      <div className={`dcc-delta ${DELTA_CLS[b]}`}>
        {d.delta > 0 ? '+' : ''}{d.delta}% MoM
      </div>
      <div className="dcc-nums">
        <div className="dcc-num">
          <div className="dcc-num-label">Apr ’26</div>
          <div className="dcc-num-val">{(d.cur / 1000).toFixed(1)}k</div>
        </div>
        <div className="dcc-num">
          <div className="dcc-num-label">Mar ’26</div>
          <div className="dcc-num-val">{(d.prev / 1000).toFixed(1)}k</div>
        </div>
        <div className="dcc-num">
          <div className="dcc-num-label">Apr ’25</div>
          <div className="dcc-num-val">{(d.ly / 1000).toFixed(1)}k</div>
        </div>
      </div>
      <div className="mini-spark">
        {d.spark.map((v, i) => {
          const h = Math.round((v / max) * 24);
          return (
            <div
              key={i}
              className="ms-b"
              style={{
                height: h,
                background: COLOR[b],
                opacity: 0.4 + (v / max) * 0.6,
              }}
            />
          );
        })}
      </div>
      <div style={{ marginTop: '.375rem', display: 'flex', alignItems: 'center', gap: 6 }}>
        <div className="dcc-channels">
          {d.channels.map((c) => (
            <span key={c} className="dcc-ch">{c}</span>
          ))}
        </div>
        <div style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--t3)' }}>
          YoY <Delta value={yoy} size={9} />
        </div>
      </div>
    </div>
  );
}

export default memo(DealerCard);
