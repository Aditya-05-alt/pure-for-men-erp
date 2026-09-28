'use client';

import { createPortal } from 'react-dom';
import { useEffect, useState } from 'react';

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
 * Card loader.
 * freeze=true portals to document.body, covers the full viewport, locks scroll,
 * and pins the card near the top so loading stays visible without scrolling.
 */
export function VdpLoadingCard({
  active,
  label = 'Loading...',
  percent = null,
  freeze = false,
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  // Lock page scroll while the freeze overlay is up.
  useEffect(() => {
    if (!active || !freeze || typeof document === 'undefined') return undefined;
    const html = document.documentElement;
    const body = document.body;
    const prevHtmlOverflow = html.style.overflow;
    const prevBodyOverflow = body.style.overflow;
    const prevBodyTouch = body.style.touchAction;
    const prevBodyPadRight = body.style.paddingRight;
    const scrollbarGap = window.innerWidth - html.clientWidth;

    html.style.overflow = 'hidden';
    body.style.overflow = 'hidden';
    body.style.touchAction = 'none';
    if (scrollbarGap > 0) {
      body.style.paddingRight = `${scrollbarGap}px`;
    }
    body.classList.add('vdp-load-freeze-active');

    return () => {
      html.style.overflow = prevHtmlOverflow;
      body.style.overflow = prevBodyOverflow;
      body.style.touchAction = prevBodyTouch;
      body.style.paddingRight = prevBodyPadRight;
      body.classList.remove('vdp-load-freeze-active');
    };
  }, [active, freeze]);

  if (!active) return null;
  const pct =
    percent == null || Number.isNaN(Number(percent))
      ? null
      : Math.max(0, Math.min(100, Math.round(Number(percent))));

  const node = (
    <div
      className={`vdp-load-card-overlay${
        freeze ? ' vdp-load-card-overlay--freeze vdp-load-card-overlay--top' : ''
      }`}
      role="status"
      aria-live="polite"
      aria-busy="true"
      onWheel={(e) => e.preventDefault()}
      onTouchMove={(e) => e.preventDefault()}
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

  if (freeze && mounted && typeof document !== 'undefined') {
    return createPortal(node, document.body);
  }
  return node;
}
