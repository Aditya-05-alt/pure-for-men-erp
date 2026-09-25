'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import AdminDateRange from '@/components/dashboard/admin/AdminDateRange';
import { fetchDateWiseViews } from '@/lib/api/date-wise-views';
import { getDefaultGa4DateRange } from '@/lib/ga4/dateRange';

const DATE_WISE_DEFAULT_DAYS = 5;
import {
  buildDateWiseCsv,
  dealersForFilter,
  pivotDateWiseRows,
} from '@/lib/ga4/pivotDateWiseViews';

function todayISO() {
  return new Date().toISOString().split('T')[0];
}

function normalizeRange(from, to) {
  if (!from || !to) return getDefaultGa4DateRange(DATE_WISE_DEFAULT_DAYS);
  if (from <= to) return { from, to };
  return { from: to, to: from };
}

export default function DateWiseViewsPanel({
  title = 'Date-wise Dealer Views',
  defaultDayCount = DATE_WISE_DEFAULT_DAYS,
}) {
  const initialRange = useMemo(
    () => getDefaultGa4DateRange(defaultDayCount),
    [defaultDayCount]
  );

  const [dateFrom, setDateFrom] = useState(initialRange.from);
  const [dateTo, setDateTo] = useState(initialRange.to);
  const [dealerFilter, setDealerFilter] = useState('');
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [progress, setProgress] = useState(null);

  const { from, to } = useMemo(
    () => normalizeRange(dateFrom, dateTo),
    [dateFrom, dateTo]
  );

  const applyLastDays = useCallback((days) => {
    const range = getDefaultGa4DateRange(days);
    setDateFrom(range.from);
    setDateTo(range.to);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setProgress(null);

    fetchDateWiseViews({
      from,
      to,
      clientId: null,
      onCancelCheck: () => cancelled,
      onProgress: (p) => {
        if (!cancelled) setProgress(p);
      },
    })
      .then((data) => {
        if (!cancelled) setRows(data || []);
      })
      .catch((e) => {
        if (!cancelled) setError(e?.message || 'Failed to load data.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [from, to, reloadKey]);

  const filterOptions = useMemo(() => dealersForFilter(rows), [rows]);

  const { dates, dealers, grid, colTotals, rowTotals, grandTotal } = useMemo(
    () => pivotDateWiseRows(rows, { clientIdFilter: dealerFilter }),
    [rows, dealerFilter]
  );

  const downloadCSV = () => {
    const csv = buildDateWiseCsv({
      dates,
      dealers,
      grid,
      rowTotals,
      colTotals,
      grandTotal,
    });
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `date-wise-views_${from}_to_${to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="ga4-count-page pipeline-page">
      <header className="ga4-count-toolbar">
        <h1 className="ga4-count-title">{title}</h1>
        <div className="ga4-count-filters-row">
          <label className="admin-date-field ga4-count-dealer-field">
            <span className="admin-date-label">Dealer</span>
            <select
              className="ga4-count-select"
              value={dealerFilter}
              onChange={(e) => setDealerFilter(e.target.value)}
              disabled={loading || rows.length === 0}
            >
              <option value="">All Dealers</option>
              {filterOptions.map((d) => (
                <option key={d.client_id} value={d.client_id}>
                  {d.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="ga4-count-actions">
          <button
            type="button"
            className="ga4-count-export-btn"
            onClick={downloadCSV}
            disabled={loading || rows.length === 0}
          >
            Export CSV
          </button>
        </div>
      </header>

      <AdminDateRange
        from={from}
        to={to}
        onFromChange={setDateFrom}
        onToChange={setDateTo}
        onApplyLastDays={applyLastDays}
        presets={[5, 10, 30]}
      />

      <p className="ga4-count-meta">
        {loading &&
          (progress?.total
            ? `Loading ${progress.completed} of ${progress.total} batch${progress.total === 1 ? '' : 'es'} (5 days each)${progress.label ? ` · ${progress.label}` : ''}…`
            : 'Loading date-wise views…')}
        {!loading && error && (
          <span className="ga4-count-error-text">{error}</span>
        )}
        {!loading && !error && rows.length > 0 && (
          <>
            {dealers.length} dealers · {dates.length} days · {from} → {to}
            {dealerFilter ? ' · filtered' : ''}
          </>
        )}
        {!loading && !error && rows.length === 0 && 'No data for this date range.'}
      </p>

      {error && (
        <div className="ga4-count-alert">
          <p>{error}</p>
          <button
            type="button"
            className="ga4-count-retry-btn"
            onClick={() => setReloadKey((k) => k + 1)}
          >
            Retry
          </button>
        </div>
      )}

      {loading && (
        <div className="ga4-count-skeleton" aria-hidden="true">
          {[...Array(10)].map((_, i) => (
            <div key={i} className="ga4-count-skeleton-row" />
          ))}
        </div>
      )}

      {!loading && !error && rows.length > 0 && (
        <div className="ga4-count-scroll">
          <table className="ga4-count-table ga4-count-table--pivot">
            <thead>
              <tr>
                <th className="ga4-count-sticky-col">Dealer</th>
                {dates.map((dt) => (
                  <th key={dt}>{dt}</th>
                ))}
                <th className="ga4-count-total-col">Total</th>
              </tr>
            </thead>
            <tbody>
              {dealers.map((d) => (
                <tr key={d.client_id}>
                  <th className="ga4-count-sticky-col ga4-count-client" scope="row">
                    {d.name}
                  </th>
                  {dates.map((dt) => {
                    const v = grid[d.client_id]?.[dt];
                    return (
                      <td key={dt} className="ga4-count-cell">
                        {v == null ? (
                          <span className="ga4-count-dash">—</span>
                        ) : (
                          v.toLocaleString()
                        )}
                      </td>
                    );
                  })}
                  <td className="ga4-count-cell ga4-count-total-col">
                    {(rowTotals[d.client_id] || 0).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="ga4-count-foot-row">
                <th className="ga4-count-sticky-col ga4-count-foot-label" scope="row">
                  TOTAL
                </th>
                {dates.map((dt) => (
                  <td key={dt} className="ga4-count-cell ga4-count-foot-cell">
                    {(colTotals[dt] || 0).toLocaleString()}
                  </td>
                ))}
                <td className="ga4-count-cell ga4-count-total-col ga4-count-foot-cell">
                  {grandTotal.toLocaleString()}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
