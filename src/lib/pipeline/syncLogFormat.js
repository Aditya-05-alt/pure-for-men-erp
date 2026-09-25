import { coerceDateRange } from '@/lib/pipeline/dates';

function ts() {
  return new Date().toLocaleTimeString();
}

export function logLine(message) {
  return `[${ts()}] ${message}`;
}

export const STEP1_BATCH_SIZE = 5;

/** Merge multiple batch sync API responses into one result for the UI. */
export function mergeStep1PageSyncResults(batchResults, from, to) {
  const { dates } = coerceDateRange(from, to);
  const dayResults = [];
  let rowsInserted = 0;
  let accountName = null;
  let clientId = null;
  let dealerError = null;

  for (const res of batchResults) {
    if (!res) continue;
    if (res.accountName) accountName = res.accountName;
    if (res.clientId) clientId = res.clientId;
    rowsInserted += Number(res.rowsInserted) || 0;
    dayResults.push(...(res.dayResults || []));
    if (res.error && !dealerError) dealerError = res.error;
  }

  const okCount = dayResults.filter((d) => d.status === 'ok').length;
  const complete = okCount === dates.length && dates.length > 0 && !dealerError;

  return {
    success: rowsInserted > 0 || okCount > 0,
    complete,
    accountName,
    clientId,
    rowsInserted,
    daysProcessed: okCount,
    daysPending: dates.length,
    dayResults,
    error: dealerError,
    batched: true,
    batchCount: batchResults.length,
  };
}

/** Live log while batching (updates after each 5-day chunk). */
export function formatStep1BatchProgressLog(
  from,
  to,
  { dayResults = [], batchIndex = 0, batchTotal = 0, batchLabel = '', pausing = false } = {}
) {
  const { from: f, to: t, dates } = coerceDateRange(from, to);
  const byDate = new Map(dayResults.map((d) => [d.date, d]));

  const lines = [
    logLine(`Step 1 — GA4 page sync · ${f} → ${t}`),
    logLine(`Batches of ${STEP1_BATCH_SIZE} days · ${batchTotal} batch(es) total`),
  ];

  if (batchIndex > 0 && batchLabel) {
    lines.push(
      logLine(
        pausing
          ? `Batch ${batchIndex}/${batchTotal} done (${batchLabel}) — pausing before next…`
          : `Running batch ${batchIndex}/${batchTotal}: ${batchLabel}`
      )
    );
  }

  lines.push('', '── Day by day (report_date) ──');

  for (const date of dates) {
    const row = byDate.get(date);
    if (!row) {
      lines.push(`  ${date}  ·  pending…`);
    } else if (row.status === 'ok') {
      lines.push(
        `  ${date}  ·  OK  ·  ${(row.rows || 0).toLocaleString()} rows → smart_ga4_page_data`
      );
    } else {
      lines.push(`  ${date}  ·  ERROR  ·  ${row.error || 'failed'}`);
    }
  }

  const okCount = dayResults.filter((d) => d.status === 'ok').length;
  lines.push('');
  lines.push(logLine(`Progress: ${okCount}/${dates.length} days OK`));

  return lines;
}

/** Lines shown when Step 1 batching starts. */
export function formatStep1WaitingLog(from, to) {
  const { from: f, to: t, dates } = coerceDateRange(from, to);
  const batchTotal = Math.ceil(dates.length / STEP1_BATCH_SIZE) || 0;
  return formatStep1BatchProgressLog(from, to, {
    dayResults: [],
    batchIndex: 0,
    batchTotal,
    batchLabel: '',
  }).concat([
    '',
    logLine(`Starting batch 1/${batchTotal} (${STEP1_BATCH_SIZE} days per request)…`),
  ]);
}

/** Day-by-day result after Step 1 completes. */
export function formatStep1DayByDayLog(from, to, result) {
  const { from: f, to: t, dates } = coerceDateRange(from, to);
  const byDate = new Map((result?.dayResults || []).map((d) => [d.date, d]));

  const lines = [
    logLine(`Step 1 finished · ${f} → ${t}`),
    '',
    '── Day by day (report_date) ──',
  ];

  for (const date of dates) {
    const row = byDate.get(date);
    if (!row) {
      lines.push(`  ${date}  ·  MISSING  ·  not processed (timeout or stopped early)`);
    } else if (row.status === 'ok') {
      lines.push(
        `  ${date}  ·  OK  ·  ${(row.rows || 0).toLocaleString()} rows → smart_ga4_page_data`
      );
    } else {
      lines.push(`  ${date}  ·  ERROR  ·  ${row.error || 'failed'}`);
    }
  }

  const okCount = (result?.dayResults || []).filter((d) => d.status === 'ok').length;
  lines.push('');
  lines.push(
    logLine(
      `Summary: ${okCount}/${dates.length} days OK · ${(result?.rowsInserted || 0).toLocaleString()} total rows`
    )
  );

  if (result?.batched) {
    lines.push(logLine(`Completed in ${result.batchCount} batch(es) of ${STEP1_BATCH_SIZE} days`));
  }

  if (result?.complete === false) {
    lines.push(logLine('Partial run — re-run Step 1 for missing days or check errors above'));
  }

  return lines;
}

export function formatStep2Log(clientId, result, from, to) {
  const rangeFrom = result?.from || from;
  const rangeTo = result?.to || to;
  const range =
    rangeFrom && rangeTo ? ` · range ${rangeFrom} → ${rangeTo}` : '';
  const lines = [
    logLine(`Step 2 — apply_vdp_filtration_range · client ${clientId}${range}`),
    '',
    '── Result ──',
  ];
  for (const row of result?.processed || []) {
    lines.push(
      `  ${row.accountName} · CMS ${row.cms} · ${(row.rowsUpdated || 0).toLocaleString()} rows updated`
    );
  }
  lines.push('');
  lines.push(
    logLine(`Total: ${(result?.totalRowsUpdated || 0).toLocaleString()} rows (vdp_conditions on page data)`)
  );
  return lines;
}

export function formatStep3DayByDayLog(from, to, result) {
  const { from: f, to: t, dates } = coerceDateRange(from, to);
  const rpcLabel = result?.rpcUsed || 'build_smart_final_data';
  const lines = [
    logLine(`Step 3 — ${rpcLabel} · ${f} → ${t}`),
    result?.rpcMode === 'date_range'
      ? logLine('Using exact date range (p_date_from / p_date_to)')
      : logLine('Using legacy p_days_back — deploy updated RPC for exact dates'),
    '',
    '── Dealer summary ──',
  ];

  for (const row of result?.summary || []) {
    lines.push(
      `  ${row.accountName || row.clientId} · CMS ${row.cms || '—'} · ${(row.totalRows || 0).toLocaleString()} rows · matched ${(row.vdpRows || 0).toLocaleString()}`
    );
  }

  lines.push('');
  lines.push(
    logLine(
      `Total: ${(result?.totalRows || 0).toLocaleString()} rows in smart_final_data · ${(result?.totalVdpTrue || 0).toLocaleString()} inventory matched`
    )
  );
  lines.push('');
  lines.push(`── Your selected days (${dates.length}) ──`);
  lines.push('  Refresh tables below to see views per report_date.');
  for (const date of dates) {
    lines.push(`  ${date}  ·  see Final VDP column after refresh`);
  }

  return lines;
}
