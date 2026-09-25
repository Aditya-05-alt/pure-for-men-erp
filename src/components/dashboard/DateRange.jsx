'use client';

import { useMemo, useState, useEffect } from 'react';
import { useDropdown } from './useDropdown';

const PRESET_LABELS = {
  today:     'Today',
  yesterday: 'Yesterday',
  '7d':      'Last 7 days',
  '30d':     'Last 30 days',
  '90d':     'Last 90 days',
  mtd:       'Month to date',
  qtd:       'Quarter to date',
  ytd:       'Year to date',
  '12m':     'Last 12 months',
  all:       'All time',
};

const CUSTOM = 'custom';

function normalize(opt) {
  if (typeof opt === 'string') {
    return { value: opt, label: PRESET_LABELS[opt] || opt };
  }
  return {
    value: opt.value,
    label: opt.label ?? PRESET_LABELS[opt.value] ?? opt.value,
  };
}

function isCustomObject(v) {
  return v && typeof v === 'object' && v.preset === CUSTOM;
}

function shortDate(iso) {
  if (!iso) return '';
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatTriggerLabel(value) {
  if (isCustomObject(value)) {
    if (value.start && value.end) return `${shortDate(value.start)} → ${shortDate(value.end)}`;
    return 'Custom range';
  }
  if (typeof value === 'string') return PRESET_LABELS[value] || value;
  return 'Select range';
}

export default function DateRange({
  value,
  onChange,
  options = ['today', '7d', '30d', '90d', 'mtd', 'ytd'],
}) {
  const { open, toggle, close, ref } = useDropdown();

  const items = useMemo(() => {
    const list = options.map(normalize);
    if (!list.find((o) => o.value === CUSTOM)) {
      list.push({ value: CUSTOM, label: 'Custom range…' });
    }
    return list;
  }, [options]);

  const valueIsCustom = isCustomObject(value);
  const currentPreset = valueIsCustom ? CUSTOM : value;

  const [showCustom, setShowCustom] = useState(false);
  const [start, setStart] = useState(valueIsCustom ? value.start || '' : '');
  const [end, setEnd]     = useState(valueIsCustom ? value.end   || '' : '');

  useEffect(() => {
    if (!open) {
      setShowCustom(false);
      if (valueIsCustom) {
        setStart(value.start || '');
        setEnd(value.end || '');
      }
    }
  }, [open, valueIsCustom, value]);

  function handlePresetClick(val) {
    if (val === CUSTOM) {
      setShowCustom(true);
      return;
    }
    onChange(val);
    close();
  }

  function handleApply() {
    if (!start || !end) return;
    const [s, e] = start <= end ? [start, end] : [end, start];
    onChange({ preset: CUSTOM, start: s, end: e });
    close();
  }

  function handleClear() {
    setStart('');
    setEnd('');
  }

  const applyDisabled = !start || !end;

  return (
    <div ref={ref} className="dr-wrap">
      <div className="dr-trigger" onClick={toggle} role="button" tabIndex={0}>
        <span className="dr-ico" aria-hidden>📅</span>
        <span className="dr-label">{formatTriggerLabel(value)}</span>
        <span className="dr-arr">▾</span>
      </div>
      {open && (
        <div className={`dr-menu animate-fade-in ${showCustom ? 'dr-menu-wide' : ''}`}>
          {!showCustom &&
            items.map((o) => {
              const sel =
                (o.value === CUSTOM && valueIsCustom) ||
                (o.value !== CUSTOM && o.value === currentPreset);
              return (
                <div
                  key={o.value}
                  className={`dr-item ${sel ? 'sel' : ''}`}
                  onClick={() => handlePresetClick(o.value)}
                >
                  <div className="dr-chk">{sel ? '✓' : ''}</div>
                  <span>{o.label}</span>
                </div>
              );
            })}

          {showCustom && (
            <div className="dr-custom">
              <div className="dr-custom-head">
                <button
                  type="button"
                  className="dr-back"
                  onClick={() => setShowCustom(false)}
                >
                  ← Back
                </button>
                <span className="dr-custom-title">Custom range</span>
              </div>

              <label className="dr-field">
                <span>Start</span>
                <input
                  type="date"
                  value={start}
                  max={end || undefined}
                  onChange={(e) => setStart(e.target.value)}
                />
              </label>

              <label className="dr-field">
                <span>End</span>
                <input
                  type="date"
                  value={end}
                  min={start || undefined}
                  onChange={(e) => setEnd(e.target.value)}
                />
              </label>

              <div className="dr-custom-actions">
                <button
                  type="button"
                  className="dr-btn dr-btn-ghost"
                  onClick={handleClear}
                  disabled={!start && !end}
                >
                  Clear
                </button>
                <button
                  type="button"
                  className="dr-btn dr-btn-primary"
                  onClick={handleApply}
                  disabled={applyDisabled}
                >
                  Apply
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
