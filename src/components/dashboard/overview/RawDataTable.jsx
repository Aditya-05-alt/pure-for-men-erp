'use client';

import { useMemo, useState } from 'react';
import { useOverview } from './OverviewDataContext';

const PAGE_SIZE = 25;

const TAB_TYPE_FILTER = {
  all:   () => true,
  vdp:   (t) => normalize(t) === 'vdp',
  srp:   (t) => /^(srp|searchresults|searchresultspage)$/.test(normalize(t)),
  home:  (t) => /^(home|homepage)$/.test(normalize(t)),
  other: (t) => {
    const n = normalize(t);
    return ![
      'srp', 'searchresults', 'searchresultspage',
      'home', 'homepage',
      'vdp', 'vehicledetails', 'vehicledetailspage',
    ].includes(n);
  },
};

function normalize(raw) {
  return String(raw || '').toLowerCase().replace(/[\s_\-]+/g, '');
}

function fmt(n) {
  if (n == null || n === '') return '—';
  if (typeof n === 'number') return n.toLocaleString();
  return n;
}

function truncate(s, max = 60) {
  if (!s) return '';
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

export default function RawDataTable() {
  const { rows, rowCount, loading, tab } = useOverview();

  const [open, setOpen]   = useState(false);
  const [query, setQuery] = useState('');
  const [page, setPage]   = useState(0);
  const [scope, setScope] = useState('tab'); // 'tab' | 'all'

  const filtered = useMemo(() => {
    const typeFilter = scope === 'all' ? TAB_TYPE_FILTER.all : (TAB_TYPE_FILTER[tab] || TAB_TYPE_FILTER.all);
    const q = query.trim().toLowerCase();
    let out = rows.filter((r) => typeFilter(r.ga4_page_type));
    if (q) {
      out = out.filter((r) => {
        return (
          String(r.page_path || '').toLowerCase().includes(q) ||
          String(r.page_title || '').toLowerCase().includes(q) ||
          String(r.ga4_page_type || '').toLowerCase().includes(q) ||
          String(r.channel || '').toLowerCase().includes(q) ||
          String(r.report_date || '').includes(q)
        );
      });
    }
    return out;
  }, [rows, tab, scope, query]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages - 1);

  const pageRows = useMemo(() => {
    const start = safePage * PAGE_SIZE;
    return filtered.slice(start, start + PAGE_SIZE);
  }, [filtered, safePage]);

  const sumViews = useMemo(
    () => filtered.reduce((acc, r) => acc + (Number(r.views) || 0), 0),
    [filtered]
  );

  function resetPage() { setPage(0); }

  return (
    <div className="raw">
      <button
        type="button"
        className="raw-toggle"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <span className="raw-tog-arr">{open ? '▾' : '▸'}</span>
        Raw rows
        <span className="raw-tog-count">
          {loading ? 'fetching…' : `${rowCount.toLocaleString()} total · ${filtered.length.toLocaleString()} shown`}
        </span>
      </button>

      {open && (
        <div className="raw-body">
          <div className="raw-controls">
            <div className="raw-scope" role="group">
              <button
                type="button"
                className={`raw-chip ${scope === 'tab' ? 'on' : ''}`}
                onClick={() => { setScope('tab'); resetPage(); }}
              >
                Active tab ({tab})
              </button>
              <button
                type="button"
                className={`raw-chip ${scope === 'all' ? 'on' : ''}`}
                onClick={() => { setScope('all'); resetPage(); }}
              >
                All rows
              </button>
            </div>

            <input
              type="text"
              className="raw-search"
              placeholder="Search path / title / type / channel / date…"
              value={query}
              onChange={(e) => { setQuery(e.target.value); resetPage(); }}
            />

            <span className="raw-sum">Σ views: <strong>{sumViews.toLocaleString()}</strong></span>
          </div>

          <div className="raw-tablewrap">
            <table className="raw-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>ga4_page_type</th>
                  <th>Path</th>
                  <th>Title</th>
                  <th className="num">Views</th>
                  <th className="num">Users</th>
                  <th className="num">Sessions</th>
                  <th className="num">New</th>
                  <th>Channel</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.length === 0 && (
                  <tr><td colSpan={9} className="raw-empty">No rows</td></tr>
                )}
                {pageRows.map((r) => (
                  <tr key={r.id}>
                    <td className="mono">{r.report_date}</td>
                    <td><span className="raw-typ">{r.ga4_page_type || '—'}</span></td>
                    <td className="mono" title={r.page_path}>{truncate(r.page_path, 48)}</td>
                    <td title={r.page_title}>{truncate(r.page_title, 48)}</td>
                    <td className="num">{fmt(r.views)}</td>
                    <td className="num">{fmt(r.total_users)}</td>
                    <td className="num">{fmt(r.sessions)}</td>
                    <td className="num">{fmt(r.new_users)}</td>
                    <td>{r.channel || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {filtered.length > PAGE_SIZE && (
            <div className="raw-pager">
              <button
                type="button"
                className="raw-pg-btn"
                disabled={safePage === 0}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
              >
                ‹ Prev
              </button>
              <span className="raw-pg-info">
                Page {safePage + 1} / {totalPages}
              </span>
              <button
                type="button"
                className="raw-pg-btn"
                disabled={safePage >= totalPages - 1}
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              >
                Next ›
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
