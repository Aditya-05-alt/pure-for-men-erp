import { memo } from 'react';

function classFor(v) {
  if (v > 0) return 'up';
  if (v < 0) return 'dn';
  return 'ne';
}

/**
 * Tiny delta chip → `↑ 8.7%`, `↓ 2.1%`, `↑ 23`.
 *  - value: number (sign determines tone)
 *  - format: 'pct' | 'abs' | 'pp'
 */
function Delta({ value, format = 'pct', size }) {
  const cls = classFor(value);
  const arrow = value > 0 ? '↑' : value < 0 ? '↓' : '–';
  const abs = Math.abs(value);
  let txt;
  if (format === 'pct') txt = `${abs}%`;
  else if (format === 'pp') txt = `${abs}pp`;
  else txt = String(abs);

  return (
    <span className={`delta ${cls}`} style={size ? { fontSize: size } : undefined}>
      {arrow} {txt}
    </span>
  );
}

export default memo(Delta);
