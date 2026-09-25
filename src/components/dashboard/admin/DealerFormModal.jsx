'use client';

import { useEffect, useState } from 'react';
import { FORM_FIELDS, emptyFormState, rowToFormState } from '@/lib/dealers/fields';
import { refreshAdminDealerCustomType } from '@/lib/api/adminDealers';
import DealerLocationsSection from '@/components/dashboard/admin/DealerLocationsSection';
import { chunkDates, coerceDateRange } from '@/lib/pipeline/dates';
import { logLine } from '@/lib/pipeline/syncLogFormat';

const HOOT_FIELDS = FORM_FIELDS.filter((f) => f.section === 'hoot');
const GA4_FIELDS = FORM_FIELDS.filter((f) => f.section === 'ga4');

/** Same pause as pipeline Step 1 between batches. */
const PAUSE_BETWEEN_BATCHES_MS = 2000;
/**
 * Type refresh is heavier than GA4 Step 1 page sync (URL + raw_data join).
 * Use 1 day per batch so statements finish under Supabase timeout.
 */
const TYPE_REFRESH_BATCH_SIZE = 1;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function defaultRefreshRange() {
  const to = new Date();
  const from = new Date();
  from.setUTCDate(from.getUTCDate() - 29);
  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
  };
}

function FieldInput({ field, form, setForm, extra }) {
  if (field.type === 'boolean') {
    return (
      <label className="dealers-field dealers-field--checkbox">
        <input
          type="checkbox"
          checked={Boolean(form[field.key])}
          onChange={(e) => setForm((prev) => ({ ...prev, [field.key]: e.target.checked }))}
        />
        <span className="admin-date-label">{field.label}</span>
      </label>
    );
  }

  if (field.type === 'select') {
    return (
      <label className="dealers-field">
        <span className="admin-date-label">
          {field.label}
          {field.required ? ' *' : ''}
        </span>
        <select
          className="ga4-count-select"
          value={form[field.key] ?? ''}
          onChange={(e) => setForm((prev) => ({ ...prev, [field.key]: e.target.value }))}
        >
          <option value="">{field.placeholder || `Select ${field.label}`}</option>
          {(field.options || []).map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      </label>
    );
  }

  if (field.key === 'invTypeRawKey') {
    return (
      <label className="dealers-field dealers-field--wide">
        <span className="admin-date-label">{field.label}</span>
        <div className="dealers-raw-key-row">
          <input
            type="text"
            className="admin-date-input"
            value={form[field.key] ?? ''}
            onChange={(e) => setForm((prev) => ({ ...prev, [field.key]: e.target.value }))}
            placeholder={field.placeholder || field.label}
          />
          {extra}
        </div>
        {field.hint ? <span className="dealers-modal-hint">{field.hint}</span> : null}
      </label>
    );
  }

  return (
    <label className={field.key === 'hootUrl' ? 'dealers-field dealers-field--wide' : 'dealers-field'}>
      <span className="admin-date-label">
        {field.label}
        {field.required ? ' *' : ''}
      </span>
      <input
        type="text"
        className="admin-date-input"
        value={form[field.key] ?? ''}
        onChange={(e) => setForm((prev) => ({ ...prev, [field.key]: e.target.value }))}
        placeholder={field.placeholder || field.label}
      />
      {field.hint ? <span className="dealers-modal-hint">{field.hint}</span> : null}
    </label>
  );
}

export default function DealerFormModal({
  open,
  mode,
  initialRow,
  saving,
  onClose,
  onSave,
  onDealerUpdated,
}) {
  const [form, setForm] = useState(emptyFormState());
  const [localError, setLocalError] = useState(null);
  const [refreshMsg, setRefreshMsg] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshFrom, setRefreshFrom] = useState(() => defaultRefreshRange().from);
  const [refreshTo, setRefreshTo] = useState(() => defaultRefreshRange().to);
  const [refreshLogs, setRefreshLogs] = useState([]);

  useEffect(() => {
    if (!open) return;
    setForm(rowToFormState(initialRow));
    setLocalError(null);
    setRefreshMsg(null);
    setRefreshLogs([]);
    const range = defaultRefreshRange();
    setRefreshFrom(range.from);
    setRefreshTo(range.to);
  }, [open, initialRow]);

  if (!open) return null;

  const dealerId = initialRow?.id;
  const canRefresh = mode === 'edit' && Number.isFinite(Number(dealerId)) && Number(dealerId) > 0;

  const setLogs = (lines) => {
    setRefreshLogs(Array.isArray(lines) ? lines.filter(Boolean) : [String(lines || '')]);
  };

  const appendLogs = (lines) => {
    const list = Array.isArray(lines) ? lines : [String(lines || '')];
    setRefreshLogs((prev) => [...prev, ...list.filter(Boolean)]);
  };

  const handleRefreshCustomType = async () => {
    if (!canRefresh) {
      setLocalError('Save the dealer first, then refresh types.');
      return;
    }

    let dates;
    let rangeFrom;
    let rangeTo;
    try {
      const coerced = coerceDateRange(refreshFrom, refreshTo);
      dates = coerced.dates;
      rangeFrom = coerced.from;
      rangeTo = coerced.to;
    } catch (e) {
      setLocalError(e?.message || 'Invalid date range.');
      return;
    }

    const batches = chunkDates(dates, TYPE_REFRESH_BATCH_SIZE);
    if (!batches.length) {
      setLocalError('Invalid date range.');
      return;
    }

    setLocalError(null);
    setRefreshMsg(null);
    setRefreshing(true);

    let totalUpdated = 0;
    let totalLinks = 0;
    let lastRow = null;
    let lastKey = form.invTypeRawKey;
    const batchSummaries = [];

    setLogs([
      logLine(`Type refresh — Step 1-style batching · ${rangeFrom} → ${rangeTo}`),
      logLine(
        `Batches of ${TYPE_REFRESH_BATCH_SIZE} day(s) · ${batches.length} batch(es) total (1 day avoids statement timeout)`
      ),
      logLine(`raw_data key: "${String(form.invTypeRawKey || '').trim() || '(empty)'}"`),
      logLine(`Starting batch 1/${batches.length}…`),
    ]);

    try {
      for (let i = 0; i < batches.length; i += 1) {
        const batch = batches[i];
        const batchFrom = batch[0];
        const batchTo = batch[batch.length - 1];
        const batchLabel = `${batchFrom} → ${batchTo}`;

        appendLogs([
          '',
          logLine(`Running batch ${i + 1}/${batches.length}: ${batchLabel}`),
        ]);

        const result = await refreshAdminDealerCustomType(dealerId, {
          invTypeRawKey: form.invTypeRawKey,
          from: batchFrom,
          to: batchTo,
          saveKey: i === 0,
        });

        if (Array.isArray(result?.logs) && result.logs.length) {
          appendLogs(result.logs);
        }

        const updatedRows = Number(result?.updatedRows) || 0;
        const linksUpdated = Number(result?.linksUpdated) || 0;
        totalUpdated += updatedRows;
        totalLinks += linksUpdated;
        if (result?.row) lastRow = result.row;
        if (result?.invTypeRawKey != null) lastKey = result.invTypeRawKey;

        batchSummaries.push({
          from: batchFrom,
          to: batchTo,
          updatedRows,
          linksUpdated,
        });

        appendLogs(
          logLine(
            `Batch ${i + 1}/${batches.length} OK (${batchLabel}) — rows ${updatedRows.toLocaleString()}, links ${linksUpdated.toLocaleString()}`
          )
        );

        if (i < batches.length - 1) {
          appendLogs(
            logLine(
              `Batch ${i + 1}/${batches.length} done — pausing ${PAUSE_BETWEEN_BATCHES_MS / 1000}s before next day…`
            )
          );
          await sleep(PAUSE_BETWEEN_BATCHES_MS);
        }
      }

      if (lastRow && onDealerUpdated) onDealerUpdated(lastRow);
      setForm((prev) => ({
        ...prev,
        invTypeRawKey: lastKey ?? prev.invTypeRawKey,
      }));

      const summary =
        totalLinks > 0
          ? `For ${totalLinks.toLocaleString()} of links I have updated the types (${rangeFrom} → ${rangeTo}, ${batches.length} batches).`
          : totalUpdated > 0
            ? `Updated ${totalUpdated.toLocaleString()} row(s) for ${rangeFrom} → ${rangeTo} (${batches.length} batches).`
            : `No types updated for ${rangeFrom} → ${rangeTo} (already filled or no raw_data match).`;

      appendLogs([
        '',
        logLine(`Type refresh finished · ${rangeFrom} → ${rangeTo}`),
        logLine(`Completed in ${batches.length} day-batch(es)`),
        logLine(`Total rows=${totalUpdated.toLocaleString()}, links=${totalLinks.toLocaleString()}`),
        ...batchSummaries.map(
          (b) =>
            `  ${b.from} → ${b.to}  ·  rows ${b.updatedRows.toLocaleString()}  ·  links ${b.linksUpdated.toLocaleString()}`
        ),
        logLine(summary),
      ]);
      setRefreshMsg(summary);
    } catch (err) {
      const msg = err?.message || 'Failed to refresh custom types.';
      appendLogs(logLine(`ERROR: ${msg}`));
      setLocalError(msg);
    } finally {
      setRefreshing(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLocalError(null);
    setRefreshMsg(null);
    if (!form.customerName?.trim()) {
      setLocalError('Dealer name is required.');
      return;
    }
    if (!form.hootUrl?.trim()) {
      setLocalError('Hoot URL is required.');
      return;
    }
    if (!form.ga4CustomerId?.trim()) {
      setLocalError('GA4 customer ID is required.');
      return;
    }
    if (!form.ga4PropertyId?.trim()) {
      setLocalError('GA4 property ID is required.');
      return;
    }
    try {
      await onSave(form);
    } catch (err) {
      setLocalError(err?.message || 'Save failed.');
    }
  };

  const refreshButton = canRefresh ? (
    <button
      type="button"
      className="ga4-count-export-btn dealers-raw-key-refresh"
      onClick={handleRefreshCustomType}
      disabled={refreshing || saving}
      title="Map inv_custom_type in 1-day batches (Step 1-style pause between days)"
    >
      {refreshing ? 'Refreshing…' : 'Refresh types'}
    </button>
  ) : null;

  return (
    <div className="vdp-logics-modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="vdp-logics-modal dealers-modal"
        role="dialog"
        aria-labelledby="dealers-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="vdp-logics-modal-head">
          <h2 id="dealers-modal-title">
            {mode === 'edit' ? 'Edit dealer' : 'Add dealer'}
          </h2>
          <button type="button" className="vdp-logics-modal-close" onClick={onClose}>
            ×
          </button>
        </header>

        <form className="vdp-logics-modal-form" onSubmit={handleSubmit}>
          <p className="dealers-modal-hint">
            Saves to <code>smart_hoot_config</code> and <code>smart_ga4_config</code>.
            GA4 customer ID must match <code>client_id</code>.
          </p>

          <h3 className="dealers-section-title">Dealer (Hoot)</h3>
          <div className="vdp-logics-modal-grid">
            {HOOT_FIELDS.map((f) => (
              <FieldInput
                key={f.key}
                field={f}
                form={form}
                setForm={setForm}
                extra={f.key === 'invTypeRawKey' ? refreshButton : null}
              />
            ))}
          </div>

          {canRefresh && (
            <div className="dealers-refresh-range">
              <label className="dealers-field">
                <span className="admin-date-label">Type refresh from</span>
                <input
                  type="date"
                  className="admin-date-input"
                  value={refreshFrom}
                  onChange={(e) => setRefreshFrom(e.target.value)}
                  disabled={refreshing}
                />
              </label>
              <label className="dealers-field">
                <span className="admin-date-label">Type refresh to</span>
                <input
                  type="date"
                  className="admin-date-input"
                  value={refreshTo}
                  onChange={(e) => setRefreshTo(e.target.value)}
                  disabled={refreshing}
                />
              </label>
              <p className="dealers-modal-hint dealers-refresh-range-hint">
                Step 1-style batching: <strong>1 day per batch</strong> with a{' '}
                {PAUSE_BETWEEN_BATCHES_MS / 1000}s pause (avoids statement timeout on large
                dealers). Re-run with the correct key to <strong>overwrite</strong> a mistaken
                refresh — clears rows that no longer resolve. Does not change pipeline.
              </p>
            </div>
          )}

          {(refreshing || refreshLogs.length > 0) && (
            <div className="dealers-refresh-log" aria-live="polite">
              <div className="dealers-refresh-log-head">
                Refresh log {refreshing ? '(running…)' : ''}
              </div>
              <pre className="dealers-refresh-log-body">
                {refreshLogs.join('\n') || 'Starting…'}
              </pre>
            </div>
          )}

          {mode === 'edit' && (
            <DealerLocationsSection
              dealerId={dealerId}
              ga4CustomerId={form.ga4CustomerId}
            />
          )}

          <h3 className="dealers-section-title">GA4</h3>
          <div className="vdp-logics-modal-grid">
            {GA4_FIELDS.map((f) => (
              <FieldInput key={f.key} field={f} form={form} setForm={setForm} />
            ))}
          </div>

          {localError && <p className="ga4-count-error-text">{localError}</p>}
          {refreshMsg && !localError && (
            <p className="dealers-refresh-success">{refreshMsg}</p>
          )}

          <footer className="vdp-logics-modal-foot">
            <button type="button" className="ga4-count-export-btn" onClick={onClose}>
              Cancel
            </button>
            <button
              type="submit"
              className="ga4-count-export-btn vdp-logics-btn-primary"
              disabled={saving || refreshing}
            >
              {saving ? 'Saving…' : mode === 'edit' ? 'Save changes' : 'Add dealer'}
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
}
