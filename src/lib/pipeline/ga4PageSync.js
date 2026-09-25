import { JWT } from 'google-auth-library';
import { buildVdpMatchers, classifyPage } from '@/lib/ga4/classifyPage';
import { coerceDateRange } from '@/lib/pipeline/dates';
import { loadGcpServiceAccountCredentials } from '@/lib/pipeline/gcpCredentials';

const PAGE_TABLE = 'smart_ga4_page_data';
const CONFIG_TABLE = 'smart_ga4_config';
const CHUNK_SIZE = 500;
const GLOBAL_BUDGET_MS = 130_000;
const DEALER_BUDGET_MS = 100_000;
const PAGE_SIZE = 1500;

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

function channelNorm(raw) {
  return String(raw || '')
    .toLowerCase()
    .replace(/ /g, '_')
    .replace(/\//g, '_');
}

async function getGa4Token() {
  const credentials = loadGcpServiceAccountCredentials();
  const authClient = new JWT({
    email: credentials.client_email,
    key: credentials.private_key,
    scopes: ['https://www.googleapis.com/auth/analytics.readonly'],
  });
  const { token } = await authClient.getAccessToken();
  if (!token) throw new Error('Failed to get GA4 access token');
  return token;
}

async function fetchDealerConfig(supabase, clientId) {
  let { data, error } = await supabase
    .from(CONFIG_TABLE)
    .select('client_id, ga4_property_id, account_name, is_active, vdp_url_pattern')
    .eq('is_active', true)
    .eq('client_id', clientId)
    .limit(1)
    .maybeSingle();

  if (error && /vdp_url_pattern/i.test(error.message || '')) {
    ({ data, error } = await supabase
      .from(CONFIG_TABLE)
      .select('client_id, ga4_property_id, account_name, is_active')
      .eq('is_active', true)
      .eq('client_id', clientId)
      .limit(1)
      .maybeSingle());
    if (data) data.vdp_url_pattern = null;
  }

  if (error) throw new Error(`Config fetch failed: ${error.message}`);
  if (!data) {
    throw new Error(
      `No active row in smart_ga4_config for client_id ${clientId}`
    );
  }
  return data;
}

/**
 * Sync GA4 page data into smart_ga4_page_data for one dealer (Node port of edge V30).
 */
export async function syncGa4PageDataForDealer(supabase, options) {
  const startTime = Date.now();
  const log = [];
  const L = (m) => {
    log.push(m);
  };

  const clientId = String(options.clientId || '').trim();
  const {
    from: dateFrom,
    to: dateTo,
    dates: allDates,
  } = coerceDateRange(options.dateFrom || options.from, options.dateTo || options.to);

  if (!clientId) throw new Error('clientId is required');

  const dealer = await fetchDealerConfig(supabase, clientId);
  const propertyId = String(dealer.ga4_property_id || '')
    .replace('properties/', '')
    .trim();
  const accountName = dealer.account_name || clientId;

  if (!propertyId) throw new Error('ga4_property_id missing on smart_ga4_config');

  const vdpMatchers = buildVdpMatchers(dealer.vdp_url_pattern ?? null);

  L(`=== GA4 PAGE SYNC (Node) — ${accountName} (${clientId}) ===`);
  L(`Window: ${dateFrom} → ${dateTo} (full range apply)`);

  if (!allDates.length) {
    throw new Error(
      `Invalid or empty date range (from=${String(options.dateFrom || options.from)}, to=${String(options.dateTo || options.to)})`
    );
  }

  const TOKEN = await getGa4Token();
  L('GA4 token OK');

  // Apply full range: every day in From→To is refreshed (delete + re-pull from GA4).
  const pendingDays = allDates;
  L(`Days to apply: ${pendingDays.length} (${pendingDays[0]} → ${pendingDays[pendingDays.length - 1]})`);

  const droppedInsertCols = new Set();

  async function insertResilient(rows) {
    let working = rows;
    if (droppedInsertCols.size > 0) {
      working = working.map((r) => {
        const c = { ...r };
        for (const k of droppedInsertCols) delete c[k];
        return c;
      });
    }
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const { error } = await supabase.from(PAGE_TABLE).insert(working);
      if (!error) return { inserted: working.length, error: null };
      const msg = error.message || '';
      const m = msg.match(
        /column\s+"?([a-zA-Z0-9_]+)"?\s+(?:of relation\s+\S+\s+)?does not exist/i
      );
      if (m?.[1] && !droppedInsertCols.has(m[1])) {
        droppedInsertCols.add(m[1]);
        L(`⚠️ Stripping unknown column: ${m[1]}`);
        working = working.map((r) => {
          const c = { ...r };
          delete c[m[1]];
          return c;
        });
        continue;
      }
      return { inserted: 0, error };
    }
    return { inserted: 0, error: new Error('Too many missing columns') };
  }

  let dealerRows = 0;
  let dealerDays = 0;
  let dealerError = null;
  const dayResults = [];

  for (const dateStr of pendingDays) {
    if (Date.now() - startTime > GLOBAL_BUDGET_MS) {
      L('⏱️ Global time limit');
      break;
    }

    try {
      await supabase
        .from(PAGE_TABLE)
        .delete()
        .eq('client_id', clientId)
        .eq('report_date', dateStr);

      let offset = 0;
      let hasMore = true;
      let dayRows = 0;

      while (hasMore) {
        const url = `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`;
        const res = await fetch(url, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${TOKEN}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            dateRanges: [{ startDate: dateStr, endDate: dateStr }],
            dimensions: [
              { name: 'pageLocation' },
              { name: 'pageTitle' },
              { name: 'sessionDefaultChannelGroup' },
              { name: 'sessionSource' },
              { name: 'sessionMedium' },
              { name: 'sessionCampaignName' },
            ],
            metrics: [
              { name: 'screenPageViews' },
              { name: 'totalUsers' },
              { name: 'newUsers' },
              { name: 'sessions' },
            ],
            limit: PAGE_SIZE,
            offset,
          }),
        });

        if (!res.ok) {
          const txt = await res.text();
          throw new Error(`GA4 API ${res.status}: ${txt.slice(0, 200)}`);
        }

        const r2 = await res.json();
        const rows = r2.rows || [];
        if (!rows.length) {
          hasMore = false;
          break;
        }

        const pageData = rows.map((row) => {
          const dv = row.dimensionValues;
          const mv = row.metricValues;
          const loc = dv?.[0]?.value || '';
          let path = loc;
          try {
            path = new URL(loc).pathname;
          } catch {
            path = loc;
          }
          const src = dv?.[3]?.value || '(direct)';
          const med = dv?.[4]?.value || '(none)';
          const pageType = classifyPage(loc, path, vdpMatchers);
          return {
            client_id: clientId,
            ga4_property_id: propertyId,
            account_name: accountName,
            report_date: dateStr,
            page_location: loc,
            page_path: path,
            page_title: dv?.[1]?.value || '',
            channel: channelNorm(dv?.[2]?.value),
            source: src,
            medium: med,
            source_medium: `${src} / ${med}`,
            session_campaign: dv?.[5]?.value || '(not set)',
            views: parseInt(mv?.[0]?.value || '0', 10) || 0,
            total_users: parseInt(mv?.[1]?.value || '0', 10) || 0,
            new_users: parseInt(mv?.[2]?.value || '0', 10) || 0,
            sessions: parseInt(mv?.[3]?.value || '0', 10) || 0,
            ga4_page_type: pageType,
            vdp_conditions: pageType.startsWith('VDP'),
          };
        });

        for (let j = 0; j < pageData.length; j += CHUNK_SIZE) {
          const chunk = pageData.slice(j, j + CHUNK_SIZE);
          const { inserted, error: insErr } = await insertResilient(chunk);
          if (insErr) {
            throw new Error(`Insert ${dateStr}: ${insErr.message}`);
          }
          dealerRows += inserted;
          dayRows += inserted;
          await delay(5);
        }

        if (rows.length < PAGE_SIZE) hasMore = false;
        else {
          offset += PAGE_SIZE;
          await delay(100);
        }
      }

      dealerDays += 1;
      dayResults.push({ date: dateStr, rows: dayRows, status: 'ok' });
      L(`✅ ${dateStr}: ${dayRows} rows inserted`);
    } catch (e) {
      dealerError = e.message;
      dayResults.push({ date: dateStr, rows: 0, status: 'error', error: dealerError });
      L(`❌ ${dateStr}: ${dealerError}`);
      await supabase
        .from(PAGE_TABLE)
        .delete()
        .eq('client_id', clientId)
        .eq('report_date', dateStr);

      if (/permission|403|forbidden|access denied/i.test(dealerError)) break;
    }
  }

  const complete = dealerDays === pendingDays.length && !dealerError;

  return {
    success: !dealerError || dealerRows > 0,
    complete,
    accountName,
    clientId,
    propertyId,
    window: { from: dateFrom, to: dateTo },
    rowsInserted: dealerRows,
    daysProcessed: dealerDays,
    daysPending: pendingDays.length,
    pendingDays,
    dayResults,
    error: dealerError,
    log,
    elapsedMs: Date.now() - startTime,
  };
}
