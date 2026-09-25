'use client';

import { useEffect, useMemo, useState } from 'react';
import { useDropdown } from '@/components/dashboard/useDropdown';
import { toCalendarISO } from '@/lib/ga4/dateRange';

function formatDisplayDate(iso) {
  if (!iso) return 'Select date';
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function daysAgoISO(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return toCalendarISO(d);
}

export default function InventoryDatePicker({
  value,
  onChange,
  max,
  disabled = false,
}) {
  const { open, toggle, close, ref } = useDropdown(false, { closeOn: 'click' });
  const today = useMemo(() => toCalendarISO(new Date()), []);
  const maxDate = max ?? today;
  const yesterday = useMemo(() => daysAgoISO(1), []);
  const selectedDate = value || today;

  const [draft, setDraft] = useState(selectedDate);

  useEffect(() => {
    if (!open) return;
    setDraft(selectedDate);
  }, [open, selectedDate]);

  const display = formatDisplayDate(selectedDate);

  const presets = useMemo(
    () => [
      { id: 'today', label: 'Today', date: today },
      { id: 'yesterday', label: 'Yesterday', date: yesterday },
    ],
    [today, yesterday],
  );

  function applyDate(iso) {
    if (disabled) return;
    const date = String(iso || '').slice(0, 10);
    if (!date || date > maxDate) return;
    onChange(date);
    close();
  }

  const applyDraft = draft || selectedDate;
  const canApply = Boolean(applyDraft) && applyDraft <= maxDate;

  return (
    <div
      ref={ref}
      className={`dr-wrap inventory-date-picker${disabled ? ' inventory-date-picker--disabled' : ''}`}
    >
      <div
        className={`dr-trigger${disabled ? ' dr-trigger--disabled' : ''}`}
        onClick={disabled ? undefined : toggle}
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-disabled={disabled}
        onKeyDown={(e) => {
          if (disabled) return;
          if (e.key === 'Enter' || e.key === ' ') toggle();
        }}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <span className="dr-ico" aria-hidden>📅</span>
        <span className="dr-label">{display}</span>
        <span className="dr-arr">▾</span>
      </div>

      {open && !disabled && (
        <div className="dr-menu dr-menu-wide inventory-date-menu" role="menu">
          {presets.map((p) => {
            const isSelected = selectedDate === p.date;
            return (
              <div
                key={p.id}
                className={`dr-item ${isSelected ? 'sel' : ''}`}
                role="menuitem"
                onClick={() => applyDate(p.date)}
              >
                <div className="dr-chk">{isSelected ? '✓' : ''}</div>
                <span>{p.label}</span>
              </div>
            );
          })}

          <div
            className="dr-custom inventory-date-custom"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <label className="dr-field">
              <span>Select date</span>
              <input
                type="date"
                value={applyDraft}
                max={maxDate}
                onChange={(e) => setDraft(e.target.value)}
                aria-label="Inventory report date"
              />
            </label>

            <div className="dr-custom-actions">
              <button type="button" className="dr-btn dr-btn-ghost" onClick={close}>
                Cancel
              </button>
              <button
                type="button"
                className="dr-btn dr-btn-primary"
                onClick={() => applyDate(applyDraft)}
                disabled={!canApply}
              >
                Apply
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
