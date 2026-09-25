const PAGE_TABLE = 'smart_ga4_page_data';
const PAGE_SIZE = 5000;

export function normalizeReportDate(value) {
  if (!value) return null;
  return String(value).split('T')[0];
}

/** Sum views by client_id + report_date from page-grain rows. */
export function aggregateViewsByClientAndDate(rows) {
  const byClient = new Map();
  for (const row of rows || []) {
    const clientId = String(row.client_id ?? '').trim();
    const date = normalizeReportDate(row.report_date);
    const views = Number(row.views) || 0;
    if (!clientId || !date || views === 0) continue;

    if (!byClient.has(clientId)) byClient.set(clientId, {});
    const daily = byClient.get(clientId);
    daily[date] = (daily[date] || 0) + views;
  }
  return byClient;
}

/** Read smart_ga4_page_data for a date range (service role). */
export async function fetchPageViewsFromTable(supabase, from, to) {
  const buffer = [];
  let offset = 0;

  while (true) {
    const { data, error } = await supabase
      .from(PAGE_TABLE)
      .select('client_id, report_date, views')
      .gte('report_date', from)
      .lte('report_date', to)
      .range(offset, offset + PAGE_SIZE - 1);

    if (error) throw error;
    if (!data?.length) break;

    buffer.push(...data);
    if (data.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  return aggregateViewsByClientAndDate(buffer);
}

/** get_ga4_overview per dealer — same totals as dashboard All tab. */
export async function fetchPageViewsViaOverviewRpc(supabase, dealers, from, to) {
  const byClient = new Map();
  const withGa4 = dealers.filter((d) => d.ga4CustomerId);
  const rpcErrors = [];

  const BATCH = 12;
  for (let i = 0; i < withGa4.length; i += BATCH) {
    const chunk = withGa4.slice(i, i + BATCH);
    await Promise.all(
      chunk.map(async (dealer) => {
        const clientId = String(dealer.ga4CustomerId).trim();
        const { data, error } = await supabase.rpc('get_ga4_overview', {
          p_client_id: clientId,
          p_from: from,
          p_to: to,
        });
        if (error) {
          rpcErrors.push({ clientId, message: error.message });
          return;
        }

        const daily = {};
        for (const row of data || []) {
          const views = Number(row.views) || 0;
          if (views === 0) continue;
          const date = normalizeReportDate(row.report_date);
          if (!date) continue;
          daily[date] = (daily[date] || 0) + views;
        }
        if (Object.keys(daily).length) byClient.set(clientId, daily);
      })
    );
  }

  return { byClient, rpcErrors };
}
