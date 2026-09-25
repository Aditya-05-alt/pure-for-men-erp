'use client';

/**
 * Full-width compare wrapper — compare period (left) + current period (right).
 */
export default function CompareBreakdownSection({ title, headerExtra, children }) {
  return (
    <div className="compare-donut-section compare-breakdown-section">
      <div className="compare-donut-head">
        <div className="compare-donut-title">{title}</div>
        {headerExtra}
      </div>
      <div className="compare-donut-grid">{children}</div>
    </div>
  );
}
