'use client';

import { useEffect, useState } from 'react';
import { FORM_FIELDS, emptyFormState, rowToFormState } from '@/lib/vdpLogics/fields';

function VdpLogicPatternsEditor({ patterns, onChange }) {
  const updatePattern = (index, value) => {
    onChange(patterns.map((p, i) => (i === index ? value : p)));
  };

  const addPattern = () => {
    onChange([...patterns, '']);
  };

  const removePattern = (index) => {
    if (patterns.length <= 1) {
      onChange(['']);
      return;
    }
    onChange(patterns.filter((_, i) => i !== index));
  };

  return (
    <div className="vdp-logics-field--wide vdp-logics-vdp-patterns">
      <div className="vdp-logics-vdp-patterns-head">
        <span className="admin-date-label">VDP logic</span>
        <span className="vdp-logics-vdp-patterns-hint">
          Add multiple URL patterns — saved as OR rules for Step 2 filtration.
        </span>
      </div>
      {patterns.map((pattern, index) => (
        <div key={`vdp-pattern-${index}`} className="vdp-logics-pattern-row">
          <textarea
            className="vdp-logics-textarea vdp-logics-pattern-input"
            rows={2}
            value={pattern}
            placeholder="e.g. ^/product/(new|used)-"
            onChange={(e) => updatePattern(index, e.target.value)}
          />
          <div className="vdp-logics-pattern-actions">
            {patterns.length > 1 && (
              <button
                type="button"
                className="vdp-logics-pattern-btn vdp-logics-pattern-btn--remove"
                aria-label={`Remove VDP logic ${index + 1}`}
                onClick={() => removePattern(index)}
              >
                −
              </button>
            )}
            {index === patterns.length - 1 && (
              <button
                type="button"
                className="vdp-logics-pattern-btn vdp-logics-pattern-btn--add"
                aria-label="Add another VDP logic"
                onClick={addPattern}
              >
                +
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function VdpLogicsFormModal({
  open,
  mode,
  initialRow,
  saving,
  onClose,
  onSave,
}) {
  const [form, setForm] = useState(emptyFormState());
  const [localError, setLocalError] = useState(null);

  useEffect(() => {
    if (!open) return;
    setForm(rowToFormState(initialRow));
    setLocalError(null);
  }, [open, initialRow]);

  if (!open) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLocalError(null);
    if (!form.dealerName?.trim()) {
      setLocalError('Dealer name is required.');
      return;
    }
    try {
      await onSave(form);
    } catch (err) {
      setLocalError(err?.message || 'Save failed.');
    }
  };

  const standardFields = FORM_FIELDS.filter((f) => !f.multiPattern);

  return (
    <div className="vdp-logics-modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="vdp-logics-modal"
        role="dialog"
        aria-labelledby="vdp-logics-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="vdp-logics-modal-head">
          <h2 id="vdp-logics-modal-title">
            {mode === 'edit' ? 'Edit VDP logic' : 'Add VDP logic'}
          </h2>
          <button type="button" className="vdp-logics-modal-close" onClick={onClose}>
            ×
          </button>
        </header>

        <form className="vdp-logics-modal-form" onSubmit={handleSubmit}>
          <div className="vdp-logics-modal-grid">
            <VdpLogicPatternsEditor
              patterns={form.vdpLogicPatterns || ['']}
              onChange={(vdpLogicPatterns) =>
                setForm((prev) => ({ ...prev, vdpLogicPatterns }))
              }
            />

            {standardFields
              .filter((f) => !f.readOnly)
              .map((f) => (
              <label key={f.key} className={f.wide ? 'vdp-logics-field--wide' : ''}>
                <span className="admin-date-label">
                  {f.label}
                  {f.requiredFlag ? ' *' : ''}
                </span>
                {f.wide ? (
                  <textarea
                    className="vdp-logics-textarea"
                    rows={3}
                    value={form[f.key]}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, [f.key]: e.target.value }))
                    }
                  />
                ) : (
                  <input
                    type="text"
                    className="admin-date-input"
                    value={form[f.key]}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, [f.key]: e.target.value }))
                    }
                  />
                )}
              </label>
            ))}
            <p className="vdp-logics-field-note vdp-logics-field--wide">
              Scrap is set automatically to <strong>on</strong> or <strong>off</strong> when{' '}
              <code>smart_scrap_inventory</code> has rows for this dealer&apos;s{' '}
              <code>dealer_id</code> (refresh VDP Logics list to sync).
            </p>
          </div>

          {localError && <p className="vdp-logics-modal-error">{localError}</p>}

          <footer className="vdp-logics-modal-foot">
            <button type="button" className="ga4-count-export-btn" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="ga4-count-export-btn vdp-logics-btn-primary" disabled={saving}>
              {saving ? 'Saving…' : mode === 'edit' ? 'Save changes' : 'Create'}
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
}
