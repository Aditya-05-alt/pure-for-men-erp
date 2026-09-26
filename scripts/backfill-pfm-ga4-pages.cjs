/**
 * Backfill chipper_pfm_ga4_data (+ daily KPIs) for Pure for Men.
 * Invokes edge function chipper-pfm-ga4-data-sync in date chunks.
 *
 * Usage: node scripts/backfill-pfm-ga4-pages.cjs [from] [to]
 * Default: 2026-01-01 → 2026-07-31
 */
const fs = require('fs');
const path = require('path');

function loadEnv(p) {
  try {
    for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^([^#=]+)=(.*)$/);
      if (!m) continue;
      const k = m[1].trim();
      let v = m[2].trim();
      if (
        (v.startsWith('"') && v.endsWith('"')) ||
        (v.startsWith("'") && v.endsWith("'"))
      ) {
        v = v.slice(1, -1);
      }
      if (!process.env[k]) process.env[k] = v;
    }
  } catch {
    /* ignore */
  }
}

loadEnv(path.join(process.cwd(), '.env.local'));

function parseISO(s) {
  return new Date(`${s}T00:00:00Z`);
}

function toISO(d) {
  return d.toISOString().slice(0, 10);
}

function addDays(iso, n) {
  const d = parseISO(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return toISO(d);
}

function* chunkRanges(from, to, chunkDays) {
  let cur = from;
  while (cur <= to) {
    const end = addDays(cur, chunkDays - 1);
    const chunkTo = end < to ? end : to;
    yield { from: cur, to: chunkTo };
    cur = addDays(chunkTo, 1);
  }
}

async function invoke(url, anon, body) {
  const res = await fetch(`${url}/functions/v1/chipper-pfm-ga4-data-sync`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${anon}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { success: false, error: text.slice(0, 400) };
  }
  return { status: res.status, json };
}

async function main() {
  const from = process.argv[2] || '2026-01-01';
  const to = process.argv[3] || '2026-07-31';
  const chunkDays = Number(process.argv[4] || 7);
  const clientId = process.argv[5] || '001';

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL / ANON_KEY');

  console.log(
    JSON.stringify({
      start: true,
      clientId,
      from,
      to,
      chunkDays,
    })
  );

  const summary = [];
  for (const range of chunkRanges(from, to, chunkDays)) {
    let attempt = 0;
    let done = false;
    while (!done && attempt < 8) {
      attempt += 1;
      const started = Date.now();
      console.log(
        `\n=== ${range.from} → ${range.to} (attempt ${attempt}) ===`
      );
      const { status, json } = await invoke(url, anon, {
        client_id: clientId,
        date_from: range.from,
        date_to: range.to,
      });
      const elapsed = Date.now() - started;
      const row = {
        from: range.from,
        to: range.to,
        attempt,
        http: status,
        success: json.success,
        cutoff: Boolean(json.cutoff_reached),
        page_rows: json.rows_inserted ?? 0,
        daily_days: json.daily_kpi_days ?? 0,
        elapsed_ms: elapsed,
        dealer: json.dealers?.[0] || null,
        error: json.error || null,
      };
      summary.push(row);
      console.log(JSON.stringify(row, null, 2));

      if (!json.success) {
        throw new Error(json.error || `HTTP ${status}`);
      }
      // Re-run same chunk if budget cut off mid-window (markers unlock progress).
      done = !json.cutoff_reached;
      if (!done) {
        console.log('cutoff_reached — retrying same chunk for remaining days…');
      }
    }
    if (!done) {
      throw new Error(`Gave up on chunk ${range.from}→${range.to} after retries`);
    }
  }

  const out = path.join(
    process.cwd(),
    'exports',
    `pfm-page-backfill-${from}_${to}.json`
  );
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify({ from, to, summary }, null, 2));
  console.log('\nDONE', out);
  console.log(
    JSON.stringify(
      {
        chunks: summary.length,
        page_rows: summary.reduce((s, r) => s + (r.page_rows || 0), 0),
        daily_days: summary.reduce((s, r) => s + (r.daily_days || 0), 0),
      },
      null,
      2
    )
  );
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
