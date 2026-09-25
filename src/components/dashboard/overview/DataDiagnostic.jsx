'use client';

import { useClient } from '../ClientContext';
import { useOverview } from './OverviewDataContext';

const TAB_LABEL = { all: 'All', vdp: 'VDP', srp: 'SRP', home: 'Home', other: 'Other' };
const TAB_ORDER = ['all', 'home', 'srp', 'other', 'vdp'];

function fmt(n) {
  return Number(n || 0).toLocaleString();
}

/**
 * Inline diagnostic strip — shows exactly what the Overview data layer is
 * querying for, plus a per-tab breakdown and the distinct ga4_page_type
 * histogram so routing/normalization is verifiable in one glance.
 */
export default function DataDiagnostic() {
  const { client } = useClient();
  const {
    clientKey,
    from,
    to,
    totals,
    pageTypes = [],
    rowCount,
    loading,
    error,
  } = useOverview();

  const status = error
    ? 'error'
    : loading
    ? 'loading'
    : rowCount === 0
    ? 'empty'
    : 'ok';

  return (
    <div className={`diag diag-${status}`}>
      <div className="diag-row">
        <span className="diag-pill diag-status">
          <span className="diag-dot" />
          {status === 'loading' && 'Fetching…'}
          {status === 'error' && 'Error'}
          {status === 'empty' && 'No rows'}
          {status === 'ok' && `${fmt(rowCount)} rows`}
        </span>

        <span className="diag-pill">
          Dealer: <strong>{client?.name || '—'}</strong>
        </span>

        <span className="diag-pill">
          client_id: <code>{clientKey || 'NULL'}</code>
        </span>

        <span className="diag-pill">
          Range: <code>{from || '—'}</code> → <code>{to || '—'}</code>
        </span>

        {TAB_ORDER.map((id) => (
          <span key={id} className="diag-pill diag-tab">
            {TAB_LABEL[id]}: <strong>{fmt(totals?.[id])}</strong>
          </span>
        ))}

        {error && (
          <span className="diag-pill diag-pill-err" title={error}>
            {error}
          </span>
        )}
      </div>

      {pageTypes.length > 0 && (
        <div className="diag-row diag-types">
          <span className="diag-types-label">ga4_page_type:</span>
          {pageTypes.map((p) => (
            <span key={p.raw} className="diag-pill diag-type">
              <code>{p.raw}</code>
              <span className="diag-type-arrow">→</span>
              <strong>{TAB_LABEL[p.tab]}</strong>
              <span className="diag-type-meta">
                · {fmt(p.views)} views · {fmt(p.rows)} rows
              </span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
