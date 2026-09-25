'use client';

import { memo } from 'react';
import { useTheme } from './ThemeProvider';

const SunIcon = memo(function SunIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
    </svg>
  );
});

const MoonIcon = memo(function MoonIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
});

/**
 * Theme toggle button.
 * Variants:
 *   - "icon" (default): just the sun/moon glyph in a square
 *   - "pill": sun/moon + label, sized for the topbar
 */
function ThemeToggle({ variant = 'icon', className = '' }) {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';

  const label = isDark ? 'Light' : 'Dark';
  const next = isDark ? 'light' : 'dark';

  if (variant === 'pill') {
    return (
      <button
        type="button"
        onClick={toggleTheme}
        aria-label={`Switch to ${next} mode`}
        title={`Switch to ${next} mode`}
        className={`tb-btn ${className}`}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
        }}
      >
        {isDark ? <SunIcon /> : <MoonIcon />}
        <span>{label}</span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={`Switch to ${next} mode`}
      title={`Switch to ${next} mode`}
      className={className}
      style={{
        width: 32,
        height: 32,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--s3)',
        border: '1px solid var(--bd)',
        borderRadius: 8,
        color: 'var(--t2)',
        cursor: 'pointer',
        transition: 'color .15s, border-color .15s, background-color .15s',
      }}
    >
      {isDark ? <SunIcon /> : <MoonIcon />}
    </button>
  );
}

export default memo(ThemeToggle);
