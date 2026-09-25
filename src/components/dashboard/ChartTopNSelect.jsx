'use client';

/**
 * All / Top 5 / Top 10 for breakdown charts (`null` = All).
 */
export default function ChartTopNSelect({
  value = null,
  onChange,
  ariaLabel = 'Chart limit',
  className = 'make-breakdown-select breakdown-top-select',
}) {
  const strValue = value == null ? 'all' : String(value);

  return (
    <select
      className={className}
      value={strValue}
      onChange={(e) => {
        const v = e.target.value;
        onChange(v === 'all' ? null : Number(v));
      }}
      aria-label={ariaLabel}
    >
      <option value="all">All</option>
      <option value="5">Top 5</option>
      <option value="10">Top 10</option>
    </select>
  );
}
