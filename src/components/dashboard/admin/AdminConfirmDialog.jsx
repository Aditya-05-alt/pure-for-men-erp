'use client';

import { useEffect } from 'react';

export default function AdminConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  danger = false,
  loading = false,
  onConfirm,
  onCancel,
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === 'Escape' && !loading) onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, loading, onCancel]);

  if (!open) return null;

  return (
    <div
      className="vdp-logics-modal-backdrop"
      role="presentation"
      onClick={loading ? undefined : onCancel}
    >
      <div
        className="vdp-logics-modal admin-confirm-modal"
        role="alertdialog"
        aria-labelledby="admin-confirm-title"
        aria-describedby="admin-confirm-message"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="admin-confirm-head">
          <h2 id="admin-confirm-title">{title}</h2>
          <button
            type="button"
            className="admin-confirm-close"
            onClick={onCancel}
            disabled={loading}
            aria-label="Close"
          >
            ×
          </button>
        </header>
        <div className="admin-confirm-content">
          <p id="admin-confirm-message" className="admin-confirm-body">
            {message}
          </p>
        </div>
        <footer className="admin-confirm-foot">
          <button
            type="button"
            className="ga4-count-export-btn"
            onClick={onCancel}
            disabled={loading}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            className={`ga4-count-export-btn vdp-logics-btn-primary${danger ? ' vdp-logics-btn-danger' : ''}`}
            onClick={onConfirm}
            disabled={loading}
          >
            {loading ? 'Working…' : confirmLabel}
          </button>
        </footer>
      </div>
    </div>
  );
}
