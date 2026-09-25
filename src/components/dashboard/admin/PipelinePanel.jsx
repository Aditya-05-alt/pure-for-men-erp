'use client';

import { useEffect, useMemo, useState } from 'react';
import AdminDateRange from '@/components/dashboard/admin/AdminDateRange';
import DealerPipelineCard from '@/components/dashboard/admin/DealerPipelineCard';
import { fetchPipelineDealers } from '@/lib/api/adminPipeline';
import {
  readStoredAdminDealerId,
  writeStoredAdminDealerId,
} from '@/lib/dashboard/dashboardPrefs';
import { daysAgoISO, todayISO } from '@/lib/pipeline/dates';

function defaultPipelineRange() {
  const to = todayISO();
  return { from: daysAgoISO(6, to), to };
}

export default function PipelinePanel() {
  const initialRange = useMemo(() => defaultPipelineRange(), []);
  const [from, setFrom] = useState(initialRange.from);
  const [to, setTo] = useState(initialRange.to);
  const [dealers, setDealers] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const list = await fetchPipelineDealers();
        if (!cancelled) {
          setDealers(list);
          const storedId = readStoredAdminDealerId();
          const storedMatch = storedId
            ? list.find((d) => String(d.id) === String(storedId) && d.ga4CustomerId)
            : null;
          const first = list.find((d) => d.ga4CustomerId);
          const nextId = storedMatch?.id ?? first?.id;
          if (nextId != null) setSelectedId(String(nextId));
        }
      } catch (e) {
        if (!cancelled) setError(e?.message || 'Failed to load dealers.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const selectedDealer = useMemo(
    () => dealers.find((d) => String(d.id) === String(selectedId)) || null,
    [dealers, selectedId]
  );

  return (
    <div className="ga4-count-page pipeline-page">
      <header className="ga4-count-toolbar">
        <h1 className="ga4-count-title">Data Pipeline</h1>
        <div className="ga4-count-filters-row pipeline-filters">
          <AdminDateRange from={from} to={to} onFromChange={setFrom} onToChange={setTo} />
          <label className="admin-date-field ga4-count-dealer-field">
            <span className="admin-date-label">Dealer</span>
            <select
              className="ga4-count-select"
              value={selectedId}
              onChange={(e) => {
                const nextId = e.target.value;
                setSelectedId(nextId);
                if (nextId) writeStoredAdminDealerId(nextId);
              }}
              disabled={loading || dealers.length === 0}
            >
              <option value="">Select dealer…</option>
              {dealers.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                  {d.ga4CustomerId ? '' : ' (no GA4 ID)'}
                </option>
              ))}
            </select>
          </label>
        </div>
      </header>

      <p className="ga4-count-meta">
        {loading && 'Loading smart_hoot_config…'}
        {!loading && error && <span className="ga4-count-error-text">{error}</span>}
        {!loading && !error && selectedDealer && (
          <>
            One dealer at a time · smart_ga4_config → smart_ga4_config.client_id ={' '}
            ga4_customer_id
          </>
        )}
      </p>

      {loading && (
        <div className="ga4-count-skeleton">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="ga4-count-skeleton-row" />
          ))}
        </div>
      )}

      {!loading && !error && selectedDealer && (
        <DealerPipelineCard
          key={selectedDealer.id}
          dealer={selectedDealer}
          from={from}
          to={to}
        />
      )}
    </div>
  );
}
