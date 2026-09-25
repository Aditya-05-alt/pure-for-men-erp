'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const DOW = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];

function pad(n) {
  return String(n).padStart(2, '0');
}

function ymd(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function parseISO(s) {
  if (!s) return null;
  const d = new Date(`${s}T00:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function startOfMonth(d) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function addMonths(d, n) {
  return new Date(d.getFullYear(), d.getMonth() + n, 1);
}

function nDaysAgo(d, n) {
  const x = new Date(d);
  x.setDate(x.getDate() - n);
  return x;
}

function sameYMD(a, b) {
  return !!a && !!b && ymd(a) === ymd(b);
}

function inISORange(d, startISO, endISO) {
  if (!startISO || !endISO) return false;
  const k = ymd(d);
  return k >= startISO && k <= endISO;
}

function buildMonthGrid(monthDate) {
  const first = startOfMonth(monthDate);
  const firstDow = first.getDay();
  const start = new Date(first);
  start.setDate(start.getDate() - firstDow);
  const cells = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    cells.push(d);
  }
  return cells;
}

function yearPresets(today) {
  const endYear = today.getFullYear();
  const years = [];
  for (let y = endYear; y >= 2020; y -= 1) {
    years.push({
      id: `year_${y}`,
      label: String(y),
      from: `${y}-01-01`,
      to: y === endYear ? ymd(today) : `${y}-12-31`,
      group: 'year',
    });
  }
  return years;
}

function presetsFor(today) {
  const lastMonthEnd = new Date(today.getFullYear(), today.getMonth(), 0);
  const lastMonthStart = new Date(lastMonthEnd.getFullYear(), lastMonthEnd.getMonth(), 1);
  const lastYear = today.getFullYear() - 1;
  const monthStart = ymd(startOfMonth(today));
  return [
    { id: 'all',           label: 'All Data',      from: '2020-01-01',             to: ymd(today) },
    { id: 'current_month', label: 'Current Month', from: monthStart,             to: ymd(today) },
    ...yearPresets(today),
    { id: 'last_year', label: `Last year (${lastYear})`, from: `${lastYear}-01-01`, to: `${lastYear}-12-31` },
    { id: 'today',     label: 'Today',        from: ymd(today),                   to: ymd(today) },
    { id: 'yesterday', label: 'Yesterday',    from: ymd(nDaysAgo(today, 1)),      to: ymd(nDaysAgo(today, 1)) },
    { id: '7d',        label: 'Last 7 Days',  from: ymd(nDaysAgo(today, 6)),      to: ymd(today) },
    { id: '14d',       label: 'Last 14 Days', from: ymd(nDaysAgo(today, 13)),     to: ymd(today) },
    { id: '30d',       label: 'Last 30 Days', from: ymd(nDaysAgo(today, 29)),     to: ymd(today) },
    { id: 'last_mtd',  label: 'Last Month',   from: ymd(lastMonthStart),          to: ymd(lastMonthEnd) },
    { id: 'custom',    label: 'Custom',       from: null,                         to: null },
  ];
}

function findMatchingPreset(presets, startISO, endISO) {
  if (!startISO || !endISO) return null;
  const match = presets.find((p) => p.from === startISO && p.to === endISO);
  return match ? match.id : 'custom';
}

function formatRangeShort(startISO, endISO) {
  const a = parseISO(startISO);
  const b = parseISO(endISO);
  if (!a || !b) return '';
  const fmt = (d) => d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  if (a.getFullYear() === b.getFullYear()) {
    return sameYMD(a, b)
      ? `${fmt(a)}, ${a.getFullYear()}`
      : `${fmt(a)} – ${fmt(b)}, ${b.getFullYear()}`;
  }
  return `${fmt(a)}, ${a.getFullYear()} – ${fmt(b)}, ${b.getFullYear()}`;
}

function triggerLabelFor(value, presets) {
  if (!value) return 'Select range';
  if (typeof value === 'string') {
    const p = presets.find((x) => x.id === value);
    return p ? p.label : value;
  }
  if (typeof value === 'object' && value.start && value.end) {
    if (value.preset && value.preset !== 'custom') {
      const p = presets.find((x) => x.id === value.preset);
      if (p) return p.label;
    }
    return formatRangeShort(value.start, value.end);
  }
  return 'Select range';
}

const POP_W = 680;
const POP_H = 420;

/** Resolve preset id or range object to { start, end, preset }. */
export function resolveRangePickerValue(value) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const presets = presetsFor(today);

  if (typeof value === 'string') {
    const p = presets.find((x) => x.id === value);
    if (!p?.from || !p?.to) return null;
    return { start: p.from, end: p.to, preset: value };
  }

  if (typeof value === 'object' && value?.start && value?.end) {
    return {
      start: value.start,
      end: value.end,
      preset: value.preset || findMatchingPreset(presets, value.start, value.end) || 'custom',
    };
  }

  return null;
}

/** Build picker value from ISO from/to (shows matching preset label when possible). */
export function rangePickerValueFromISO(from, to) {
  if (!from || !to) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const presets = presetsFor(today);
  const preset = findMatchingPreset(presets, from, to) || 'custom';
  return { start: from, end: to, preset };
}

/**
 * @param {object} [props.comparePeriod]
 * @param {boolean} props.comparePeriod.enabled
 * @param {() => void} props.comparePeriod.onToggle
 * @param {unknown} [props.comparePeriod.value]
 * @param {(next: unknown) => void} [props.comparePeriod.onChange]
 */
export default function CalendarRangePicker({
  value,
  onChange,
  popClassName = '',
  comparePeriod = null,
}) {
  const [open, setOpen] = useState(false);
  const [popPos, setPopPos] = useState({ top: 0, left: 0 });
  const triggerRef = useRef(null);
  const popRef = useRef(null);
  const showCompare = Boolean(comparePeriod);

  const close = useCallback(() => setOpen(false), []);
  const toggle = useCallback(() => setOpen((o) => !o), []);

  useEffect(() => {
    if (!open) return undefined;
    function onPointer(e) {
      if (triggerRef.current?.contains(e.target)) return;
      if (popRef.current?.contains(e.target)) return;
      // Nested compare calendar also portals a .cdr-pop
      if (e.target?.closest?.('.cdr-pop')) return;
      close();
    }
    function onKey(e) {
      if (e.key === 'Escape') close();
    }
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, close]);

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    const pad = 12;
    const popH = showCompare ? POP_H + 72 : POP_H;
    const r = triggerRef.current.getBoundingClientRect();
    let left = r.right - POP_W;
    left = Math.min(left, window.innerWidth - POP_W - pad);
    left = Math.max(pad, left);
    let top = r.bottom + 8;
    if (top + popH > window.innerHeight - pad) {
      top = Math.max(pad, r.top - popH - 8);
    }
    setPopPos({ top, left });
  }, [open, showCompare]);

  const today = useMemo(() => {
    const t = new Date();
    t.setHours(0, 0, 0, 0);
    return t;
  }, []);

  const presets = useMemo(() => presetsFor(today), [today]);

  const incoming = useMemo(() => {
    if (typeof value === 'string') {
      const p = presets.find((x) => x.id === value);
      return p ? { start: p.from, end: p.to, preset: value } : { start: null, end: null, preset: null };
    }
    if (typeof value === 'object' && value?.start && value?.end) {
      return { start: value.start, end: value.end, preset: value.preset || 'custom' };
    }
    return { start: null, end: null, preset: null };
  }, [value, presets]);

  const [tempStart, setTempStart] = useState(incoming.start);
  const [tempEnd, setTempEnd]     = useState(incoming.end);
  const [selectedPreset, setSelectedPreset] = useState(incoming.preset);
  const [leftMonth, setLeftMonth] = useState(() => {
    const base = parseISO(incoming.start) || addMonths(today, -1);
    return startOfMonth(base);
  });

  useEffect(() => {
    if (!open) return;
    setTempStart(incoming.start);
    setTempEnd(incoming.end);
    setSelectedPreset(incoming.preset || (incoming.start ? 'custom' : null));
    const base = parseISO(incoming.start) || addMonths(today, -1);
    setLeftMonth(startOfMonth(base));
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const rightMonth = useMemo(() => addMonths(leftMonth, 1), [leftMonth]);
  const leftCells  = useMemo(() => buildMonthGrid(leftMonth),  [leftMonth]);
  const rightCells = useMemo(() => buildMonthGrid(rightMonth), [rightMonth]);

  function handlePresetClick(p) {
    setSelectedPreset(p.id);
    if (p.id === 'custom') return;
    setTempStart(p.from);
    setTempEnd(p.to);
    const startD = parseISO(p.from);
    if (startD) setLeftMonth(startOfMonth(startD));
  }

  function handleCellClick(d) {
    const iso = ymd(d);
    if (!tempStart || (tempStart && tempEnd)) {
      setTempStart(iso);
      setTempEnd(null);
      setSelectedPreset('custom');
      return;
    }
    if (iso < tempStart) {
      setTempEnd(tempStart);
      setTempStart(iso);
    } else {
      setTempEnd(iso);
    }
    const matched = findMatchingPreset(presets, iso < tempStart ? iso : tempStart, iso < tempStart ? tempStart : iso);
    setSelectedPreset(matched);
  }

  function applyRange() {
    if (!tempStart || !tempEnd) return;
    const matched = findMatchingPreset(presets, tempStart, tempEnd) || 'custom';
    if (matched && matched !== 'custom') {
      onChange(matched);
    } else {
      onChange({ preset: 'custom', start: tempStart, end: tempEnd });
    }
    close();
  }

  function cancel() {
    close();
  }

  const statusText = useMemo(() => {
    if (tempStart && tempEnd) return formatRangeShort(tempStart, tempEnd);
    if (tempStart) return 'Select end date';
    return 'No range selected';
  }, [tempStart, tempEnd]);

  const hintText = useMemo(() => {
    if (tempStart && tempEnd) return formatRangeShort(tempStart, tempEnd);
    if (tempStart) return 'Select end date';
    return 'Select start date';
  }, [tempStart, tempEnd]);

  const popup = open && (
    <div
      ref={popRef}
      className={`cdr-pop animate-fade-in${popClassName ? ` ${popClassName}` : ''}`}
      style={{ top: popPos.top, left: popPos.left }}
      role="dialog"
      aria-label="Date range"
    >
          <div className="cdr-body">
            <ul className="cdr-presets">
              {presets.map((p, i) => {
                const prev = presets[i - 1];
                const showYearHdr = p.group === 'year' && prev?.group !== 'year';
                return (
                  <li key={p.id}>
                    {showYearHdr && <div className="cdr-preset-hdr">Years</div>}
                    <div
                      className={`cdr-preset ${selectedPreset === p.id ? 'sel' : ''}`}
                      onClick={() => handlePresetClick(p)}
                      role="button"
                      tabIndex={0}
                    >
                      {p.label}
                    </div>
                  </li>
                );
              })}
            </ul>

            <div className="cdr-cals">
              <CalendarMonth
                cells={leftCells}
                monthDate={leftMonth}
                start={tempStart}
                end={tempEnd}
                today={today}
                onCellClick={handleCellClick}
                onPrev={() => setLeftMonth(addMonths(leftMonth, -1))}
                onNext={() => setLeftMonth(addMonths(leftMonth, 1))}
                hideRightArrow
              />
              <CalendarMonth
                cells={rightCells}
                monthDate={rightMonth}
                start={tempStart}
                end={tempEnd}
                today={today}
                onCellClick={handleCellClick}
                onPrev={() => setLeftMonth(addMonths(leftMonth, -1))}
                onNext={() => setLeftMonth(addMonths(leftMonth, 1))}
                hideLeftArrow
              />
            </div>
          </div>

          <div className="cdr-status">
            <div className="cdr-status-chip">{statusText}</div>
          </div>

          {showCompare && (
            <div className="cdr-compare">
              <label className="cdr-compare-switch">
                <span className="cdr-compare-label">Compare period</span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={Boolean(comparePeriod.enabled)}
                  className={`cdr-compare-track${comparePeriod.enabled ? ' on' : ''}`}
                  onClick={(e) => {
                    e.preventDefault();
                    comparePeriod.onToggle?.();
                  }}
                >
                  <span className="cdr-compare-thumb" />
                </button>
              </label>
              {comparePeriod.enabled && typeof comparePeriod.onChange === 'function' && (
                <div className="cdr-compare-range">
                  <span className="cdr-compare-range-lbl">Prior range</span>
                  <CalendarRangePicker
                    value={comparePeriod.value}
                    onChange={comparePeriod.onChange}
                    popClassName={popClassName}
                  />
                </div>
              )}
            </div>
          )}

          <div className="cdr-foot">
            <div className="cdr-foot-left">
              <span className="cdr-tag">🕒 UTC</span>
              <span className="cdr-hint">{hintText}</span>
            </div>
            <div className="cdr-actions">
              <button type="button" className="cdr-btn cdr-btn-ghost" onClick={cancel}>
                Cancel
              </button>
              <button
                type="button"
                className="cdr-btn cdr-btn-primary"
                onClick={applyRange}
                disabled={!tempStart || !tempEnd}
              >
                Apply Range
              </button>
            </div>
          </div>
    </div>
  );

  return (
    <div ref={triggerRef} className="cdr-wrap">
      <div className="dr-trigger" onClick={toggle} role="button" tabIndex={0}>
        <span className="dr-ico" aria-hidden>📅</span>
        <span className="dr-label">{triggerLabelFor(value, presets)}</span>
        <span className="dr-arr">▾</span>
      </div>
      {typeof document !== 'undefined' && popup
        ? createPortal(popup, document.body)
        : null}
    </div>
  );
}

function CalendarMonth({
  cells,
  monthDate,
  start,
  end,
  today,
  onCellClick,
  onPrev,
  onNext,
  hideLeftArrow,
  hideRightArrow,
}) {
  return (
    <div className="cdr-cal">
      <div className="cdr-cal-head">
        {hideLeftArrow ? (
          <span className="cdr-nav cdr-nav-empty" aria-hidden />
        ) : (
          <button type="button" className="cdr-nav" onClick={onPrev} aria-label="Previous month">
            ‹
          </button>
        )}
        <div className="cdr-cal-title">
          {MONTH_NAMES[monthDate.getMonth()]} {monthDate.getFullYear()}
        </div>
        {hideRightArrow ? (
          <span className="cdr-nav cdr-nav-empty" aria-hidden />
        ) : (
          <button type="button" className="cdr-nav" onClick={onNext} aria-label="Next month">
            ›
          </button>
        )}
      </div>

      <div className="cdr-dow">
        {DOW.map((d) => (
          <div key={d} className="cdr-dow-cell">{d}</div>
        ))}
      </div>

      <div className="cdr-cells">
        {cells.map((d, i) => {
          const outside  = d.getMonth() !== monthDate.getMonth();
          const isStart  = sameYMD(d, parseISO(start));
          const isEnd    = sameYMD(d, parseISO(end));
          const inRng    = !outside && inISORange(d, start, end);
          const isToday  = sameYMD(d, today);
          const cls = [
            'cdr-cell',
            outside ? 'out' : '',
            inRng ? 'rng' : '',
            isStart ? 'start' : '',
            isEnd ? 'end' : '',
            isToday ? 'today' : '',
          ].filter(Boolean).join(' ');
          return (
            <button
              key={i}
              type="button"
              className={cls}
              onClick={() => onCellClick(d)}
              tabIndex={outside ? -1 : 0}
            >
              {d.getDate()}
            </button>
          );
        })}
      </div>
    </div>
  );
}
