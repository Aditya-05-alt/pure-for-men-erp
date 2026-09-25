/** Pivot RPC rows into dealers × dates grid with row/column/grand totals. */
export function pivotDateWiseRows(rows, { clientIdFilter = '' } = {}) {
  const filteredRows = clientIdFilter
    ? (rows || []).filter((r) => r.client_id === clientIdFilter)
    : rows || [];

  const dateSet = new Set();
  const dealerMap = new Map();

  for (const r of filteredRows) {
    dateSet.add(r.report_date);
    const dealerName = r.account_name || r.customer_name || r.client_id;
    if (!dealerMap.has(r.client_id)) {
      dealerMap.set(r.client_id, {
        client_id: r.client_id,
        name: dealerName,
        account_name: r.account_name || null,
      });
    }
  }

  const dates = [...dateSet].sort();
  const dealers = [...dealerMap.values()].sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
  );

  const grid = {};
  const rowTotals = {};
  const colTotals = {};
  let grandTotal = 0;

  for (const r of filteredRows) {
    if (!grid[r.client_id]) grid[r.client_id] = {};
    const prev = grid[r.client_id][r.report_date];
    if (prev == null) {
      grid[r.client_id][r.report_date] = r.views;
    } else {
      grid[r.client_id][r.report_date] = prev + r.views;
    }
    rowTotals[r.client_id] = (rowTotals[r.client_id] || 0) + r.views;
    colTotals[r.report_date] = (colTotals[r.report_date] || 0) + r.views;
    grandTotal += r.views;
  }

  return { dates, dealers, grid, colTotals, rowTotals, grandTotal };
}

/** Distinct dealers for filter dropdown (from full row set). */
export function dealersForFilter(rows) {
  const map = new Map();
  for (const r of rows || []) {
    const name = r.account_name || r.customer_name || r.client_id;
    if (!map.has(r.client_id)) {
      map.set(r.client_id, { client_id: r.client_id, name });
    }
  }
  return [...map.values()].sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
  );
}

export function buildDateWiseCsv({ dates, dealers, grid, rowTotals, colTotals, grandTotal }) {
  const header = ['Dealer', ...dates, 'Total'].join(',');
  const lines = dealers.map((d) => {
    const cells = dates.map((dt) => {
      const v = grid[d.client_id]?.[dt];
      return v == null ? '' : v;
    });
    return [
      `"${String(d.name).replace(/"/g, '""')}"`,
      ...cells,
      rowTotals[d.client_id] ?? 0,
    ].join(',');
  });
  const totalRow = [
    'TOTAL',
    ...dates.map((dt) => colTotals[dt] ?? 0),
    grandTotal,
  ].join(',');
  return [header, ...lines, totalRow].join('\n');
}
