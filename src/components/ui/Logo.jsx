export default function Logo({ size = 'md', showText = true }) {
  const dims = size === 'lg' ? 36 : size === 'sm' ? 22 : 28;
  const iconDims = size === 'lg' ? 18 : size === 'sm' ? 12 : 15;

  return (
    <div className="flex items-center gap-2 select-none">
      <div
        className="flex items-center justify-center rounded-[8px] shrink-0"
        style={{
          width: dims,
          height: dims,
          background: 'var(--acc)',
          boxShadow: '0 6px 18px -6px rgba(200,232,122,.45)',
        }}
      >
        <svg width={iconDims} height={iconDims} viewBox="0 0 16 16" fill="none">
          <path
            d="M2 12L6 7L9 10L13 4"
            stroke="#14171C"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
      {showText && (
        <span
          className="font-display font-bold tracking-tight"
          style={{
            fontSize: size === 'lg' ? 18 : size === 'sm' ? 13 : 15,
            color: 'var(--t)',
          }}
        >
          SmartAnalytics
        </span>
      )}
    </div>
  );
}
