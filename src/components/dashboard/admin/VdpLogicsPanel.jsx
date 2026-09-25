'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  createVdpLogic,
  deleteVdpLogic,
  downloadExampleVdpLogicsCsv,
  fetchVdpLogics,
  updateVdpLogic,
  uploadVdpLogicsCsv,
} from '@/lib/api/vdpLogics';
import { EXAMPLE_ROW } from '@/lib/vdpLogics/fields';
import VdpLogicsFormModal from '@/components/dashboard/admin/VdpLogicsFormModal';
import AdminConfirmDialog from '@/components/dashboard/admin/AdminConfirmDialog';

const COLUMNS = [
  { key: 'dealerName', label: 'Dealer', sticky: true, width: 300 },
  { key: 'dealerId', label: 'Dealer ID', width: 120 },
  { key: 'websiteUrl', label: 'Website', width: 140 },
  { key: 'cms', label: 'CMS', width: 100 },
  { key: 'dataSource', label: 'Data source', width: 110 },
  { key: 'hootLink', label: 'Hoot link', width: 140 },
  { key: 'scrapStatus', label: 'Scrap', width: 88 },
  { key: 'vdpLogic', label: 'VDP logic', wide: true, width: 200 },
  { key: 'srpLogic', label: 'SRP logic', wide: true, width: 200 },
  { key: 'homePageLogic', label: 'Home logic', wide: true, width: 180 },
  { key: 'others', label: 'Others', wide: true, width: 180 },
  { key: 'updatedAt', label: 'Updated', width: 160 },
];

const ACTIONS_COL_WIDTH = 132;

function filterVdpRows(rows, { search = '', cms = '', dataSource = '' } = {}) {
  const q = String(search || '').trim().toLowerCase();
  const cmsFilter = String(cms || '').trim();
  const dsFilter = String(dataSource || '').trim();

  return (rows || []).filter((row) => {
    if (cmsFilter && row.cms !== cmsFilter) return false;
    if (dsFilter && row.dataSource !== dsFilter) return false;
    if (!q) return true;

    const hay = [
      row.dealerName,
      row.dealerId,
      row.websiteUrl,
      row.cms,
      row.dataSource,
      row.hootLink,
      row.scrapStatus,
      row.vdpLogic,
      row.srpLogic,
      row.homePageLogic,
      row.others,
    ]
      .filter((v) => v != null && v !== '')
      .join(' ')
      .toLowerCase();

    return hay.includes(q);
  });
}

function formatScrapStatus(row) {
  const on = row.scrapOn || String(row.scrapStatus || row.scrapLink || '').toLowerCase() === 'on';
  const count = row.scrapRowCount ?? 0;
  return (
    <span
      className={`vdp-logics-scrap-flag${on ? ' vdp-logics-scrap-flag--on' : ' vdp-logics-scrap-flag--off'}`}
      title={
        on
          ? `${count.toLocaleString()} row(s) in smart_scrap_inventory for dealer_id`
          : 'No scrap inventory for this dealer_id'
      }
    >
      {on ? 'ON' : 'OFF'}
    </span>
  );
}

function formatCell(key, value, row) {
  if (key === 'scrapStatus') {
    return formatScrapStatus(row || {});
  }
  if (value == null || value === '') return '—';
  if (key === 'updatedAt' || key === 'createdAt') {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleString();
  }
  if (key === 'websiteUrl' || key === 'hootLink') {
    const s = String(value);
    if (/^https?:\/\//i.test(s)) {
      return (
        <a href={s} target="_blank" rel="noopener noreferrer" className="vdp-logics-link">
          {s.length > 48 ? `${s.slice(0, 48)}…` : s}
        </a>
      );
    }
  }
  return String(value);
}

