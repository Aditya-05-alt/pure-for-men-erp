import { memo } from 'react';
import Delta from './Delta';

function KpiCard({ label, value, mom, yoy, color = 'var(--acc)', momFormat = 'pct', yoyFormat = 'pct' }) {
  return (
    <div className="kpi" style={{ '--kc': color }}>
      <div className="kpi-l">{label}</div>
      <div className="kpi-v">{value}</div>
      <div className="kpi-s">
        <Delta value={mom} format={momFormat} /> MoM &nbsp;
        <Delta value={yoy} format={yoyFormat} size={9} /> YoY
      </div>
    </div>
  );
}

export default memo(KpiCard);
