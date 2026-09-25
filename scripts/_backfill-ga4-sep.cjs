const path = require('path');
const fs = require('fs');
const { createJiti } = require('jiti');

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
loadEnv(path.join(process.cwd(), '.env'));

const jiti = createJiti(__filename, {
  alias: {
    '@': path.join(process.cwd(), 'src'),
  },
});

async function main() {
  const { createClient } = require('@supabase/supabase-js');
  const { syncGa4PageDataForDealer } = jiti(
    path.join(process.cwd(), 'src/lib/pipeline/ga4PageSync.js')
  );
  const { runVdpFiltration, runFinalVdpSync } = jiti(
    path.join(process.cwd(), 'src/lib/pipeline/pipelineRpc.js')
  );

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing Supabase env');

  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const clientId = process.argv[2] || '8749374349';
  const from = process.argv[3] || '2026-09-11';
  const to = process.argv[4] || '2026-09-14';

  console.log(`Backfill ${clientId} ${from} → ${to}`);

  console.log('Step 1: GA4 page sync...');
  const step1 = await syncGa4PageDataForDealer(supabase, {
    clientId,
    dateFrom: from,
    dateTo: to,
  });
  console.log((step1.log || []).slice(-20).join('\n'));

  console.log('Step 2: VDP filtration...');
  const step2 = await runVdpFiltration(supabase, clientId, { from, to });
  console.log((step2.log || []).join('\n'));

  console.log('Step 3: Final data...');
  const step3 = await runFinalVdpSync(supabase, clientId, { from, to });
  console.log((step3.log || []).join('\n'));

  console.log('Done.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
