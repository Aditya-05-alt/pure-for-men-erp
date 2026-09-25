'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

export function Seg({ value, options, onChange }) {
  return (
    <div className="vdp-seg">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          className={value === opt.value ? 'active' : ''}
          onClick={() => onChange(opt.value)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

export function Kpi({ label, value, delta, sub, isPP }) {
  const cls =
    delta == null
      ? 'flat'
      : delta > 5
        ? 'up'
        : delta < -5
          ? 'down'
          : 'flat';
  return (
    <div className="vdp-kpi">
      <div className="vdp-kpi-lbl">{label}</div>
      <div className="vdp-kpi-val mono">{value}</div>
      {delta == null ? (
        <div className="vdp-delta flat">{sub}</div>
      ) : (
        <div className={`vdp-delta ${cls}`}>
          {isPP
            ? `${delta >= 0 ? '+' : ''}${delta.toFixed(1)} pts`
            : `${delta >= 0 ? '+' : ''}${Number(delta).toFixed(1)}%`}{' '}
          {sub}
        </div>
      )}
    </div>
  );
}

export function Card({ title, sub, actions, children, style, className }) {
  const periodSub =
    typeof sub === 'string' && / · (current|prior)\s*$/i.test(sub);
  const subClass = `vdp-cardsub${periodSub ? ' vdp-cardsub--period' : ''}`;

  return (
    <div className={`vdp-card${className ? ` ${className}` : ''}`} style={style}>
      {(title || actions) && (
        <div className="vdp-card-head">
          <div className="vdp-card-head__text">
            {title ? <h3>{title}</h3> : null}
            {sub ? <div className={subClass}>{sub}</div> : null}
          </div>
          {actions ? <div className="vdp-card-head__actions">{actions}</div> : null}
        </div>
      )}
      {!title && !actions && sub ? <div className={subClass}>{sub}</div> : null}
      {children}
    </div>
  );
}

export function Toolbar({ children }) {
  return <div className="vdp-toolbar">{children}</div>;
}

export function ToolbarGroup({ label, children }) {
  return (
    <div className="vdp-grp">
      {label && <label>{label}</label>}
      {children}
    </div>
  );
}

/** Empty selection = all. options: string[] or { value, label }[] */
export function VdpMultiFilter({
  allLabel = 'All',
  noun = 'selected',
  options = [],
  selected = [],
  onChange,
  searchable = true,
  disabled = false,
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const rootRef = useRef(null);

  const items = useMemo(
    () =>
      (options || []).map((o) =>
        typeof o === 'string'
          ? { value: o, label: o }
          : { value: String(o.value), label: String(o.label ?? o.value) }
      ),
    [options]
  );

  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => {
      if (!rootRef.current?.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  useEffect(() => {
    if (!open) setQuery('');
  }, [open]);

  const selectedSet = useMemo(() => new Set(selected || []), [selected]);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (o) =>
        o.label.toLowerCase().includes(q) || o.value.toLowerCase().includes(q)
    );
  }, [items, query]);

  const triggerLabel = !selected?.length
    ? allLabel
    : selected.length === 1
      ? items.find((o) => o.value === selected[0])?.label || selected[0]
      : `${selected.length} ${noun}`;

  const toggleValue = (value) => {
    const next = new Set(selectedSet);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    onChange([...next]);
  };

  return (
    <div className="vdp-dealer-multi vdp-dealer-multi--compact" ref={rootRef}>
      <button
        type="button"
        className={`vdp-dealer-multi-trigger${open ? ' is-open' : ''}${
          selected?.length ? ' is-filtered' : ''
        }`}
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="vdp-dealer-multi-trigger-text">{triggerLabel}</span>
        <span aria-hidden>{open ? '▴' : '▾'}</span>
      </button>
      {open ? (
        <div className="vdp-dealer-multi-pop" role="listbox" aria-multiselectable="true">
          {searchable && items.length > 6 ? (
            <input
              type="search"
              className="vdp-dealer-multi-search"
              placeholder="Search…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoFocus
            />
          ) : null}
          <div className="vdp-dealer-multi-actions">
            <button
              type="button"
              className="vdp-dealer-multi-link"
              onClick={() => onChange(items.map((o) => o.value))}
            >
              Select all
            </button>
            <button
              type="button"
              className="vdp-dealer-multi-link"
              onClick={() => onChange([])}
            >
              Clear
            </button>
            <span className="vdp-dealer-multi-count">
              {selected?.length ? `${selected.length} selected` : 'Showing all'}
            </span>
          </div>
          <ul className="vdp-dealer-multi-list">
            {filtered.length === 0 ? (
              <li className="vdp-dealer-multi-empty">No matches</li>
            ) : (
              filtered.map((o) => {
                const checked = selectedSet.has(o.value);
                return (
                  <li key={o.value}>
                    <label className="vdp-dealer-multi-item">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleValue(o.value)}
                      />
                      <span>{o.label}</span>
                    </label>
                  </li>
                );
              })
            )}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
