'use client';

import { memo } from 'react';

function ChannelGroupToggle({ expanded, onToggle, label }) {
  return (
    <button
      type="button"
      className={`channel-group-toggle${expanded ? ' channel-group-toggle--open' : ''}`}
      onClick={onToggle}
      aria-expanded={expanded}
      aria-label={expanded ? `Collapse ${label}` : `Expand ${label}`}
    >
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
        <polyline points="9 18 15 12 9 6" />
      </svg>
    </button>
  );
}

export default memo(ChannelGroupToggle);
