#!/usr/bin/env node
/**
 * Daily scrap inventory worker.
 *
 * Env:
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   SCRAP_CLIENT_ID (optional — single dealer)
 *   SCRAP_REPORT_DATE (optional — YYYY-MM-DD, default today)
 *   SCRAP_CONCURRENCY (optional, default 2)
 *
 * Cron example (6 AM daily):
 *   0 6 * * * cd /path/to/workers/scrap-inventory && npm start >> /var/log/scrap-inventory.log 2>&1
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadEnvFile() {
  try {
    const raw = readFileSync(join(__dirname, '.env'), 'utf8');
    for (const line of raw.split('\n')) {
      const t = line.trim();
      if (!t || t.startsWith('#')) continue;
      const i = t.indexOf('=');
      if (i < 1) continue;
      const key = t.slice(0, i).trim();
      const val = t.slice(i + 1).trim().replace(/^["']|["']$/g, '');
      if (!process.env[key]) process.env[key] = val;
    }
  } catch {
    /* optional .env */
  }
}

loadEnvFile();

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const clientArg = process.argv.find((a) => a.startsWith('--client-id='));
const clientId = clientArg?.split('=')[1] || process.env.SCRAP_CLIENT_ID || null;
const reportDate =
  process.env.SCRAP_REPORT_DATE || new Date().toISOString().slice(0, 10);
const concurrency = Number(process.env.SCRAP_CONCURRENCY) || 2;

if (!url || !key) {
  console.error('Missing SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const USER_AGENT =
  'SmartAnalyticsScraper/1.0 (+https://smartanalytics.app; inventory sync)';

async function fetchScrapDealers() {
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
      /* skip */
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

async function scrapeDealer(dealer) {
  const listUrl = dealer.scrap_link;
  if (!listUrl?.trim()) throw new Error('Missing scrap_link');

  const res = await fetch(listUrl, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'text/html' },
    redirect: 'follow',
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  const html = await res.text();
  const links = extractLinks(html, listUrl);
  const vdpUrls = links.filter((u) => pathMatchesVdpLogic(u, dealer.vdp_logic));
  const now = new Date().toISOString();

  return vdpUrls.map((u) => ({
    ...guessFromUrl(u),
    url: u,
    source_list_url: listUrl,
    first_seen: now,
    last_seen: now,
  }));
}

async function upsertBatch(ga4Id, rows) {
  const runId = crypto.randomUUID();
  const { data, error } = await supabase.rpc('upsert_scrap_inventory_batch', {
    p_rows: rows,
    p_client_id: ga4Id,
    p_report_date: reportDate,
    p_scrape_run_id: runId,
  });
  if (error) throw new Error(error.message);
  return data?.[0] || { upserted_count: rows.length, scrape_run_id: runId };
}

async function main() {
  const dealers = await fetchScrapDealers();
  console.log(`Scrap sync: ${dealers.length} dealer(s) · report_date=${reportDate}`);

  const queue = [...dealers];
  const results = [];

  async function worker() {
    while (queue.length) {
      const dealer = queue.shift();
      if (!dealer) break;
      const ga4Id = String(dealer.ga4_customer_id).trim();
      try {
        const rows = await scrapeDealer(dealer);
        const up = await upsertBatch(ga4Id, rows);
        console.log(
          `OK ${dealer.customer_name}: ${rows.length} VDP URLs · upserted ${up.upserted_count}`
        );
        results.push({ ok: true, dealer: dealer.customer_name, count: rows.length });
      } catch (err) {
        console.error(`FAIL ${dealer.customer_name}:`, err.message);
        results.push({ ok: false, dealer: dealer.customer_name, error: err.message });
      }
    }
  }

  const pool = Math.max(1, Math.min(concurrency, dealers.length || 1));
  await Promise.all(Array.from({ length: pool }, () => worker()));

  const failed = results.filter((r) => !r.ok);
  if (failed.length) {
    console.error(`${failed.length} dealer(s) failed`);
    process.exit(1);
  }
  console.log('Scrap sync complete');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
