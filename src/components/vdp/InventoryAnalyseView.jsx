'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useClient } from '@/components/dashboard/ClientContext';
import {
  downloadInventoryCsv,
  buildInventoryDownloadFilename,
} from '@/lib/inventory/inventoryDownload';
import { VdpLoadingCard } from '@/components/vdp/VdpLoadingBanner';
import { useSoftLoadPercent } from '@/components/vdp/useSoftLoadPercent';

const SCOPE_OPTS = [
  {
    id: 'all',
    label: 'All Dealers',
    blurb: 'Every dealer in your account.',
  },
  {
    id: 'multi',
    label: 'Multiple Dealers',
    blurb: 'Pick several dealers to combine.',
  },
  {
    id: 'single',
    label: 'Single Dealer',
    blurb: 'One dealer only.',
  },
];

export default function InventoryAnalyseView() {
  const { dealers, client, loading: dealersLoading } = useClient();
  const [scope, setScope] = useState('all');
  const [clientId, setClientId] = useState('');
  const [multiIds, setMultiIds] = useState([]);
  const [multiOpen, setMultiOpen] = useState(false);
  const multiDropRef = useRef(null);
  const [invSource, setInvSource] = useState('both');
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState(null);
  const [status, setStatus] = useState(null);

  const dealerOptions = useMemo(
    () =>
      (dealers || [])
        .map((d) => ({
          id: String(d.ga4CustomerId || '').trim(),
          name: d.name || d.customerName || 'Unnamed',
        }))
        .filter((d) => d.id),
    [dealers]
  );

  useEffect(() => {
    if (clientId) return;
    const fromClient = String(client?.ga4CustomerId || '').trim();
    if (fromClient) {
      setClientId(fromClient);
      return;
    }
    if (dealerOptions[0]?.id) setClientId(dealerOptions[0].id);
  }, [clientId, client, dealerOptions]);

  useEffect(() => {
    if (multiIds.length || !dealerOptions.length) return;
    const fromClient = String(client?.ga4CustomerId || '').trim();
    const starter = fromClient || dealerOptions[0]?.id;
    if (starter) setMultiIds([starter]);
  }, [multiIds.length, dealerOptions, client]);

  useEffect(() => {
    if (scope !== 'multi') setMultiOpen(false);
  }, [scope]);

  useEffect(() => {
    if (!multiOpen) return undefined;
    const onPointer = (e) => {
      if (multiDropRef.current?.contains(e.target)) return;
      setMultiOpen(false);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') setMultiOpen(false);
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [multiOpen]);

  const selectedIds = useMemo(() => {
    if (scope === 'all') return dealerOptions.map((d) => d.id);
    if (scope === 'multi') return multiIds.filter(Boolean);
    return clientId ? [clientId] : [];
  }, [scope, dealerOptions, multiIds, clientId]);

  const scopeLabel = useMemo(() => {
    if (scope === 'all') return `All dealers (${dealerOptions.length})`;
    if (scope === 'multi') {
      return `${multiIds.length} dealer${multiIds.length === 1 ? '' : 's'} selected`;
    }
    return (
      dealerOptions.find((d) => d.id === clientId)?.name || 'One dealer'
    );
  }, [scope, dealerOptions, multiIds, clientId]);

  const multiTriggerLabel = useMemo(() => {
    if (!multiIds.length) return 'Select dealers…';
    if (multiIds.length === 1) {
      return dealerOptions.find((d) => d.id === multiIds[0])?.name || '1 dealer';
    }
    if (multiIds.length === dealerOptions.length && dealerOptions.length > 0) {
      return `All dealers (${multiIds.length})`;
    }
    return `${multiIds.length} dealers selected`;
  }, [multiIds, dealerOptions]);

  const toggleMultiId = (id) => {
    setMultiIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const onDownload = async () => {
    if (downloading) return;
    if (scope !== 'all' && !selectedIds.length) {
      setError('Select at least one dealer.');
      return;
    }
    setDownloading(true);
    setError(null);
    setStatus(null);
    try {
      const result = await downloadInventoryCsv({
        allDealers: scope === 'all',
        clientIds: selectedIds,
        source: invSource,
        filename: buildInventoryDownloadFilename({
          scopeLabel:
            scope === 'all'
              ? 'all-dealers-inventory'
              : scope === 'multi'
                ? `multi-${selectedIds.length}-dealers`
                : dealerOptions.find((d) => d.id === clientId)?.name ||
                  'single-dealer',
          source: invSource,
        }),
      });
      if (!result.ok) {
        setError(result.error || 'Inventory download failed.');
        return;
      }
      const srcLabel =
        invSource === 'both'
          ? 'Hoot + Scrap'
          : invSource === 'hoot'
            ? 'Hoot only'
            : 'Scrap only';
      setStatus(
        `Downloaded ${result.filename} · ${scopeLabel} · daily ${
          result.asOf ? `as of ${result.asOf}` : 'snapshot'
        } · ${srcLabel}${
          result.rowCount != null
            ? ` · ${result.rowCount.toLocaleString()} rows`
            : ''
        }`
      );
    } catch (err) {
      setError(err?.message || 'Inventory download failed.');
    } finally {
      setDownloading(false);
    }
  };

  const softPercent = useSoftLoadPercent(downloading);
  const scopeMeta = SCOPE_OPTS.find((s) => s.id === scope) || SCOPE_OPTS[0];

  return (
    <div className={`vdp-view${downloading ? ' vdp-view--card-loading' : ''}`}>
      <VdpLoadingCard
        active={downloading}
        percent={softPercent}
        label="Preparing inventory download…"
      />

      <div className="inv-analyse">
        <header className="inv-analyse__hero vdp-card">
          <div className="inv-analyse__col">
            <h2 className="inv-analyse__title">Inventory Analysis</h2>
            <p className="inv-analyse__sub">
              Download the latest daily Hoot and Scrap inventory for the selected
              dealers.
            </p>
          </div>
          <div className="inv-analyse__col inv-analyse__col--meta" aria-label="Current filters">
            <div className="inv-analyse__chip">
              <span className="inv-analyse__chip-k">Data</span>
              <span className="inv-analyse__chip-v">Latest daily snapshot</span>
            </div>
            <div className="inv-analyse__chip">
              <span className="inv-analyse__chip-k">Scope</span>
              <span className="inv-analyse__chip-v">{scopeLabel}</span>
            </div>
          </div>
        </header>

        <section className="vdp-card inv-analyse__card">
          <div className="inv-analyse__card-head">
            <h3 className="inv-analyse__heading">Dealer scope</h3>
            <p className="inv-analyse__sub">{scopeMeta.blurb}</p>
          </div>

          <div
            className="inv-analyse__seg"
            role="tablist"
            aria-label="Dealer scope"
          >
            {SCOPE_OPTS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                role="tab"
                aria-selected={scope === opt.id}
                className={`inv-analyse__seg-btn${
                  scope === opt.id ? ' is-active' : ''
                }`}
                onClick={() => setScope(opt.id)}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <div className="inv-analyse__fields">
            {scope === 'single' && (
              <label className="inv-analyse__field">
                <span className="inv-analyse__label">Dealer</span>
                <select
                  value={clientId}
                  onChange={(e) => setClientId(e.target.value)}
                  className="inv-analyse__select"
                  disabled={dealersLoading || !dealerOptions.length}
                >
                  {!dealerOptions.length && (
                    <option value="">No dealers</option>
                  )}
                  {dealerOptions.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </label>
            )}

            {scope === 'multi' && (
              <div className="inv-analyse__field inv-analyse__multi" ref={multiDropRef}>
                <span className="inv-analyse__label">Dealers</span>
                <button
                  type="button"
                  className={`inv-analyse__multi-trigger${
                    multiOpen ? ' is-open' : ''
                  }`}
                  aria-haspopup="listbox"
                  aria-expanded={multiOpen}
                  onClick={() => setMultiOpen((o) => !o)}
                >
                  <span>{multiTriggerLabel}</span>
                  <span aria-hidden>{multiOpen ? '▴' : '▾'}</span>
                </button>
                {multiOpen && (
                  <div className="inv-analyse__multi-pop">
                    <div className="inv-analyse__multi-actions">
                      <button
                        type="button"
                        className="inv-analyse__link"
                        onClick={() =>
                          setMultiIds(dealerOptions.map((d) => d.id))
                        }
                      >
                        Select all
                      </button>
                      <button
                        type="button"
                        className="inv-analyse__link"
                        onClick={() => setMultiIds([])}
                      >
                        Clear
                      </button>
                      <span className="inv-analyse__meta">
                        {multiIds.length} selected
                      </span>
                    </div>
                    <ul className="inv-analyse__multi-list">
                      {dealerOptions.map((d) => (
                        <li key={d.id}>
                          <label className="inv-analyse__check">
                            <input
                              type="checkbox"
                              checked={multiIds.includes(d.id)}
                              onChange={() => toggleMultiId(d.id)}
                            />
                            <span>{d.name}</span>
                          </label>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {scope === 'all' && (
              <p className="inv-analyse__hint">
                Includes all <strong>{dealerOptions.length}</strong> dealers.
              </p>
            )}
          </div>
        </section>

        <section className="vdp-card inv-analyse__card inv-analyse__card--action">
          <div className="inv-analyse__col">
            <h3 className="inv-analyse__heading">Download inventory</h3>
            <p className="inv-analyse__sub">
              Latest daily snapshot from Hoot and Scrap — VIN, stock,
              year/make/model, price, condition, URL, and pull date.
            </p>
          </div>
          <div className="inv-analyse__col inv-analyse__col--controls">
            <label className="inv-analyse__field">
              <span className="inv-analyse__label">Source</span>
              <select
                className="inv-analyse__select"
                value={invSource}
                onChange={(e) => setInvSource(e.target.value)}
                aria-label="Inventory data source"
                disabled={downloading}
              >
                <option value="both">Hoot + Scrap</option>
                <option value="hoot">Hoot only</option>
                <option value="scrap">Scrap only</option>
              </select>
            </label>
            <button
              type="button"
              className="inv-analyse__btn"
              onClick={onDownload}
              disabled={
                downloading || (scope !== 'all' && !selectedIds.length)
              }
            >
              {downloading ? 'Preparing CSV…' : 'Download inventory CSV'}
            </button>
          </div>

          {(error || status) && (
            <div className="inv-analyse__msgs">
              {error && (
                <p className="inv-analyse__msg inv-analyse__msg--err">{error}</p>
              )}
              {status && (
                <p className="inv-analyse__msg inv-analyse__msg--ok">{status}</p>
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
