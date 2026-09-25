import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { resolve } from 'path';

function loadEnv() {
  const raw = readFileSync(resolve('.env.local'), 'utf8');
  const env = {};
  for (const line of raw.split('\n')) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m) env[m[1].trim()] = m[2].trim();
  }
  return env;
}

async function test(label, url, key) {
  const sb = createClient(url, key, { auth: { persistSession: false } });
  const dealers = await sb
    .from('smart_hoot_config')
    .select('id, customer_name, ga4_customer_id')
    .eq('is_active', true)
    .limit(5);
  console.log(`\n=== ${label} ===`);
  console.log('dealers:', dealers.error?.message ?? `ok count=${dealers.data?.length ?? 0}`);
  if (dealers.data?.[0]) console.log('sample dealer:', dealers.data[0]);

  const page = await sb
    .from('smart_ga4_page_data')
    .select('client_id, report_date, views')
    .gte('report_date', '2026-05-22')
    .lte('report_date', '2026-05-31')
    .limit(5);
  console.log('page_data:', page.error?.message ?? `ok count=${page.data?.length ?? 0}`);
  if (page.data?.[0]) console.log('sample page row:', page.data[0]);

  const cid = dealers.data?.find((d) => d.ga4_customer_id)?.ga4_customer_id;
  if (cid) {
    const clientId = String(cid).trim();
    const rpc = await sb.rpc('get_ga4_overview', {
      p_client_id: clientId,
      p_from: '2026-05-22',
      p_to: '2026-05-31',
    });
    console.log('rpc:', rpc.error?.message ?? `ok rows=${rpc.data?.length ?? 0}`);
    if (rpc.data?.[0]) console.log('sample rpc row:', rpc.data[0]);
  }
}

const env = loadEnv();
const url = env.NEXT_PUBLIC_SUPABASE_URL;
await test('ANON', url, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
if (env.SUPABASE_SERVICE_ROLE_KEY) {
  await test('SERVICE', url, env.SUPABASE_SERVICE_ROLE_KEY);
}
