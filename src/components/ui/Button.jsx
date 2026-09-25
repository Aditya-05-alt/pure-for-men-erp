'use client';

import { forwardRef } from 'react';

const Spinner = () => (
  <svg
    className="animate-spin"
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
  >
    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity=".25" strokeWidth="3" />
    <path
      d="M22 12a10 10 0 0 1-10 10"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
    />
  </svg>
);

const Button = forwardRef(function Button(
  { variant = 'primary', loading = false, children, className = '', disabled, ...rest },
  ref
) {
  const base = variant === 'ghost' ? 'btn-ghost' : 'btn-primary';
  return (
    <button
      ref={ref}
      className={`${base} ${className}`}
      disabled={disabled || loading}
      {...rest}
    >
      {loading ? (
        <>
          <Spinner />
          <span>Please wait…</span>
        </>
      ) : (
        children
      )}
    </button>
  );
});

export default Button;
