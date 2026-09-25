'use client';

import { forwardRef, useId, useState, memo } from 'react';

const EyeIcon = memo(function EyeIcon({ open }) {
  return open ? (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  ) : (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  );
});

const Input = forwardRef(function Input(
  {
    label,
    type = 'text',
    icon,
    error,
    hint,
    showPasswordToggle = false,
    id: idProp,
    className = '',
    ...rest
  },
  ref
) {
  const autoId = useId();
  const id = idProp || autoId;
  const [show, setShow] = useState(false);
  const effectiveType = showPasswordToggle ? (show ? 'text' : 'password') : type;

  return (
    <div className={className}>
      {label && (
        <label
          htmlFor={id}
          className="block mb-1.5 text-[11px] font-semibold uppercase tracking-wider"
          style={{ color: 'var(--t3)' }}
        >
          {label}
        </label>
      )}
      <div className="field-shell" data-has-error={!!error || undefined}>
        {icon && <span style={{ color: 'var(--t3)', display: 'flex' }}>{icon}</span>}
        <input ref={ref} id={id} type={effectiveType} {...rest} />
        {showPasswordToggle && (
          <button
            type="button"
            onClick={() => setShow((s) => !s)}
            aria-label={show ? 'Hide password' : 'Show password'}
            className="grid place-content-center w-7 h-7 rounded-md transition-colors"
            style={{ color: 'var(--t3)' }}
            tabIndex={-1}
          >
            <EyeIcon open={show} />
          </button>
        )}
      </div>
      {error ? (
        <div className="field-error">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          {error}
        </div>
      ) : hint ? (
        <div className="mt-1 text-[11px]" style={{ color: 'var(--t3)' }}>
          {hint}
        </div>
      ) : null}
    </div>
  );
});

export default Input;
