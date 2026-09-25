'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { formatMonthKey, monthKeyFromISO } from '@/lib/overview/comparePeriod';

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

function startOfMonth(d) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function addMonths(d, n) {
  return new Date(d.getFullYear(), d.getMonth() + n, 1);
}

function sameYMD(a, b) {
  return !!a && !!b && ymd(a) === ymd(b);
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

const POP_W = 520;
const POP_H = 340;

/**
 * Pick a full calendar month — click any day in the month grid.
 */
export default function CompareMonthPicker({ value, onChange, disabled = false }) {
  const [open, setOpen] = useState(false);
  const [popPos, setPopPos] = useState({ top: 0, left: 0 });
  const [hoverMonth, setHoverMonth] = useState(value || null);
  const triggerRef = useRef(null);
  const popRef = useRef(null);

  const close = useCallback(() => setOpen(false), []);
  const toggle = useCallback(() => {
    if (disabled) return;
    setOpen((o) => !o);
  }, [disabled]);

  useEffect(() => {
    if (!open) return undefined;
    function onPointer(e) {
      if (triggerRef.current?.contains(e.target)) return;
      if (popRef.current?.contains(e.target)) return;
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
    const padPx = 12;
    const r = triggerRef.current.getBoundingClientRect();
    let left = r.right - POP_W;
    left = Math.min(left, window.innerWidth - POP_W - padPx);
    left = Math.max(padPx, left);
    let top = r.bottom + 8;
    if (top + POP_H > window.innerHeight - padPx) {
      top = Math.max(padPx, r.top - POP_H - 8);
    }
    setPopPos({ top, left });
  }, [open]);

  const today = useMemo(() => {
    const t = new Date();
    t.setHours(0, 0, 0, 0);
    return t;
  }, []);

  const [leftMonth, setLeftMonth] = useState(() => {
    if (value) {
      const [y, m] = value.split('-').map(Number);
      return startOfMonth(new Date(y, m - 1, 1));
    }
    return addMonths(startOfMonth(today), -1);
  });

  useEffect(() => {
    if (!open) return;
    setHoverMonth(value || null);
    if (value) {
      const [y, m] = value.split('-').map(Number);
      setLeftMonth(startOfMonth(new Date(y, m - 1, 1)));
    }
  }, [open, value]);

  const rightMonth = useMemo(() => addMonths(leftMonth, 1), [leftMonth]);
  const leftCells = useMemo(() => buildMonthGrid(leftMonth), [leftMonth]);
  const rightCells = useMemo(() => buildMonthGrid(rightMonth), [rightMonth]);

  function pickMonth(d) {
    const key = monthKeyFromISO(ymd(d));
    setHoverMonth(key);
  }

  function applyMonth() {
    if (!hoverMonth) return;
    onChange(hoverMonth);
    close();
  }

  const label = value ? formatMonthKey(value) : 'Select month';

  const popup = open && (
    <div
      ref={popRef}
      className="cdr-pop cdr-pop--compare animate-fade-in"
      style={{ top: popPos.top, left: popPos.left, width: POP_W }}
      role="dialog"
      aria-label="Compare month"
    >
      <div className="cdr-compare-hint">
        Click any day to select that full month for comparison.
      </div>
      <div className="cdr-cals cdr-cals--compare">
        <CompareCalendarMonth
          cells={leftCells}
          monthDate={leftMonth}
          selectedMonth={hoverMonth}
          today={today}
          onCellClick={pickMonth}
          onPrev={() => setLeftMonth(addMonths(leftMonth, -1))}
          onNext={() => setLeftMonth(addMonths(leftMonth, 1))}
          hideRightArrow
        />
        <CompareCalendarMonth
          cells={rightCells}
          monthDate={rightMonth}
          selectedMonth={hoverMonth}
          today={today}
          onCellClick={pickMonth}
          onPrev={() => setLeftMonth(addMonths(leftMonth, -1))}
          onNext={() => setLeftMonth(addMonths(leftMonth, 1))}
          hideLeftArrow
        />
      </div>
      <div className="cdr-status">
        <div className="cdr-status-chip">
          {hoverMonth ? formatMonthKey(hoverMonth) : 'No month selected'}
        </div>
      </div>
      <div className="cdr-foot">
        <div className="cdr-foot-left">
          <span className="cdr-hint">Compare period = full calendar month</span>
        </div>
        <div className="cdr-actions">
          <button type="button" className="cdr-btn cdr-btn-ghost" onClick={close}>
            Cancel
          </button>
          <button
            type="button"
            className="cdr-btn cdr-btn-primary"
            onClick={applyMonth}
            disabled={!hoverMonth}
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div ref={triggerRef} className="cdr-wrap compare-month-wrap">
      <div
        className={`dr-trigger compare-month-trigger ${disabled ? 'dr-trigger--disabled' : ''}`}
        onClick={toggle}
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-disabled={disabled}
      >
        <span className="dr-ico" aria-hidden>📆</span>
        <span className="dr-label">{label}</span>
        <span className="dr-arr">▾</span>
      </div>
      {typeof document !== 'undefined' && popup ? createPortal(popup, document.body) : null}
    </div>
  );
}

function CompareCalendarMonth({
  cells,
  monthDate,
  selectedMonth,
  today,
  onCellClick,
  onPrev,
  onNext,
  hideLeftArrow,
  hideRightArrow,
}) {
  const monthKey = `${monthDate.getFullYear()}-${pad(monthDate.getMonth() + 1)}`;
  const isSelectedMonth = selectedMonth === monthKey;

  return (
    <div className={`cdr-cal ${isSelectedMonth ? 'cdr-cal--selected-month' : ''}`}>
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
          const outside = d.getMonth() !== monthDate.getMonth();
          const cellMonth = monthKeyFromISO(ymd(d));
          const isSelected = selectedMonth === cellMonth;
          const isToday = sameYMD(d, today);
          const cls = [
            'cdr-cell',
            outside ? 'out' : '',
            isSelected && !outside ? 'compare-month-sel' : '',
            isToday ? 'today' : '',
          ]
            .filter(Boolean)
            .join(' ');
          return (
            <button
              key={i}
              type="button"
              className={cls}
              onClick={() => !outside && onCellClick(d)}
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