export default function VdpLogicsPanel() {
  const fileInputRef = useRef(null);
  const addHandledRef = useRef(false);
  const hasLoadedRef = useRef(false);
  const searchParams = useSearchParams();
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [cms, setCms] = useState('');
  const [dataSource, setDataSource] = useState('');
  const [allRows, setAllRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [message, setMessage] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [modal, setModal] = useState({ open: false, mode: 'create', row: null });
  const [confirmRow, setConfirmRow] = useState(null);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    if (addHandledRef.current) return;
    if (searchParams.get('add') !== '1') return;
    addHandledRef.current = true;

    setModal({
      open: true,
      mode: 'create',
      row: {
        dealerName: searchParams.get('dealerName')?.trim() || '',
        dealerId: searchParams.get('dealerId')?.trim() || '',
        cms: searchParams.get('cms')?.trim() || '',
        hootLink: searchParams.get('hootLink')?.trim() || '',
        dataSource: 'GA4',
      },
    });
    router.replace('/dashboard/admin/vdp-logics', { scroll: false });
  }, [searchParams, router]);

  const load = useCallback(async () => {
    const isRefresh = hasLoadedRef.current;
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const json = await fetchVdpLogics();
      setAllRows(json.rows || []);
      hasLoadedRef.current = true;
    } catch (e) {
      setError(e?.message || 'Failed to load VDP logics.');
      if (!isRefresh) setAllRows([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const rows = useMemo(
    () => filterVdpRows(allRows, { search, cms, dataSource }),
    [allRows, search, cms, dataSource]
  );

  const cmsOptions = useMemo(
    () => [...new Set(allRows.map((r) => r.cms).filter(Boolean))].sort(),
    [allRows]
  );
  const dataSourceOptions = useMemo(
    () => [...new Set(allRows.map((r) => r.dataSource).filter(Boolean))].sort(),
    [allRows]
  );

  const hasFilters = Boolean(search.trim() || cms || dataSource);
  const tableReady = !loading && !error;

  const openCreate = () => setModal({ open: true, mode: 'create', row: null });
  const openEdit = (row) => setModal({ open: true, mode: 'edit', row });
  const closeModal = () => setModal({ open: false, mode: 'create', row: null });

  const handleSave = async (form) => {
    setSaving(true);
    setMessage(null);
    try {
      if (modal.mode === 'edit' && modal.row?.id) {
        await updateVdpLogic(modal.row.id, form);
        setMessage('Row updated.');
      } else {
        await createVdpLogic(form);
        setMessage('Row created.');
      }
      closeModal();
      load();
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (row) => {
    if (!row?.id) return;
    setConfirmRow(row);
  };

  const closeConfirm = () => {
    if (confirming) return;
    setConfirmRow(null);
  };

  const runDelete = async () => {
    if (!confirmRow?.id) return;
    const label = confirmRow.dealerName || `ID ${confirmRow.id}`;
    setConfirming(true);
    setMessage(null);
    setError(null);
    try {
      await deleteVdpLogic(confirmRow.id);
      setMessage(`"${label}" deleted.`);
      setConfirmRow(null);
      load();
    } catch (e) {
      setError(e?.message || 'Delete failed.');
    } finally {
      setConfirming(false);
    }
  };

  const handleCsvPick = () => fileInputRef.current?.click();

  const handleCsvFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploading(true);
    setMessage(null);
    setError(null);
    try {
      const result = await uploadVdpLogicsCsv(file);
      const errCount = result.rowErrors?.length ?? 0;
      setMessage(
        `CSV import: ${result.imported ?? 0} of ${result.total ?? 0} rows` +
          (errCount ? ` (${errCount} issue${errCount === 1 ? '' : 's'})` : '.')
      );
      if (errCount) {
        setError(
          result.rowErrors
            .slice(0, 5)
            .map((x) => (x.line ? `Line ${x.line}: ${x.message}` : x.message))
            .join(' · ')
        );
      }
      load();
    } catch (err) {
      setError(err?.message || 'CSV upload failed.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="ga4-count-page vdp-logics-page">
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv,text/csv"
        className="vdp-logics-file-input"
        aria-hidden
        tabIndex={-1}
        onChange={handleCsvFile}
      />

      <header className="ga4-count-toolbar">
        <h1 className="ga4-count-title">Vdp - Logics</h1>
        <div className="ga4-count-filters-row vdp-logics-filters">
          <label className="admin-date-field ga4-count-dealer-field vdp-logics-search-field">
            <span className="admin-date-label">Search</span>
            <input
              type="search"
              className="ga4-count-search"
              placeholder="Dealer, URL, logic…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
          <label className="admin-date-field ga4-count-dealer-field">
            <span className="admin-date-label">CMS</span>
            <select
              className="ga4-count-select"
              value={cms}
              onChange={(e) => setCms(e.target.value)}
              disabled={loading}
            >
              <option value="">All CMS</option>
              {cmsOptions.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          <label className="admin-date-field ga4-count-dealer-field">
            <span className="admin-date-label">Data source</span>
            <select
              className="ga4-count-select"
              value={dataSource}
              onChange={(e) => setDataSource(e.target.value)}
              disabled={loading}
            >
              <option value="">All sources</option>
              {dataSourceOptions.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="ga4-count-actions vdp-logics-actions">
          <button type="button" className="ga4-count-export-btn" onClick={openCreate}>
            Add row
          </button>
          <button
            type="button"
            className="ga4-count-export-btn"
            onClick={downloadExampleVdpLogicsCsv}
          >
            Example CSV
          </button>
          <button
            type="button"
            className="ga4-count-export-btn"
            onClick={handleCsvPick}
            disabled={uploading}
          >
            {uploading ? 'Uploading…' : 'Upload CSV'}
          </button>
          <button
            type="button"
            className="ga4-count-export-btn"
            onClick={load}
            disabled={loading}
          >
            Refresh
          </button>
        </div>
      </header>

      <p className="ga4-count-meta vdp-logics-example-hint">
        Scrap column is auto <strong>ON</strong>/<strong>OFF</strong> from{' '}
        <code>smart_scrap_inventory.customer_id</code> (matches <code>dealer_id</code>). Refresh
        syncs <code>scrap_link</code> to on/off in the database.
      </p>
      <p className="ga4-count-meta vdp-logics-example-hint">
        VDP logic must match GA4 <code>page_path</code> (usually starts with <code>/</code>).
        Example for B&amp;E-style URLs: <code>{'^/inventory/\\d{4}-.+'}</code>
        {' '}— not <code>{'^inventory/...'}</code> (missing slash after <code>^</code> makes
        Step 2 “pass” but mark 0 VDPs, so Step 3 stays empty).
      </p>

      <p className="ga4-count-meta vdp-logics-example-hint">
        {loading && 'Loading smart_vdp_logic…'}
        {refreshing && !loading && 'Refreshing…'}
        {!loading && !refreshing && error && <span className="ga4-count-error-text">{error}</span>}
        {!loading && !refreshing && !error && message && <span>{message}</span>}
        {!loading && !refreshing && !error && !message && (
          <>
            {hasFilters
              ? `${rows.length.toLocaleString()} of ${allRows.length.toLocaleString()} row${allRows.length === 1 ? '' : 's'}`
              : `${allRows.length.toLocaleString()} row${allRows.length === 1 ? '' : 's'}`}{' '}
            · CSV upserts on <code>dealer_name</code> + <code>website_url</code>
          </>
        )}
      </p>

      <details className="vdp-logics-example-box">
        <summary>Example row (template)</summary>
        <dl className="vdp-logics-example-dl">
          {Object.entries(EXAMPLE_ROW).map(([k, v]) => (
            <div key={k}>
              <dt>{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
      </details>

      {error && !loading && (
        <div className="ga4-count-alert">
          <p>{error}</p>
          <button type="button" className="ga4-count-retry-btn" onClick={load}>
            Retry
          </button>
        </div>
      )}

      {loading && (
        <div className="ga4-count-skeleton" aria-hidden="true">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="ga4-count-skeleton-row" />
          ))}
        </div>
      )}

      {!loading && !error && allRows.length > 0 && (
        <div className="ga4-count-scroll vdp-logics-scroll">
          <table className="ga4-count-table vdp-logics-table vdp-logics-table-layout">
            <colgroup>
              <col style={{ width: ACTIONS_COL_WIDTH }} />
              {COLUMNS.map((col) => (
                <col key={col.key} style={{ width: col.width }} />
              ))}
            </colgroup>
            <thead>
              <tr>
                <th className="ga4-count-sticky-col vdp-logics-actions-col">Actions</th>
                {COLUMNS.map((col) => (
                  <th
                    key={col.key}
                    className={
                      col.sticky
                        ? 'ga4-count-sticky-col ga4-count-client vdp-logics-dealer-col'
                        : ''
                    }
                  >
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.length > 0 ? (
                rows.map((row) => (
                  <tr key={row.id}>
                    <td className="ga4-count-sticky-col vdp-logics-actions-col">
                      <div className="vdp-logics-actions-inner">
                        <button
                          type="button"
                          className="vdp-logics-action-btn"
                          onClick={() => openEdit(row)}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          className="vdp-logics-action-btn vdp-logics-action-btn--danger"
                          onClick={() => handleDelete(row)}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                    {COLUMNS.map((col) => (
                      <td
                        key={col.key}
                        className={[
                          'ga4-count-cell',
                          col.sticky
                            ? 'ga4-count-sticky-col ga4-count-client vdp-logics-dealer-col'
                            : '',
                          col.wide ? 'vdp-logics-cell--wide' : '',
                        ]
                          .filter(Boolean)
                          .join(' ')}
                      >
                        {formatCell(col.key, row[col.key], row)}
                      </td>
                    ))}
                  </tr>
                ))
              ) : (
                <tr className="vdp-logics-empty-row">
                  <td colSpan={COLUMNS.length + 1} className="vdp-logics-empty-cell">
                    No rows match your search or filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {tableReady && allRows.length === 0 && (
        <p className="ga4-count-meta">
          No rows yet. Use <strong>Add row</strong>, <strong>Upload CSV</strong>, or download{' '}
          <strong>Example CSV</strong>.
        </p>
      )}

      <VdpLogicsFormModal
        open={modal.open}
        mode={modal.mode}
        initialRow={modal.row}
        saving={saving}
        onClose={closeModal}
        onSave={handleSave}
      />

      <AdminConfirmDialog
        open={Boolean(confirmRow)}
        title="Delete VDP logic"
        message={
          confirmRow
            ? `Delete VDP logic for "${confirmRow.dealerName || `ID ${confirmRow.id}`}"? This cannot be undone.`
            : ''
        }
        confirmLabel="Delete"
        danger
        loading={confirming}
        onConfirm={runDelete}
        onCancel={closeConfirm}
      />
    </div>
  );
}
