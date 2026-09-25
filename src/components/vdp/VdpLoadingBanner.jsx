'use client';

/** Visible loading status for VDP pages (matches VDP blue accent). */
export default function VdpLoadingBanner({
  active,
  label = 'Loading data…',
  detail = null,
}) {
  if (!active) return null;
  return (
    <div className="vdp-load-banner" role="status" aria-live="polite" aria-busy="true">
      <span className="vdp-load-spinner" aria-hidden="true" />
      <div className="vdp-load-text">
        <strong>{label}</strong>
        {detail ? <span className="vdp-load-detail">{detail}</span> : null}
      </div>
    </div>
  );
}

/** Inline block placeholder used inside cards while first load. */
export function VdpLoadingBlock({ label = 'Loading…', minHeight = 120 }) {
  return (
    <div className="vdp-load-block" style={{ minHeight }} role="status" aria-busy="true">
      <span className="vdp-load-spinner" aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}

/**
 * Centered white card loader.
 * Shows "Loading..." plus percent in primary blue.
 * freeze=true covers the viewport and blocks interaction until dismissed.
 */
export function VdpLoadingCard({
  active,
  label = 'Loading...',
  percent = null,
  freeze = false,
}) {
  if (!active) return null;
  const pct =
    percent == null || Number.isNaN(Number(percent))
      ? null
      : Math.max(0, Math.min(100, Math.round(Number(percent))));
  return (
    <div
      className={`vdp-load-card-overlay${freeze ? ' vdp-load-card-overlay--freeze' : ''}`}
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="vdp-load-card">
        <span className="vdp-load-card-spinner" aria-hidden="true" />
        <span className="vdp-load-card-label">{label}</span>
        {pct != null ? (
          <span className="vdp-load-card-pct">{pct}%</span>
        ) : null}
      </div>
    </div>
  );
}
