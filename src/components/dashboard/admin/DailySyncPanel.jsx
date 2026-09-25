'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import AdminDateRange from '@/components/dashboard/admin/AdminDateRange';
import { fetchDailySyncStatus } from '@/lib/api/adminDailySync';
import { daysAgoISO, todayISO } from '@/lib/pipeline/dates';

function defaultRange() {
  const to = todayISO();
  return { from: daysAgoISO(6, to), to };
}

function SyncBadge({ synced, title }) {
  const label = synced ? 'Synced' : 'Not synced';
  const cls = synced ? 'daily-sync-badge--ok' : 'daily-sync-badge--no';
  return (
    <span className={`daily-sync-badge ${cls}`} title={title}>
      {label}
    </span>
  );
}

function statusTitle(stage) {
  if (!stage) return '';
  if (stage.note) return stage.note;
  if (stage.synced) return `All ${stage.total} day(s) in range`;
  const missing = stage.missingDates?.length ?? 0;
  return missing > 0
    ? `${missing} day(s) missing: ${stage.missingDates.slice(0, 5).join(', ')}${missing > 5 ? '…' : ''}`
    : 'Not synced';
}

export default function DailySyncPanel() {
  const initial = useMemo(() => defaultRange(), []);
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchDailySyncStatus({ from, to });
      setRows(data.dealers || []);
    } catch (e) {
      setError(e?.message || 'Failed to load daily sync status.');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.name?.toLowerCase().includes(q) ||
        r.clientId?.toLowerCase().includes(q)
    );
  }, [rows, search]);

  const summary = useMemo(() => {
    let rawOk = 0;
    let filterOk = 0;
    let finalOk = 0;
    for (const r of filtered) {
      if (r.ga4Raw?.synced) rawOk += 1;
      if (r.filtration?.synced) filterOk += 1;
      if (r.finalData?.synced) finalOk += 1;
    }
    return { rawOk, filterOk, finalOk, total: filtered.length };
  }, [filtered]);

  return (
    <div className="ga4-count-page daily-sync-page">
      <header className="ga4-count-toolbar">
        <h1 className="ga4-count-title">Daily Sync</h1>
        <div className="ga4-count-filters-row daily-sync-filters">
          <AdminDateRange from={from} to={to} onFromChange={setFrom} onToChange={setTo} />
          <label className="admin-date-field ga4-count-dealer-field daily-sync-search">
            <span className="admin-date-label">Search</span>
            <input
              type="search"
              className="ga4-count-search"
              placeholder="Dealer name or client ID"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
          <button
            type="button"
            className="ga4-count-retry-btn"
            onClick={load}
            disabled={loading}
          >
            Refresh
          </button>
        </div>
      </header>

      <p className="ga4-count-meta daily-sync-meta">
        Status for each dealer across the selected date range. GA4 Raw uses{' '}
        <code>smart_ga4_day_complete</code> (edge sync). Filtration requires no{' '}
        <code>vdp_conditions IS NULL</code> rows on completed days. Final Data
        requires rows in <code>smart_final_data</code> for each completed day.
        {!loading && error && (
          <span className="ga4-count-error-text"> {error}</span>
        )}
      </p>

      {!loading && !error && filtered.length > 0 && (
        <p className="ga4-count-meta daily-sync-summary">
          Synced: GA4 Raw {summary.rawOk}/{summary.total} · Filtration{' '}
          {summary.filterOk}/{summary.total} · Final {summary.finalOk}/
          {summary.total}
        </p>
      )}

      {loading ? (
        <div className="ga4-count-skeleton" aria-hidden="true">
          {Array.from({ length: 8 }, (_, i) => (
            <div key={i} className="ga4-count-skeleton-row" />
          ))}
        </div>
      ) : error && !rows.length ? (
        <div className="ga4-count-alert">
          <p>{error}</p>
          <button type="button" className="ga4-count-retry-btn" onClick={load}>
            Retry
          </button>
        </div>
      ) : (
        <div className="ga4-count-scroll">
          <table className="ga4-count-table daily-sync-table">
            <thead>
              <tr>
                <th className="ga4-count-sticky-col">Dealer</th>
                <th>GA4 Raw Data Sync</th>
                <th>Filtration</th>
                <th>Final Data</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={4} className="ga4-count-empty-row">
                    No dealers match your search.
                  </td>
                </tr>
              ) : (
                filtered.map((row) => (
                  <tr key={row.dealerId}>
                    <th className="ga4-count-sticky-col ga4-count-client" scope="row">
                      <span className="daily-sync-dealer-name">{row.name}</span>
                      {row.clientId && (
                        <span className="daily-sync-client-id">{row.clientId}</span>
                      )}
                    </th>
                    <td className="ga4-count-cell daily-sync-cell">
                      <SyncBadge
                        synced={row.ga4Raw?.synced}
                        title={statusTitle(row.ga4Raw)}
                      />
                    </td>
                    <td className="ga4-count-cell daily-sync-cell">
                      <SyncBadge
                        synced={row.filtration?.synced}
                        title={statusTitle(row.filtration)}
                      />
                    </td>
                    <td className="ga4-count-cell daily-sync-cell">
                      <SyncBadge
                        synced={row.finalData?.synced}
                        title={statusTitle(row.finalData)}
                      />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
