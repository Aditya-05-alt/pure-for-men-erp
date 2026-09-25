import { randomUUID } from 'crypto';
import { createClient } from '@supabase/supabase-js';

const USER_AGENT =
  'SmartAnalyticsScraper/1.0 (+https://smartanalytics.app; inventory sync)';

export function createScrapSupabase(url, serviceKey) {
  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function fetchScrapDealers(supabase, clientId = null) {
  const { data, error } = await supabase.rpc('get_scrap_dealers_for_sync', {
    p_client_id: clientId,
  });
  if (error) throw new Error(error.message);
  return data || [];
}

function extractLinks(html, baseUrl) {
  const links = new Set();
  const hrefRe = /href=["']([^"'#]+)["']/gi;
  let match;
  while ((match = hrefRe.exec(html)) !== null) {
    try {
      const abs = new URL(match[1], baseUrl).href;
      if (abs.startsWith('http')) links.add(abs.split('#')[0]);
    } catch {
      /* skip invalid */
    }
  }
  return [...links];
}

function pathMatchesVdpLogic(url, vdpLogic) {
  if (!vdpLogic?.trim()) {
    return /\/(inventory|vehicle|vdp|used|new)\//i.test(url);
  }
  const patterns = String(vdpLogic)
    .split(/\s+OR\s+/i)
    .map((p) => p.trim())
    .filter(Boolean);
  let path;
  try {
    path = new URL(url).pathname;
  } catch {
    return false;
  }
  return patterns.some((pat) => {
    try {
      return new RegExp(pat, 'i').test(path) || new RegExp(pat, 'i').test(url);
    } catch {
      return path.includes(pat.replace(/^\//, ''));
    }
  });
}

function guessFromUrl(url) {
  const out = { url, condition: null, year: null, make: null, model: null };
  const yearMatch = url.match(/\/(20\d{2}|19\d{2})\//);
  if (yearMatch) out.year = Number(yearMatch[1]);
  if (/new/i.test(url)) out.condition = 'New';
  if (/used|pre-?owned/i.test(url)) out.condition = 'Used';
  return out;
}

export async function scrapeDealerListPage(dealer) {
  const scrapRaw = String(dealer.scrap_link || dealer.scrapLink || '').trim();
  const websiteUrl = String(dealer.website_url || dealer.websiteUrl || '').trim();
  const listUrl = /^https?:\/\//i.test(scrapRaw)
    ? scrapRaw
    : scrapRaw.toLowerCase() === 'on' && /^https?:\/\//i.test(websiteUrl)
      ? websiteUrl
      : null;

  if (!listUrl) {
    throw new Error(
      `Missing scrap list URL for ${dealer.customer_name || dealer.name} (set website_url or legacy scrap_link URL)`
    );
  }

  const res = await fetch(listUrl, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'text/html' },
    redirect: 'follow',
  });
  if (!res.ok) {
    throw new Error(`Scrap fetch failed (${res.status}) for ${listUrl}`);
  }

  const html = await res.text();
  const links = extractLinks(html, listUrl);
  const vdpLogic = dealer.vdp_logic || dealer.vdpLogic || '';
  const vdpUrls = links.filter((u) => pathMatchesVdpLogic(u, vdpLogic));

  const now = new Date().toISOString();
  return vdpUrls.map((url) => ({
    ...guessFromUrl(url),
    url,
    source_list_url: listUrl,
    first_seen: now,
    last_seen: now,
  }));
}

export async function upsertScrapBatch(supabase, clientId, rows, reportDate) {
  const { data, error } = await supabase.rpc('upsert_scrap_inventory_batch', {
    p_rows: rows,
    p_client_id: clientId,
    p_report_date: reportDate || new Date().toISOString().slice(0, 10),
    p_scrape_run_id: randomUUID(),
  });
  if (error) throw new Error(error.message);
  const row = data?.[0];
  return {
    upsertedCount: Number(row?.upserted_count) || rows.length,
    scrapeRunId: row?.scrape_run_id,
  };
}

export async function runScrapSyncForDealer(supabase, dealer, reportDate) {
  const clientId = String(dealer.ga4_customer_id || dealer.ga4CustomerId || '').trim();
  if (!clientId) throw new Error('Missing ga4_customer_id');

  const rows = await scrapeDealerListPage(dealer);
  const result = await upsertScrapBatch(supabase, clientId, rows, reportDate);
  return { clientId, rows, ...result };
}

export async function runScrapSyncAll(supabase, { clientId = null, reportDate = null, concurrency = 2 } = {}) {
  const dealers = await fetchScrapDealers(supabase, clientId);
  const results = [];
  const queue = [...dealers];

  async function worker() {
    while (queue.length) {
      const dealer = queue.shift();
      if (!dealer) break;
      try {
        const res = await runScrapSyncForDealer(supabase, dealer, reportDate);
        results.push({ ok: true, dealer: dealer.customer_name, ...res });
      } catch (err) {
        results.push({
          ok: false,
          dealer: dealer.customer_name,
          error: err?.message || 'Scrap failed',
        });
      }
    }
  }

  const pool = Math.max(1, Math.min(concurrency, dealers.length || 1));
  await Promise.all(Array.from({ length: pool }, () => worker()));
  return results;
}
