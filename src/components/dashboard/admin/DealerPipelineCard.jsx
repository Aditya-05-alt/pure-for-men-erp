'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  fetchPipelineViewsChunk,
  fetchPipelineWorkflow,
  mergePipelineRangeViews,
  runPipelineFiltration,
  runPipelineFinalSync,
  runPipelinePageSync,
} from '@/lib/api/adminPipeline';
import { chunkDates, coerceDateRange } from '@/lib/pipeline/dates';
import PipelineSyncLog from '@/components/dashboard/admin/PipelineSyncLog';
import {
  formatStep1BatchProgressLog,
  formatStep1DayByDayLog,
  formatStep1WaitingLog,
  formatStep2Log,
  formatStep3DayByDayLog,
  logLine,
  mergeStep1PageSyncResults,
  STEP1_BATCH_SIZE,
} from '@/lib/pipeline/syncLogFormat';

const PAUSE_BETWEEN_BATCHES_MS = 2000;

/** Temporarily hide day-by-day bottom tables — set true to re-enable. */
const SHOW_PIPELINE_TABLES = false;

function PipelineSpinner({ size = 18, className = '' }) {
  return (
    <svg
      className={`pipeline-data-spinner ${className}`.trim()}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.2" strokeWidth="3" />
      <path
        d="M22 12a10 10 0 0 1-10 10"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const TABLES = [
  { key: 'ga4Page', label: 'All page views (smart_ga4_page_data)' },
  {
    key: 'ga4Filter',
    label: 'VDP filtration (smart_ga4_page_data · vdp_conditions = true)',
  },
  { key: 'finalVdp', label: 'Final VDP (smart_final_data)' },
];

function formatCell(v) {
  if (v == null) return '—';
  return Number(v).toLocaleString();
}

function formatHootCell(v) {
  if (!v) return '—';
  const matched = Number(v.matched) || 0;
  const nonMatched = Number(v.nonMatched) || 0;
  if (matched === 0 && nonMatched === 0) return '—';
  return (
    <div className="pipeline-hoot-cell">
      <div className="pipeline-hoot-row">
        <span className="pipeline-hoot-label">Matched</span>
        <span className="pipeline-hoot-val">{matched.toLocaleString()}</span>
      </div>
      <div className="pipeline-hoot-row">
        <span className="pipeline-hoot-label">Non Matched</span>
        <span className="pipeline-hoot-val">{nonMatched.toLocaleString()}</span>
      </div>
      <div className="pipeline-hoot-ratio">
        {matched.toLocaleString()} / {nonMatched.toLocaleString()}
      </div>
    </div>
  );
}

function StepResultPanel({ title, result }) {
  if (!result) return null;
  return (
    <div className="pipeline-result">
      <h4 className="pipeline-result-title">{title}</h4>
      {result.processed?.length > 0 && (
        <ul className="pipeline-result-list">
          {result.processed.map((row, i) => (
            <li key={i}>
              {row.accountName} · CMS {row.cms} ·{' '}
              {(row.rowsUpdated || 0).toLocaleString()} rows updated
            </li>
          ))}
        </ul>
      )}
      {result.summary?.length > 0 && (
        <ul className="pipeline-result-list">
          {result.summary.map((row, i) => (
            <li key={i}>
              {row.accountName || row.clientId} · total{' '}
              {(row.totalRows || 0).toLocaleString()} · VDP{' '}
              {(row.vdpRows || 0).toLocaleString()}
            </li>
          ))}
        </ul>
      )}
      {result.rowsInserted != null && (
        <p className="pipeline-step-meta">
          Total inserted: {result.rowsInserted.toLocaleString()} rows
          {result.daysProcessed != null &&
            ` · ${result.daysProcessed} day(s) processed`}
        </p>
      )}
      {result.totalRowsUpdated != null && (
        <p className="pipeline-step-meta">
          Rows updated: {result.totalRowsUpdated.toLocaleString()}
        </p>
      )}
      {result.totalRows != null && (
        <p className="pipeline-step-meta">
          Final table: {result.totalRows.toLocaleString()} rows · inventory matched VDP:{' '}
          {(result.totalVdpTrue ?? 0).toLocaleString()}
        </p>
      )}
    </div>
  );
}

export default function DealerPipelineCard({ dealer, from, to }) {
  const [stats, setStats] = useState(null);
  const [loadingWorkflow, setLoadingWorkflow] = useState(false);
  const [loadingViews, setLoadingViews] = useState(false);
  const [loadedViewDates, setLoadedViewDates] = useState(() => new Set());
  const [viewsChunkProgress, setViewsChunkProgress] = useState(null);
  const [busyStep, setBusyStep] = useState(null);
  const [error, setError] = useState(null);
  const [message, setMessage] = useState(null);
  const [step1Result, setStep1Result] = useState(null);
  const [step2Result, setStep2Result] = useState(null);
  const [step3Result, setStep3Result] = useState(null);
  const [stepLogs, setStepLogs] = useState({ 1: [], 2: [], 3: [] });
  const loadAbortRef = useRef(null);

  const clientId = dealer.ga4CustomerId;

  const setStepLog = useCallback((step, lines) => {
    setStepLogs((prev) => ({ ...prev, [step]: lines }));
  }, []);

  const appendStepLog = useCallback((step, line) => {
    setStepLogs((prev) => ({
      ...prev,
      [step]: [...(prev[step] || []), line],
    }));
  }, []);
  const wf = stats?.workflow || {};

  const loadPipelineData = useCallback(async () => {
    if (!clientId || !from || !to) return;

    loadAbortRef.current?.abort();
    const ac = new AbortController();
    loadAbortRef.current = ac;

    setLoadingWorkflow(true);
    setError(null);
    if (SHOW_PIPELINE_TABLES) {
      setLoadingViews(true);
      setLoadedViewDates(new Set());
      setViewsChunkProgress(null);
      setStats((prev) =>
        prev && prev.from === from && prev.to === to && prev.clientId === clientId
          ? { ...prev, rangeViews: {} }
          : null
      );
    }

    const { dates } = coerceDateRange(from, to);

    const loaded = new Set();
    const dayErrors = [];

    const loadViewDays = async () => {
      if (!SHOW_PIPELINE_TABLES || !dates.length) {
        setLoadingViews(false);
        return;
      }

      setViewsChunkProgress({ current: 0, total: dates.length, day: dates[0] });

      for (let i = 0; i < dates.length; i += 1) {
        if (ac.signal.aborted) return;

        const day = dates[i];
        setViewsChunkProgress({ current: i, total: dates.length, day });

        try {
          const chunk = await fetchPipelineViewsChunk({
            clientId,
            from: day,
            to: day,
            signal: ac.signal,
          });
          if (ac.signal.aborted) return;

          loaded.add(day);
          setLoadedViewDates(new Set(loaded));
          setStats((prev) => ({
            ...(prev || { clientId, from, to }),
            rangeViews: mergePipelineRangeViews(prev?.rangeViews, chunk),
          }));

          setViewsChunkProgress({ current: i + 1, total: dates.length, day });
        } catch (dayErr) {
          if (dayErr?.name === 'AbortError') return;
          dayErrors.push(`${day}: ${dayErr?.message || 'failed'}`);
          setViewsChunkProgress({ current: i + 1, total: dates.length, day });
        }
      }

      if (dayErrors.length && !ac.signal.aborted) {
        setError(
          dayErrors.length === dates.length
            ? dayErrors[0]
            : `Some days failed (${dayErrors.length}/${dates.length}). ${dayErrors[0]}`
        );
      }
    };

    try {
      if (SHOW_PIPELINE_TABLES) {
        const [workflowResult] = await Promise.allSettled([
          fetchPipelineWorkflow({ clientId, from, to, signal: ac.signal }),
          loadViewDays(),
        ]);

        if (ac.signal.aborted) return;

        if (workflowResult.status === 'fulfilled') {
          setStats((prev) => ({
            ...workflowResult.value,
            rangeViews: prev?.rangeViews ?? {},
          }));
          setLoadingWorkflow(false);
        } else if (workflowResult.reason?.name !== 'AbortError') {
          throw workflowResult.reason;
        }
      } else {
        const workflow = await fetchPipelineWorkflow({
          clientId,
          from,
          to,
          signal: ac.signal,
        });
        if (ac.signal.aborted) return;
        setStats((prev) => ({
          ...workflow,
          rangeViews: prev?.rangeViews ?? {},
        }));
        setLoadingWorkflow(false);
      }
    } catch (e) {
      if (e?.name === 'AbortError') return;
      setError(e?.message || 'Failed to load pipeline stats.');
      setStats((prev) => (prev?.rangeViews && Object.keys(prev.rangeViews).length ? prev : null));
    } finally {
      if (!ac.signal.aborted) {
        setLoadingWorkflow(false);
        setLoadingViews(false);
        setViewsChunkProgress(null);
      }
    }
  }, [clientId, from, to]);

  useEffect(() => {
    const timer = setTimeout(() => {
      loadPipelineData();
    }, 150);
    return () => {
      clearTimeout(timer);
      loadAbortRef.current?.abort();
    };
  }, [loadPipelineData]);

  useEffect(() => {
    setStep1Result(null);
    setStep2Result(null);
    setStep3Result(null);
    setStepLogs({ 1: [], 2: [], 3: [] });
  }, [clientId]);

  const runStep1 = async () => {
    if (!clientId) return;
    setBusyStep(1);
    setMessage(null);
    setError(null);

    const { dates } = coerceDateRange(from, to);
    const batches = chunkDates(dates, STEP1_BATCH_SIZE);
    const batchResults = [];
    const dayResultsAcc = [];

    setStepLog(1, formatStep1WaitingLog(from, to));

    try {
      for (let i = 0; i < batches.length; i += 1) {
        const batch = batches[i];
        const batchFrom = batch[0];
        const batchTo = batch[batch.length - 1];
        const batchLabel = `${batchFrom} → ${batchTo}`;

        setStepLog(
          1,
          formatStep1BatchProgressLog(from, to, {
            dayResults: dayResultsAcc,
            batchIndex: i + 1,
            batchTotal: batches.length,
            batchLabel,
          })
        );
        setMessage(`Step 1 — batch ${i + 1}/${batches.length}: ${batchLabel}…`);

        const res = await runPipelinePageSync({
          clientId,
          from: batchFrom,
          to: batchTo,
        });
        batchResults.push(res);
        dayResultsAcc.push(...(res.dayResults || []));

        setStepLog(
          1,
          formatStep1BatchProgressLog(from, to, {
            dayResults: dayResultsAcc,
            batchIndex: i + 1,
            batchTotal: batches.length,
            batchLabel,
            pausing: i < batches.length - 1,
          })
        );

        if (res.error) {
          setError(`Batch ${i + 1} failed: ${res.error}`);
          break;
        }

        if (i < batches.length - 1) {
          setMessage(
            `Batch ${i + 1}/${batches.length} done — pausing ${PAUSE_BETWEEN_BATCHES_MS / 1000}s before next ${STEP1_BATCH_SIZE} days…`
          );
          await sleep(PAUSE_BETWEEN_BATCHES_MS);
        }
      }

      const merged = mergeStep1PageSyncResults(batchResults, from, to);
      setStep1Result(merged);
      setStepLog(1, formatStep1DayByDayLog(from, to, merged));

      const ok = merged.dayResults?.filter((d) => d.status === 'ok').length ?? 0;
      setMessage(
        merged.complete
          ? `Applied ${from} → ${to} — ${merged.rowsInserted.toLocaleString()} rows (${batches.length} batches).`
          : `Partial — ${ok}/${dates.length} days OK · ${merged.rowsInserted.toLocaleString()} rows · see log.`
      );
      await loadPipelineData();
    } catch (e) {
      const partial = mergeStep1PageSyncResults(batchResults, from, to);
      if (partial.dayResults?.length) {
        setStep1Result(partial);
        setStepLog(1, formatStep1DayByDayLog(from, to, partial));
      }
      appendStepLog(1, logLine(`Error: ${e?.message || 'Page sync failed.'}`));
      setError(e?.message || 'Page sync failed.');
    } finally {
      setBusyStep(null);
    }
  };

  const runStep2 = async () => {
    if (!clientId) return;
    setBusyStep(2);
    setMessage(null);
    setError(null);
    setStepLog(2, [
      logLine('Step 2 — GA4 filtration started'),
      logLine('Running apply_vdp_filtration_range…'),
    ]);
    try {
      const res = await runPipelineFiltration({ clientId, from, to });
      setStep2Result(res);
      setStepLog(2, formatStep2Log(clientId, res, from, to));
      setMessage(
        `Step 2 complete — ${res.totalRowsUpdated.toLocaleString()} rows updated (vdp_conditions on smart_ga4_page_data).`
      );
      await loadPipelineData();
    } catch (e) {
      appendStepLog(2, logLine(`Error: ${e?.message || 'Filtration failed.'}`));
      setError(e?.message || 'Filtration failed.');
    } finally {
      setBusyStep(null);
    }
  };

  const runStep3 = async () => {
    if (!clientId) return;
    setBusyStep(3);
    setMessage(null);
    setError(null);
    const step3Rpc = stats?.inventory?.step3Rpc || stats?.workflow?.step3Rpc;
    setStepLog(3, [
      logLine(`Step 3 — Final VDP · ${from} → ${to}`),
      logLine(
        step3Rpc
          ? `Running ${step3Rpc}…`
          : 'Resolving inventory source (hoot vs scrap)…'
      ),
    ]);
    try {
      const res = await runPipelineFinalSync({ clientId, from, to });
      setStep3Result(res);
      setStepLog(3, formatStep3DayByDayLog(from, to, res));
      setMessage(`Step 3 complete via ${res.rpcUsed}.`);
      await loadPipelineData();
    } catch (e) {
      appendStepLog(3, logLine(`Error: ${e?.message || 'Final sync failed.'}`));
      setError(e?.message || 'Final sync failed.');
    } finally {
      setBusyStep(null);
    }
  };

  /** Table columns always match the From / To pickers exactly. */
  const selectedRange = useMemo(() => coerceDateRange(from, to), [from, to]);
  const rangeDates = selectedRange.dates;
  const views = stats?.rangeViews ?? {};

  return (
    <article className="pipeline-card">
      <header className="pipeline-card-head">
        <div>
          <h2 className="pipeline-card-title">{dealer.name}</h2>
          <p className="pipeline-card-meta">
            GA4 ID: {clientId || '—'}
            {dealer.websitePlatform ? ` · ${dealer.websitePlatform}` : ''}
          </p>
        </div>
      </header>

      {!clientId && (
        <p className="pipeline-card-warn">
          No GA4 customer ID on smart_hoot_config — map ga4_customer_id to
          smart_ga4_config.client_id.
        </p>
      )}

      <div className="pipeline-steps">
        <div className="pipeline-step">
          <div className="pipeline-step-head">
            <span className="pipeline-step-num">1</span>
            <span>Sync → smart_ga4_page_data</span>
            <span
              className={`pipeline-badge ${
                wf.hasPageData ? 'pipeline-badge--ok' : 'pipeline-badge--pending'
              }${loadingWorkflow ? ' pipeline-badge--loading' : ''}`}
            >
              {loadingWorkflow && !stats
                ? 'Checking…'
                : wf.hasPageData
                  ? 'Has data'
                  : 'Empty'}
            </span>
          </div>
          <p className="pipeline-step-desc">
            Applies the full From → To range from GA4 into smart_ga4_page_data —{' '}
            {STEP1_BATCH_SIZE} days per batch with a short pause between batches (avoids
            server timeout).
          </p>
          {stats?.coverage?.ga4Page && (
            <p className="pipeline-step-meta">
              {stats.coverage.ga4Page.filled}/{stats.coverage.ga4Page.total} days ·{' '}
              {(stats.coverage.ga4Page.rowCount || 0).toLocaleString()} rows in range
            </p>
          )}
          <div className="pipeline-step-actions">
            <button
              type="button"
              className="ga4-count-export-btn"
              disabled={!clientId || busyStep != null}
              onClick={runStep1}
            >
              {busyStep === 1 ? 'Applying…' : 'Apply date range'}
            </button>
          </div>
          <PipelineSyncLog step={1} busyStep={busyStep} lines={stepLogs[1] || []} />
          <StepResultPanel title="Step 1 — sync summary" result={step1Result} />
        </div>

        <div className="pipeline-step">
          <div className="pipeline-step-head">
            <span className="pipeline-step-num">2</span>
            <span>GA4 filtration</span>
            <span
              className={`pipeline-badge ${
                wf.hasFilterData ? 'pipeline-badge--ok' : 'pipeline-badge--pending'
              }${loadingWorkflow ? ' pipeline-badge--loading' : ''}`}
            >
              {loadingWorkflow && !stats
                ? 'Checking…'
                : wf.hasFilterData
                  ? 'Has data'
                  : 'Ready'}
            </span>
          </div>
          <p className="pipeline-step-desc">
            Runs apply_vdp_filtration_range — sets vdp_conditions on smart_ga4_page_data
            for the selected From → To range
            (VDP URL patterns).
          </p>
          {stats?.coverage?.ga4Filter && (
            <p className="pipeline-step-meta">
              {(stats.coverage.ga4Filter.rowCountInRange ?? stats.coverage.ga4Filter.rowCount ?? 0).toLocaleString()}{' '}
              classified in range
              {(stats.coverage.ga4Filter.rowCountTotal ?? 0) >
                (stats.coverage.ga4Filter.rowCountInRange ?? 0) && (
                <>
                  {' '}
                  · {(stats.coverage.ga4Filter.rowCountTotal ?? 0).toLocaleString()} total
                  classified
                </>
              )}
            </p>
          )}
          <button
            type="button"
            className="ga4-count-export-btn"
            disabled={!clientId || busyStep != null}
            onClick={runStep2}
          >
            {busyStep === 2 ? 'Running filtration…' : 'Run GA4 filtration'}
          </button>
          <PipelineSyncLog step={2} busyStep={busyStep} lines={stepLogs[2] || []} />
          <StepResultPanel title="Step 2 — filtration result" result={step2Result} />
        </div>

        <div className="pipeline-step">
          <div className="pipeline-step-head">
            <span className="pipeline-step-num">3</span>
            <span>Final VDP table</span>
            <span
              className={`pipeline-badge ${
                wf.hasFinalData ? 'pipeline-badge--ok' : 'pipeline-badge--pending'
              }${loadingWorkflow ? ' pipeline-badge--loading' : ''}`}
            >
              {loadingWorkflow && !stats
                ? 'Checking…'
                : wf.hasFinalData
                  ? 'Has data'
                  : 'Ready'}
            </span>
          </div>
          <p className="pipeline-step-desc">
            Syncs VDP rows into smart_final_data (inventory match).
            {stats?.inventory?.step3Rpc && (
              <>
                {' '}
                Uses{' '}
                <code className="pipeline-step-code">{stats.inventory.step3Rpc}</code>
                {stats.inventory.step3Reason ? (' because ' + stats.inventory.step3Reason) : ''}
                .
              </>
            )}
          </p>
          {stats?.inventory && (
            <p className="pipeline-step-meta">
              Config: smart_vdp_logic + smart_hoot_config · Inventory: smart_hoot_inventory_live + smart_scrap_inventory
              · Hoot link: {stats.inventory.hasHootLink ? 'yes' : 'no'}
              · Scrap link: {stats.inventory.hasScrapLink ? 'yes' : 'no'}
              · Hoot URL (config): {stats.inventory.hasHootUrl ? 'yes' : 'no'}
              · Hoot rows: {(stats.inventory.hootRowCount || 0).toLocaleString()}
              · Scrap rows: {(stats.inventory.scrapRowCount || 0).toLocaleString()}
            </p>
          )}
          {stats?.coverage?.finalVdp && (
            <p className="pipeline-step-meta">
              {(stats.coverage.finalVdp.rowCount || 0).toLocaleString()} rows in
              smart_final_data
            </p>
          )}
          <button
            type="button"
            className="ga4-count-export-btn"
            disabled={!clientId || busyStep != null}
            onClick={runStep3}
          >
            {busyStep === 3 ? 'Syncing final…' : 'Add to Final VDP'}
          </button>
          <PipelineSyncLog step={3} busyStep={busyStep} lines={stepLogs[3] || []} />
          <StepResultPanel title="Step 3 — final sync result" result={step3Result} />
        </div>
      </div>

      <div className="pipeline-refresh-row">
        <button
          type="button"
          className="ga4-count-page-btn"
          onClick={loadPipelineData}
          disabled={loadingWorkflow || (SHOW_PIPELINE_TABLES && loadingViews) || !clientId}
        >
          {loadingWorkflow ? (
            <>
              <PipelineSpinner size={14} />
              Refreshing…
            </>
          ) : (
            'Refresh'
          )}
        </button>
        <p className="pipeline-step-meta pipeline-refresh-hint">
          Updates step badges and coverage after sync — date range above.
        </p>
      </div>

      {error && <p className="pipeline-card-error">{error}</p>}
      {message && !error && <p className="pipeline-card-msg">{message}</p>}

      {/* Bottom day-by-day tables — temporarily disabled (SHOW_PIPELINE_TABLES) */}
      {SHOW_PIPELINE_TABLES && clientId && rangeDates.length > 0 && (
        <div className="pipeline-tables">
          <h3 className="pipeline-tables-title">
            <span>
              {selectedRange.from} → {selectedRange.to} — {rangeDates.length} day
              {rangeDates.length === 1 ? '' : 's'} (same as date range above)
            </span>
            {loadingViews && (
              <span className="pipeline-tables-loading" role="status" aria-live="polite">
                <PipelineSpinner size={16} />
                {viewsChunkProgress
                  ? `Loading day ${Math.min(viewsChunkProgress.current + 1, viewsChunkProgress.total)}/${viewsChunkProgress.total}${viewsChunkProgress.day ? ` · ${viewsChunkProgress.day}` : ''}`
                  : 'Loading data…'}
              </span>
            )}
          </h3>
          {TABLES.map((table) => (
            <div key={table.key} className="pipeline-mini-wrap">
              <h4 className="pipeline-mini-title">{table.label}</h4>
              <div className="ga4-count-scroll pipeline-mini-scroll">
                <table className="ga4-count-table ga4-count-table--pivot">
                  <thead>
                    <tr>
                      <th className="ga4-count-sticky-col">Dealer</th>
                      {rangeDates.map((d) => (
                        <th key={d}>{d}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <th className="ga4-count-sticky-col ga4-count-client" scope="row">
                        {dealer.name}
                      </th>
                      {rangeDates.map((d) => (
                        <td key={d} className="ga4-count-cell">
                          {loadingViews && !loadedViewDates.has(d) ? (
                            <span className="pipeline-cell-loading" aria-hidden="true">
                              <PipelineSpinner size={12} />
                            </span>
                          ) : (
                            formatCell(views[table.key]?.[d])
                          )}
                        </td>
                      ))}
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          ))}

          <div className="pipeline-mini-wrap">
            <h4 className="pipeline-mini-title">
              Hoot URL matching (Matched / Non Matched · vdp_conditions)
            </h4>
            <p className="pipeline-step-meta pipeline-hoot-hint">
              Sum of views · Matched = vdp_conditions true · Non Matched = false
            </p>
            <div className="ga4-count-scroll pipeline-mini-scroll pipeline-mini-scroll--hoot">
              <table className="ga4-count-table ga4-count-table--pivot">
                <thead>
                  <tr>
                    <th className="ga4-count-sticky-col">Dealer</th>
                    {rangeDates.map((d) => (
                      <th key={d}>
                        <span className="pipeline-hoot-th-date">{d}</span>
                        <span className="pipeline-hoot-th-sub">Matched / Non Matched</span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <th className="ga4-count-sticky-col ga4-count-client" scope="row">
                      {dealer.name}
                    </th>
                    {rangeDates.map((d) => (
                      <td key={d} className="ga4-count-cell ga4-count-cell--hoot">
                        {loadingViews && !loadedViewDates.has(d) ? (
                          <span className="pipeline-cell-loading" aria-hidden="true">
                            <PipelineSpinner size={12} />
                          </span>
                        ) : (
                          formatHootCell(views.hootMatch?.[d])
                        )}
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </article>
  );
}
