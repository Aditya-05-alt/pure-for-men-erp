/**
 * One-time backfill: daily site KPIs into chipper_pfm_ga4_daily.
 * Metrics: total_users, new_users, conversions, revenue (NO returning users).
 * Does NOT touch chipper_pfm_ga4_data (page raw).
 *
 * Usage: node scripts/backfill-pfm-ga4-daily.cjs [from] [to]
 * Default: 2026-08-01 → 2026-09-25
 */
const fs = require('fs');
const path = require('path');
const { JWT } = require('google-auth-library');

const CLIENT_ID = '001';
const PROPERTY_ID = '387861212';
const ACCOUNT_NAME = 'Pure for Men';

function loadGcpJson(envPath) {
  const t = fs.readFileSync(envPath, 'utf8');
  const start = t.indexOf('GCP_SERVICE_ACCOUNT_JSON');
  if (start < 0) throw new Error('GCP_SERVICE_ACCOUNT_JSON not found in .env.local');
  const after = t.slice(start);
  const brace = after.indexOf('{');
  let depth = 0;
  let end = -1;
  for (let i = brace; i < after.length; i++) {
    if (after[i] === '{') depth++;
    else if (after[i] === '}') {
      depth--;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  if (end < 0) throw new Error('Could not parse GCP JSON block');
  return JSON.parse(after.slice(brace, end + 1));
}

function ymdFromGa4(raw) {
  // GA4 date dimension: YYYYMMDD
  const s = String(raw || '');
  if (/^\d{8}$/.test(s)) {
    return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
  }
  return s.slice(0, 10);
}

async function main() {
  const from = process.argv[2] || '2026-08-01';
  const to = process.argv[3] || '2026-09-25';
  const outPath = path.join(
    process.cwd(),
    'exports',
    `pfm-ga4-daily-${from}_${to}.json`
  );

  const sa = loadGcpJson(path.join(process.cwd(), '.env.local'));
  const auth = new JWT({
    email: sa.client_email,
    key: sa.private_key,
    scopes: ['https://www.googleapis.com/auth/analytics.readonly'],
  });
  const { token } = await auth.getAccessToken();
  if (!token) throw new Error('Failed to get GA4 access token');

  // Prefer purchaseRevenue; also request totalRevenue as fallback via second call if needed.
  const body = {
    dateRanges: [{ startDate: from, endDate: to }],
    dimensions: [{ name: 'date' }],
    metrics: [
      { name: 'totalUsers' },
      { name: 'newUsers' },
      { name: 'conversions' },
      { name: 'purchaseRevenue' },
    ],
    orderBys: [{ dimension: { dimensionName: 'date' } }],
    limit: 10000,
  };

  const url = `https://analyticsdata.googleapis.com/v1beta/properties/${PROPERTY_ID}:runReport`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`GA4 ${res.status}: ${txt.slice(0, 500)}`);
  }

  const json = await res.json();
  const rows = (json.rows || []).map((row) => {
    const dv = row.dimensionValues || [];
    const mv = row.metricValues || [];
    return {
      client_id: CLIENT_ID,
      report_date: ymdFromGa4(dv[0]?.value),
      ga4_property_id: PROPERTY_ID,
      account_name: ACCOUNT_NAME,
      total_users: parseInt(mv[0]?.value || '0', 10) || 0,
      new_users: parseInt(mv[1]?.value || '0', 10) || 0,
      conversions: Number(mv[2]?.value || '0') || 0,
      revenue: Number(mv[3]?.value || '0') || 0,
    };
  });

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify({ from, to, rows }, null, 2));

  const sum = rows.reduce(
    (a, r) => {
      a.users += r.total_users;
      a.newUsers += r.new_users;
      a.conversions += r.conversions;
      a.revenue += r.revenue;
      return a;
    },
    { users: 0, newUsers: 0, conversions: 0, revenue: 0 }
  );

  console.log(
    JSON.stringify(
      {
        ok: true,
        days: rows.length,
        from,
        to,
        outPath,
        sample: rows.slice(0, 2),
        totals: sum,
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
